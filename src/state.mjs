// @format
import { createPublicClient, http } from "viem";

import { rpcHttpHost } from "./hosts.mjs";

export async function remote({ execute, environment }) {
  const options = {
    url: rpcHttpHost(environment),
  };

  if (environment.rpcApiKey) {
    options.headers = {
      Authorization: `Bearer ${environment.rpcApiKey}`,
    };
  }

  const outcome = await execute({
    type: "json-rpc",
    method: "eth_blockNumber",
    params: [],
    version: "0.0.1",
    options,
  });

  return parseInt(outcome.results, 16);
}

export async function local(db) {
  const key = "";
  const results = Array.from(await db.getRange(key));
  const elem = results[results.length - 1];
  if (!elem) return 0;
  const [blockNumber, _] = elem.key;
  return parseInt(blockNumber, 16);
}

export function watch({ environment, onNewBlock }) {
  // NOTE: We poll eth_blockNumber instead of subscribing to newHeads via
  // WebSocket, as many providers bill every newHeads event. Polling always
  // uses the first host; only crawls rotate through the list.
  const client = createPublicClient({
    transport: http([environment.rpcHttpHost].flat()[0]),
  });

  return client.watchBlockNumber({
    onBlockNumber: onNewBlock,
    emitOnBegin: false,
    emitMissed: false, // the crawler scans all blocks since its last run
    poll: true,
    pollingInterval: environment.pollingInterval,
  });
}
