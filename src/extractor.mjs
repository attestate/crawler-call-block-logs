//@format
import { env } from "process";

import { toHex } from "eth-fun";

import log from "./logger.mjs";

const version = "0.0.1";

const options = {
  url: env.RPC_HTTP_HOST,
};

if (env.RPC_API_KEY) {
  options.headers = {
    Authorization: `Bearer ${env.RPC_API_KEY}`,
  };
}

function callBlockLogs(number, address, topics) {
  number = toHex(number);
  return {
    type: "json-rpc",
    method: "eth_getLogs",
    params: [
      {
        fromBlock: number,
        toBlock: number,
        address,
        topics,
      },
    ],
    version,
    options,
  };
}

function generateMessages(start, end, address, topics) {
  const difference = end - start;

  let messages = [];
  for (let i of Array(difference).keys()) {
    messages.push(callBlockLogs(start + i, address, topics));
  }
  return messages;
}

const exit = {
  write: null,
  messages: [{ type: "exit" }],
};

export function init(start = 0, end, address, topics) {
  if (end === "latest" || start === "latest") {
    log(`"latest" isn't a valid block number`);
    return exit;
  }
  if (end < start) {
    log(
      `End (${end}) block number is smaller than start (${start}) block number.
      Exiting strategy.`
    );
    return exit;
  }

  return {
    write: null,
    messages: generateMessages(start, end, address, topics),
  };
}

export function update(message) {
  return {
    messages: [],
    write: JSON.stringify(message.results),
  };
}
