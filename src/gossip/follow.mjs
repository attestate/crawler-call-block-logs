// @format
// Follows an OP Stack sequencer's block gossip the way op-node does: finds
// peers through discv5 (nodes whose ENR carries the chain's "opstack" entry),
// joins the /optimism/<chainId>/<n>/blocks gossipsub topics and validates
// every message with op-node's rules (opstack.validate) before it's accepted
// or forwarded. Each new valid block is handed to `onBlock`, and missed
// heights to `onGap`. No RPC is used.
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { Discv5 } from "@chainsafe/discv5";
import { SignableENR } from "@chainsafe/enr";
import { multiaddr } from "@multiformats/multiaddr";

import { MAX_GOSSIP_SIZE, msgId, topics, validate } from "./opstack.mjs";
import logger from "../logger.mjs";

const DIAL_TIMEOUT = 10_000;
const REDIAL_AFTER = 10 * 60_000;
const DISCOVERY_DELAY = 5_000;

// opstack.validate's results are libp2p's TopicValidatorResult values
// ("accept", "reject", "ignore"), so they're handed to gossipsub as is.
const RESULTS = new Set(["accept", "reject", "ignore"]);

// "opstack" ENR entry: uvarint chainId ‖ uvarint version.
export function opstackEntry(enr) {
  const value = enr.kvs.get("opstack");
  if (!value) return null;
  let i = 0;
  const uvarint = () => {
    let n = 0n;
    let shift = 0n;
    for (;;) {
      if (i >= value.length || shift > 63n) throw new Error("bad uvarint");
      const b = value[i++];
      n |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return n;
      shift += 7n;
    }
  };
  try {
    return { chainId: uvarint(), version: uvarint() };
  } catch {
    return null;
  }
}

