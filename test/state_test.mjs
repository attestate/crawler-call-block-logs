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
