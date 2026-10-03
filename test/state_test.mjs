//@format
import { rm } from "fs/promises";
import { createServer } from "http";

import test from "ava";
import { open } from "lmdb";

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

test("watch polls eth_blockNumber over HTTP when no rpcWsHost is set", async (t) => {
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

test("watch falls back to the next HTTP host when the first one fails", async (t) => {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { id } = JSON.parse(body);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: "0x100" }));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const blockNumber = await new Promise((resolve) => {
    const unwatch = state.watch({
      environment: {
        rpcHttpHost: ["http://127.0.0.1:1", `http://127.0.0.1:${port}`],
        pollingInterval: 50,
      },
      onNewBlock: (blockNumber) => {
        unwatch();
        resolve(blockNumber);
      },
    });
  });
  server.close();

  t.is(blockNumber, 0x100n);
});
