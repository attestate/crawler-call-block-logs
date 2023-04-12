// @format
import { env } from "process";

import test from "ava";

import * as blockLogs from "../src/index.mjs";

const options = {
  url: env.RPC_HTTP_HOST,
};

if (env.RPC_API_KEY) {
  options.headers = {
    Authorization: `Bearer ${env.RPC_API_KEY}`,
  };
}

test("if events can be filtered by contract address and topics", async (t) => {
  const args = {
    start: 1,
    end: 2,
    address: "address",
    topics: [1, 2],
  };
  const state = {};
  const { write, messages } = blockLogs.extractor.init({ args, state });
  t.is(messages.length, 1);
  t.is(messages[0].params[0].address, args.address);
  t.deepEqual(messages[0].params[0].topics, args.topics);
});

test("if block range can be crawled where blockspan isn't a multiple of difference", (t) => {
  const args = {
    start: 0,
    end: 5,
    blockspan: 3,
  };
  const state = {};
  const { write, messages } = blockLogs.extractor.init({ args, state });
  t.is(messages.length, 2);
  t.is(messages[0].params[0].fromBlock, "0x0");
  t.is(messages[0].params[0].toBlock, "0x3");
  t.is(messages[1].params[0].fromBlock, "0x3");
  t.is(messages[1].params[0].toBlock, "0x5");
});

test("if eth_getLogs message is generated from block range", (t) => {
  const start = 16519229;
  const end = start + 1;
  const state = {};
  const args = { start, end };
  const { write, messages } = blockLogs.extractor.init({ args, state });
  t.truthy(messages[0]);
  t.is(messages.length, 1);
});

test("if call-block-logs init throws when start block is bigger than end block", (t) => {
  const state = {};
  const args = { start: 2, end: 1 };
  const { write, messages } = blockLogs.extractor.init({ args, state });
  t.is(messages[0].type, "exit");
});
