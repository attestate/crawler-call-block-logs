// @format
import { env } from "process";

import test from "ava";

import * as blockLogs from "../src/index.mjs";

const environment = {
  rpcHttpHost: env.RPC_HTTP_HOST,
};

if (env.RPC_API_KEY) {
  environment.rpcApiKey = env.RPC_API_KEY;
}

test("to make sure no timestamp is included when inclusion flag is false", async (t) => {
  const args = {
    start: 18123080,
    end: 18123082,
    address: "0xebb15487787cbf8ae2ffe1a6cca5a50e63003786",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
    blockspan: 5000,
    includeTimestamp: false,
  };
  const state = {};
  const message = {
    method: "eth_getLogs",
    results: [
      {
        blockNumber: "0x1148948",
      },
    ],
  };
  const response = blockLogs.extractor.update({
    message,
    args,
    state,
    environment,
  });
  t.is(response.messages.length, 0);
  t.truthy(JSON.parse(response.write)[0].blockNumber);
  t.falsy(JSON.parse(response.write)[0].block);
});

test("if value is included when includeValue flag is set", async (t) => {
  const args = {
    start: 18123080,
    end: 18123082,
    address: "0xebb15487787cbf8ae2ffe1a6cca5a50e63003786",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
    blockspan: 5000,
    includeTimestamp: true,
    includeValue: true,
  };
  const state = {};
  const message = {
    method: "eth_getBlockByNumber",
    metadata: {
      log: {
        transactionHash: "txhash",
      },
    },
    results: {
      timestamp: "0x12345",
      blockNumber: "0x1148948",
    },
  };
  const response = await blockLogs.extractor.update({
    message,
    args,
    state,
    environment,
  });
  t.is(response.messages.length, 1);
  t.is(response.messages[0].method, "eth_getTransactionByHash");
  t.is(response.messages[0].params[0], "txhash");
});

test("if timestamp is included when includeTimestamp flag is set", async (t) => {
  const args = {
    start: 18123080,
    end: 18123082,
    address: "0xebb15487787cbf8ae2ffe1a6cca5a50e63003786",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
    blockspan: 5000,
    includeTimestamp: true,
  };
  const state = {};
  const message = {
    method: "eth_getLogs",
    results: [
      {
        blockNumber: "0x1148948",
      },
    ],
  };
  const response = await blockLogs.extractor.update({
    message,
    args,
    state,
    environment,
  });
  t.is(response.messages.length, 1);
  t.is(response.messages[0].method, "eth_getBlockByNumber");
});

test("if events can be filtered by contract address and topics", async (t) => {
  const args = {
    start: 1,
    end: 2,
    address: "address",
    topics: [1, 2],
  };
  const state = {};
  const { write, messages } = blockLogs.extractor.init({
    args,
    state,
    environment,
  });
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
  const { write, messages } = blockLogs.extractor.init({
    args,
    state,
    environment,
  });
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
  const { write, messages } = blockLogs.extractor.init({
    args,
    state,
    environment,
  });
  t.truthy(messages[0]);
  t.is(messages.length, 1);
});

test("if call-block-logs init throws when start block is bigger than end block", (t) => {
  const state = {};
  const args = { start: 2, end: 1 };
  const { write, messages } = blockLogs.extractor.init({
    args,
    state,
    environment,
  });
  t.is(messages[0].type, "exit");
});
