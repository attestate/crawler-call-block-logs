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
  const address = "address";
  const topics = [1, 2];
  const { write, messages } = blockLogs.extractor.init(1, 2, address, topics);
  t.is(messages.length, 1);
  t.is(messages[0].params[0].address, address);
  t.deepEqual(messages[0].params[0].topics, topics);
});

test("if block range can be crawled where stepSize isn't a multiple of difference", (t) => {
  const start = 0;
  const end = 5;
  const stepSize = 3;
  const { write, messages } = blockLogs.extractor.init(
    start,
    end,
    null,
    null,
    stepSize
  );
  t.is(messages.length, 2);
  t.is(messages[0].params[0].fromBlock, "0x0");
  t.is(messages[0].params[0].toBlock, "0x3");
  t.is(messages[1].params[0].fromBlock, "0x3");
  t.is(messages[1].params[0].toBlock, "0x5");
});

test("if eth_getLogs message is generated from block range", (t) => {
  const start = 16519229;
  const end = start + 1;
  const { write, messages } = blockLogs.extractor.init(start, end);
  t.truthy(messages[0]);
  t.is(messages.length, 1);
});

test("if call-block-logs init throws when start block is bigger than end block", (t) => {
  const { write, messages } = blockLogs.extractor.init(2, 1);
  t.is(messages[0].type, "exit");
});
