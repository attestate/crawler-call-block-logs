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

test("if events can be filtered by contract address and topics", async (t) => {
  const address = "address";
  const topics = [1, 2];
  const { write, messages } = blockLogs.init(1, 2, address, topics);
  t.is(messages.length, 1);
  t.is(messages[0].params[0].address, address);
  t.deepEqual(messages[0].params[0].topics, topics);
});

test("if eth_getLogs message is generated from block range", (t) => {
  const start = 16519229;
  const end = start + 1;
  const { write, messages } = blockLogs.init(start, end);
  t.truthy(messages[0]);
  t.is(messages.length, 1);
});

test("if call-block-logs init throws when start block is bigger than end block", (t) => {
  const { write, messages } = blockLogs.init(2, 1);
  t.is(messages[0].type, "exit");
});