export async function follow({
  network,
  onBlock = () => {},
  onGap = () => {},
  log = logger,
  udpPort = 9200,
  maxPeers = 30,
}) {
  const chainId = BigInt(network.chainId);
  const versions = topics(network.chainId);
  const counters = {
    accepted: 0,
    rejected: 0,
    ignored: 0,
    gaps: 0,
    errors: 0,
    dials: 0,
    connects: 0,
  };
  let head = null;
  let stopped = false;
  const timers = new Set();

  const privateKey = await generateKeyPair("secp256k1");
  const node = await createLibp2p({
    privateKey,
    addresses: { listen: ["/ip4/0.0.0.0/tcp/0"] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionManager: { maxConnections: maxPeers },
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub({
        globalSignaturePolicy: "StrictNoSign",
        msgIdFn: (msg) => msgId(msg.topic, msg.data),
        D: 8,
        Dlo: 6,
        Dhi: 12,
        Dlazy: 6,
        heartbeatInterval: 500,
        mcacheLength: 12,
        mcacheGossip: 3,
        seenTTL: 130_000,
        doPX: false,
        maxInboundDataLength: MAX_GOSSIP_SIZE,
      }),
    },
  });
  const pubsub = node.services.pubsub;

  // Shared across topics: block number → hashes seen at that height.
  const seen = new Map();
  // gossipsub passes the same message object to the validator and to the
  // "message" event, so the validator's decoded block is kept here.
  const accepted = new WeakMap();

  for (const [topic, version] of Object.entries(versions)) {
    pubsub.topicValidators.set(topic, async (_peer, msg) => {
      try {
        const outcome = await validate(msg.data, {
          version,
          chainId: network.chainId,
          signer: network.signer,
          previousSigner: network.previousSigner,
          jovianTime: network.jovianTime,
          seen,
        });
        const result = RESULTS.has(outcome.result) ? outcome.result : "ignore";
        if (result === "accept") {
          counters.accepted++;
          accepted.set(msg, outcome.block);
        } else if (result === "reject") {
          counters.rejected++;
          log(`gossip: rejected block on ${topic}: ${outcome.reason}`);
        } else {
          counters.ignored++;
        }
        return result;
      } catch (err) {
        counters.errors++;
        log(`gossip: validator error on ${topic}: ${err.message}`);
        return "ignore";
      }
    });
    pubsub.subscribe(topic);
  }

  const onMessage = ({ detail: msg }) => {
    const block = accepted.get(msg);
    if (!block) return;
    accepted.delete(msg);
    try {
      const number = Number(block.number);
      if (head !== null && number > head + 1) {
        counters.gaps++;
        const gap = { from: head + 1, to: number - 1 };
        log(`gossip: missed blocks ${gap.from}..${gap.to}`);
        call(onGap, gap);
      }
      if (head === null || number > head) {
        head = number;
        call(onBlock, block);
      }
    } catch (err) {
      counters.errors++;
      log(`gossip: message handler error: ${err.message}`);
    }
  };
  pubsub.addEventListener("message", onMessage);

  // Callbacks may be async; their errors are logged, never thrown into
  // libp2p's event loop.
  function call(fn, arg) {
    try {
      Promise.resolve(fn(arg)).catch((err) => {
        counters.errors++;
        log(`gossip: callback error: ${err.message}`);
      });
    } catch (err) {
      counters.errors++;
      log(`gossip: callback error: ${err.message}`);
    }
  }

  const discv5 = Discv5.create({
    enr: SignableENR.createFromPrivateKey(privateKey),
    privateKey,
    bindAddrs: { ip4: multiaddr(`/ip4/0.0.0.0/udp/${udpPort}`) },
    config: { enrUpdate: true },
  });

  const dialed = new Set();
  discv5.addListener("discovered", async (found) => {
    if (stopped) return;
    try {
      const tag = opstackEntry(found);
      if (!tag || tag.chainId !== chainId || tag.version !== 0n) return;
      const addr = found.getLocationMultiaddr("tcp");
      if (!addr) return;
      const id = found.peerId.toString();
      if (dialed.has(id)) return;
      if (node.getConnections().length >= maxPeers) return;
      dialed.add(id);
      counters.dials++;
      try {
        await node.dial(multiaddr(`${addr.toString()}/p2p/${id}`), {
          signal: AbortSignal.timeout(DIAL_TIMEOUT),
        });
        counters.connects++;
        log(`gossip: connected to ${id} at ${addr.toString()}`);
      } catch (err) {
        later(() => dialed.delete(id), REDIAL_AFTER);
      }
    } catch (err) {
      counters.errors++;
      log(`gossip: discovery error: ${err.message}`);
    }
  });

  function later(fn, ms) {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timer.unref?.();
    timers.add(timer);
    return timer;
  }

  let wake = null;
  const sleep = (ms) =>
    new Promise((resolve) => {
      wake = resolve;
      later(resolve, ms);
    });

  try {
    for (const enr of network.bootnodes ?? []) {
      try {
        discv5.addEnr(enr);
      } catch (err) {
        log(`gossip: bad bootnode ENR: ${err.message}`);
      }
    }
    await discv5.start();
  } catch (err) {
    await node.stop().catch(() => {});
    throw err;
  }
  log(
    `gossip: following chain ${network.chainId} as ${node.peerId.toString()} (udp ${
      discv5.bindAddrs[0]?.toString() ?? udpPort
    })`,
  );

  // Keep walking the DHT for peers while below maxPeers.
  const discovery = (async () => {
    while (!stopped) {
      if (node.getConnections().length < maxPeers) {
        try {
          await discv5.findRandomNode();
        } catch (err) {
          if (!stopped) log(`gossip: lookup failed: ${err.message}`);
        }
      }
      if (!stopped) await sleep(DISCOVERY_DELAY);
    }
  })();

  let stopping = null;
  return {
    stop() {
      if (stopping) return stopping;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      wake?.();
      stopping = (async () => {
        discv5.removeAllListeners("discovered");
        pubsub.removeEventListener("message", onMessage);
        await Promise.allSettled([discv5.stop(), node.stop()]);
        // A lookup in flight ends once discv5 is stopped; don't wait long.
        await Promise.race([
          discovery,
          new Promise((r) => setTimeout(r, 1000).unref?.()),
        ]);
      })();
      return stopping;
    },
    stats() {
      let mesh = 0;
      for (const topic of Object.keys(versions)) {
        mesh = Math.max(mesh, pubsub.getMeshPeers(topic).length);
      }
      return {
        peerId: node.peerId.toString(),
        peers: node.getConnections().length,
        mesh,
        known: stopped ? 0 : discv5.kadValues().length,
        head,
        ...counters,
      };
    },
  };
}
