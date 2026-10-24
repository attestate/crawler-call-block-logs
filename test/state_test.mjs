//@format
import { rm } from "fs/promises";
import { createServer } from "http";

import test from "ava";
import { open } from "lmdb";
import { hexToBytes, keccak256, toBytes } from "viem";

import { state, loader } from "../src/index.mjs";

test("retrieving last value from local db", async (t) => {
  let key = ["0x103c8ce", "0xac"];
  key = loader.serialize(key);
  const value = "0xab";

  const path = "./testdb";
  const db = new open({ path });
  await db.put(key, value);

  const result = await state.local(db);
  t.is(result, 17025230);

  await rm(path, { recursive: true });
});

test("watch polls eth_blockNumber over HTTP", async (t) => {
  let block = 0x100;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { id, method } = JSON.parse(body);
      t.is(method, "eth_blockNumber");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: `0x${(block++).toString(16)}` }));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const blocks = [];
  await new Promise((resolve) => {
    const unwatch = state.watch({
      environment: {
        rpcHttpHost: `http://127.0.0.1:${port}`,
        pollingInterval: 50,
      },
      onNewBlock: (blockNumber) => {
        blocks.push(blockNumber);
        if (blocks.length === 2) {
          unwatch();
          resolve();
        }
      },
    });
  });
  server.close();

  t.true(blocks[1] > blocks[0]);
});


test("watch always polls the first host of a list", async (t) => {
  const hits = [];
  const servers = await Promise.all(
    ["first", "second"].map(
      (name) =>
        new Promise((resolve) => {
          const server = createServer((req, res) => {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              hits.push(name);
              const { id } = JSON.parse(body);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ jsonrpc: "2.0", id, result: `0x${(0x100 + hits.length).toString(16)}` }));
            });
          });
          server.listen(0, () => resolve(server));
        }),
    ),
  );
  const environment = {
    rpcHttpHost: servers.map((s) => `http://127.0.0.1:${s.address().port}`),
    pollingInterval: 50,
  };

  await new Promise((resolve) => {
    let calls = 0;
    const unwatch = state.watch({
      environment,
      onNewBlock: () => {
        if (++calls === 3) {
          unwatch();
          resolve();
        }
      },
    });
  });
  servers.forEach((s) => s.close());

  t.true(hits.length >= 3);
  t.true(hits.every((name) => name === "first"));
});

// A logsBloom with the three bits of each value set, as in a block header.
function bloomOf(...values) {
  const bloom = new Uint8Array(256);
  for (const value of values) {
    const hash = hexToBytes(keccak256(value));
    for (let i = 0; i < 6; i += 2) {
      const bit = ((hash[i] << 8) | hash[i + 1]) & 2047;
      bloom[255 - (bit >> 3)] |= 1 << (bit & 7);
    }
  }
  return bloom;
}

const address = "0x1111111111111111111111111111111111111111";
const topic = keccak256(toBytes("Transfer(address,address,uint256)"));
const args = { start: 0, address, topics: [topic], blockspan: 1000 };

// An eth_blockNumber endpoint whose head the test moves.
async function rpcNode(head) {
  const node = { head, calls: 0 };
  node.server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      node.calls++;
      const { id } = JSON.parse(body);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id, result: `0x${node.head.toString(16)}` }),
      );
    });
  });
  await new Promise((resolve) => node.server.listen(0, resolve));
  node.url = `http://127.0.0.1:${node.server.address().port}`;
  return node;
}

