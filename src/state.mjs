// @format
import { createPublicClient, http } from "viem";

import { rpcHttpHost } from "./hosts.mjs";
import { matches } from "./gossip/bloom.mjs";
import * as networks from "./gossip/networks.mjs";
import logger from "./logger.mjs";

export async function remote({ execute, environment }) {
  const options = {
    url: rpcHttpHost(environment),
  };

  if (environment.rpcApiKey) {
    options.headers = {
      Authorization: `Bearer ${environment.rpcApiKey}`,
    };
  }

  const outcome = await execute({
    type: "json-rpc",
    method: "eth_blockNumber",
    params: [],
    version: "0.0.1",
    options,
  });

  return parseInt(outcome.results, 16);
}

export async function local(db) {
  const key = "";
  const results = Array.from(await db.getRange(key));
  const elem = results[results.length - 1];
  if (!elem) return 0;
  const [blockNumber, _] = elem.key;
  return parseInt(blockNumber, 16);
}

export function watch({ environment, args, onNewBlock, follow, ...options }) {
  if (environment.gossip) {
    return watchGossip({ environment, args, onNewBlock, follow, ...options });
  }
  return poll({ environment, onNewBlock });
}

function client(environment) {
  // NOTE: Polling always uses the first host; only crawls rotate through
  // the list.
  return createPublicClient({
    transport: http([environment.rpcHttpHost].flat()[0]),
  });
}

function poll({ environment, onNewBlock }) {
  // NOTE: We poll eth_blockNumber instead of subscribing to newHeads via
  // WebSocket, as many providers bill every newHeads event.
  return client(environment).watchBlockNumber({
    onBlockNumber: onNewBlock,
    emitOnBegin: false,
    emitMissed: false, // the crawler scans all blocks since its last run
    poll: true,
    pollingInterval: environment.pollingInterval,
  });
}

// environment.gossip: true, a network name ("optimism") or
// { network: name | { chainId, signer, jovianTime, bootnodes }, udpPort,
// maxPeers }.
export function gossipOptions(gossip) {
  const options =
    gossip === true
      ? {}
      : typeof gossip === "string"
      ? { network: gossip }
      : { ...gossip };
  let network = options.network ?? "optimism";
  if (typeof network === "string") {
    if (!Object.hasOwn(networks, network)) {
      throw new Error(`Unknown gossip network "${network}"`);
    }
    network = networks[network];
  }
  return { ...options, network };
}

const loadFollow = async (options) =>
  (await import("./gossip/follow.mjs")).follow(options);

// Follows the sequencer's block gossip and calls onNewBlock(n) only for
// blocks whose logsBloom may hold a log matching the extractor's eth_getLogs
// filter (args.address, args.topics), or after missed blocks. The crawler
// then fetches the logs since its last scan over RPC as usual. Triggers run
// one at a time; requests that arrive meanwhile are merged into the next.
function watchGossip({
  environment,
  args = {},
  onNewBlock,
  follow = loadFollow,
  log = logger,
  lagTimeout = 60_000,
  lagInterval = 1_000,
  statsInterval = 10 * 60_000,
}) {
  const { network, udpPort, maxPeers } = gossipOptions(environment.gossip);
  const filter = { address: args?.address, topics: args?.topics ?? [] };
  const rpc = client(environment);

  let stopped = false;
  let handle = null;
  let fallback = null;
  let target = null; // highest block the next trigger has to cover
  let triggered = null; // highest block passed to onNewBlock
  let running = null;
  const timers = new Set();

  const sleep = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });

  // RPC nodes can lag the gossip by a block or two: wait until the node has
  // the block so that eth_getLogs covers it. Resolves to the highest block
  // the RPC has, up to `number` (null if it couldn't be asked).
  async function caughtUp(number) {
    const deadline = Date.now() + lagTimeout;
    let head = null;
    for (;;) {
      try {
        head = Number(await rpc.getBlockNumber({ cacheTime: 0 }));
        if (head >= number) return number;
      } catch (err) {
        log(`gossip: eth_blockNumber failed: ${err.message}`);
      }
      if (stopped || Date.now() >= deadline) return head;
      await sleep(lagInterval);
    }
  }

  // NOTE: The crawler scans up to the block it's given and continues from
  // there next time, so a block is only passed on once the RPC has it. If
  // the RPC stays behind, we scan up to its head and keep waiting for the
  // rest, instead of skipping blocks it didn't have yet.
  async function drain() {
    while (!stopped && target !== null && (triggered ?? -1) < target) {
      const number = target;
      const reached = await caughtUp(number);
      if (stopped) return;
      if (reached === null || reached <= (triggered ?? -1)) {
        log(`gossip: RPC is behind block ${number}, waiting`);
        continue;
      }
      if (reached < number) {
        log(`gossip: RPC is at block ${reached}, behind ${number}; scanning to ${reached} for now`);
      }
      triggered = reached;
      try {
        await onNewBlock(BigInt(reached));
      } catch (err) {
        log(`gossip: onNewBlock(${reached}) failed: ${err.message}`);
      }
    }
  }

  function request(number) {
    if (stopped) return;
    if (target === null || number > target) target = number;
    if (!running) running = drain().finally(() => (running = null));
  }

  function onBlock(block) {
    if (!matches(block.logsBloom, filter)) return;
    log(`gossip: block ${block.number} (${block.hash}) may hold matching logs`);
    request(Number(block.number));
  }

  function onGap({ from, to }) {
    log(`gossip: missed blocks ${from}..${to}, scanning to ${to}`);
    request(Number(to));
  }

  const stats = setInterval(() => {
    if (handle) log(`gossip: ${JSON.stringify(handle.stats())}`);
  }, statsInterval);
  stats.unref?.();

  const started = Promise.resolve()
    .then(() => follow({ network, udpPort, maxPeers, onBlock, onGap, log }))
    .then(async (followed) => {
      if (stopped) return await followed.stop();
      handle = followed;
    })
    .catch((err) => {
      if (stopped) return;
      log(
        `gossip: couldn't join the gossip network (${err.message}), polling eth_blockNumber instead`
      );
      fallback = poll({ environment, onNewBlock });
    });

  return function unwatch() {
    stopped = true;
    clearInterval(stats);
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    fallback?.();
    return started.then(() => handle?.stop());
  };
}
