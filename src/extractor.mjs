//@format
import { env } from "process";

import { toHex } from "eth-fun";

import log from "./logger.mjs";

const version = "0.0.1";

function callBlockLogs(fromBlock, toBlock, address, topics, options) {
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

function generateMessages(start, end, address, topics, blockspan, options) {
  let messages = [];
  // NOTE: Sliding window between "...elem elem elem elem elem..."
  //                                      <head>         <tail>
  for (let head = start; head < end; head += blockspan) {
    let tail = head + blockspan;
    if (tail > end) {
      tail = end;
    }
    messages.push(callBlockLogs(head, tail, address, topics, options));
  }
  return messages;
}

const exit = {
  write: null,
  messages: [{ type: "exit" }],
};

function generateOptions(environment) {
  const options = {
    url: environment.rpcHttpHost,
  };

  if (environment.rpcApiKey) {
    options.headers = {
      Authorization: `Bearer ${environment.rpcApiKey}`,
    };
  }
  return options;
}

export function init({
  args: { start = 0, end, address, topics, blockspan = 1 },
  state,
  environment,
}) {
  const options = generateOptions(environment);

  if (end === "latest" || !end) {
    end = state.remote;
  }
  if (state.local > start) {
    start = state.local;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    log(`start "${start}" or end "${end}" isn't an integer`);
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
    messages: generateMessages(start, end, address, topics, blockspan, options),
  };
}

const returnTransactions = false;
const blockNumberMessage = (blockNumber, options, log) => ({
  version: "0.0.1",
  type: "json-rpc",
  method: "eth_getBlockByNumber",
  params: [blockNumber, returnTransactions],
  options,
  metadata: {
    log,
  },
});

function updateBlock({ message }) {
  return {
    messages: [],
    write: JSON.stringify([
      {
        ...message.metadata.log,
        block: {
          timestamp: message.results.timestamp,
        },
      },
    ]),
  };
}

function updateLogs({ args, message, environment }) {
  if (args && !args.includeTimestamp) {
    return {
      messages: [],
      write: JSON.stringify(message.results),
    };
  }

  if (!Array.isArray(message.results)) {
    return {
      messages: [],
      write: null,
    };
  }

  const messages = [];
  const options = generateOptions(environment);
  for (const log of message.results) {
    messages.push(blockNumberMessage(log.blockNumber, options, log));
  }

  return {
    messages,
    write: null,
  };
}

export function update({ args, message, environment }) {
  if (message.method === "eth_getLogs") {
    return updateLogs({ args, message, environment });
  }
  if (message.method === "eth_getBlockByNumber") {
    return updateBlock({ args, message, environment });
  }
}