// Stands in for gossip/follow.mjs and lets the test deliver blocks and gaps.
function fakeFollow() {
  const fake = { stopped: false, options: null };
  fake.started = new Promise((resolve) => {
    fake.follow = async (options) => {
      fake.options = options;
      resolve();
      return {
        stop: async () => {
          fake.stopped = true;
        },
        stats: () => ({}),
      };
    };
  });
  fake.block = (number, logsBloom) =>
    fake.options.onBlock({
      number: BigInt(number),
      hash: `0x${number.toString(16).padStart(64, "0")}`,
      logsBloom,
    });
  return fake;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("gossip: a matching block triggers once the RPC has it", async (t) => {
  const node = await rpcNode(0x103);
  const fake = fakeFollow();
  const blocks = [];
  const unwatch = state.watch({
    environment: { rpcHttpHost: node.url, gossip: "optimism" },
    args,
    onNewBlock: (blockNumber) => blocks.push(blockNumber),
    follow: fake.follow,
    lagInterval: 20,
  });
  t.is(typeof unwatch, "function");
  await fake.started;
  t.is(fake.options.network.chainId, 10);

  fake.block(0x105, bloomOf(address, topic));
  await wait(150);
  t.deepEqual(blocks, []);
  t.true(node.calls > 0);

  node.head = 0x105;
  await wait(150);
  t.deepEqual(blocks, [0x105n]);

  await unwatch();
  t.true(fake.stopped);
  node.server.close();
});

test("gossip: an RPC that stays behind is scanned up to its head, then the rest", async (t) => {
  const node = await rpcNode(0x103);
  const fake = fakeFollow();
  const blocks = [];
  const unwatch = state.watch({
    environment: { rpcHttpHost: node.url, gossip: "optimism" },
    args,
    onNewBlock: (blockNumber) => blocks.push(blockNumber),
    follow: fake.follow,
    lagInterval: 10,
    lagTimeout: 50,
  });
  await fake.started;

  fake.block(0x105, bloomOf(address, topic));
  await wait(150);
  t.deepEqual(blocks, [0x103n], "only up to what the RPC has");

  node.head = 0x105;
  await wait(150);
  t.deepEqual(blocks, [0x103n, 0x105n]);

  await unwatch();
  node.server.close();
});

test("gossip: a block without matching logs doesn't trigger", async (t) => {
  const node = await rpcNode(0x200);
  const fake = fakeFollow();
  const blocks = [];
  const unwatch = state.watch({
    environment: { rpcHttpHost: node.url, gossip: { network: "optimism" } },
    args,
    onNewBlock: (blockNumber) => blocks.push(blockNumber),
    follow: fake.follow,
    lagInterval: 20,
  });
  await fake.started;

  // The address alone (e.g. another event of the contract) isn't enough.
  fake.block(0x1ff, bloomOf(address));
  fake.block(0x200, new Uint8Array(256));
  await wait(150);
  t.deepEqual(blocks, []);
  t.is(node.calls, 0);

  await unwatch();
  node.server.close();
});

test("gossip: missed blocks trigger a scan", async (t) => {
  const node = await rpcNode(0x300);
  const fake = fakeFollow();
  const blocks = [];
  const unwatch = state.watch({
    environment: { rpcHttpHost: node.url, gossip: true },
    args,
    onNewBlock: (blockNumber) => blocks.push(blockNumber),
    follow: fake.follow,
    lagInterval: 20,
  });
  await fake.started;

  fake.options.onGap({ from: 0x2fd, to: 0x2ff });
  await wait(150);
  t.deepEqual(blocks, [0x2ffn]);

  await unwatch();
  node.server.close();
});

test("gossip: triggers don't overlap and are merged", async (t) => {
  const node = await rpcNode(0x400);
  const fake = fakeFollow();
  const blocks = [];
  let running = 0;
  let overlapped = false;
  const unwatch = state.watch({
    environment: { rpcHttpHost: node.url, gossip: true },
    args,
    onNewBlock: async (blockNumber) => {
      if (running++) overlapped = true;
      blocks.push(blockNumber);
      await wait(100);
      running--;
    },
    follow: fake.follow,
    lagInterval: 20,
  });
  await fake.started;

  const bloom = bloomOf(address, topic);
  fake.block(0x3fd, bloom);
  await wait(50);
  fake.block(0x3fe, bloom);
  fake.block(0x3ff, bloom);
  await wait(300);
  t.false(overlapped);
  t.deepEqual(blocks, [0x3fdn, 0x3ffn]);

  await unwatch();
  node.server.close();
});

test("gossip: unknown networks are refused", (t) => {
  t.throws(() => state.gossipOptions("nonexistent"), {
    message: /Unknown gossip network/,
  });
  t.throws(() => state.gossipOptions({ network: "toString" }));
  const preset = { chainId: 8453, signer: "0x0", bootnodes: [] };
  t.is(state.gossipOptions({ network: preset, udpPort: 0 }).network, preset);
});
