// @format
import { env } from "process";

import test from "ava";

import * as blockLogs from "../src/extractor.mjs";

const options = {
  url: env.RPC_HTTP_HOST,
};

if (env.RPC_API_KEY) {
  options.headers = {
    Authorization: `Bearer ${env.RPC_API_KEY}`,
  };
}

test("if call-block-logs update throws when start block is bigger than network's latest block number", async (t) => {
  const { write, messages } = blockLogs.update({
    type: "json-rpc",
    commissioner: "call-block-logs",
    method: "eth_blockNumber",
    params: [],
    metadata: { start: 99999999, end: 100000000 },
    version: "0.0.1",
    options,
    results: "0xeb2207",
    error: null,
  });
  t.is(messages[0].type, "exit");
});

test("if call-block-logs adjusts end block number when start block is in range of network", async (t) => {
  const { write, messages } = blockLogs.update({
    type: "json-rpc",
    commissioner: "call-block-logs",
    method: "eth_blockNumber",
    params: [],
    metadata: { start: 15409670, end: 100000000 },
    version: "0.0.1",
    options,
    results: "0xeb2207",
    error: null,
  });
  t.is(messages[0].method, "eth_getLogs");
  t.is(messages[0].params[0].fromBlock, "0xeb2206");
});
