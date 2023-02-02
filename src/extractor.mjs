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

function callBlockLogs(fromBlock, toBlock, address, topics) {
  return {
    type: "json-rpc",
    method: "eth_getLogs",
    params: [
      {
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
        address,
        topics,
      },
    ],
    version,
    options,
  };
}

function generateMessages(start, end, address, topics, stepSize) {
  let messages = [];
  // NOTE: Sliding window between "...elem elem elem elem elem..."
  //                                      <head>         <tail>
  for (let head = start; head < end; head += stepSize) {
    let tail = head + stepSize;
    if (tail > end) {
      tail = end;
    }
    messages.push(callBlockLogs(head, tail, address, topics));
  }
  return messages;
}

const exit = {
  write: null,
  messages: [{ type: "exit" }],
};

export function init(start = 0, end, address, topics, stepSize = 1) {
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
    messages: generateMessages(start, end, address, topics, stepSize),
  };
}

export function update(message) {
  return {
    messages: [],
    write: JSON.stringify(message.results),
  };
}
