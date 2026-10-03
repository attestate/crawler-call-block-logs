// @format
import { createPublicClient, fallback, http, webSocket } from "viem";

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
  // NOTE: Without a WebSocket host, we poll eth_blockNumber over HTTP instead
  // of subscribing to newHeads, which many providers bill per block. Polling
  // uses the first host and falls back to the others if it fails.
  const polling = !environment.rpcWsHost;
  const hosts = [environment.rpcHttpHost].flat();
  const client = createPublicClient({
    transport: polling
      ? fallback(hosts.map((host) => http(host)))
      : webSocket(environment.rpcWsHost),
  });

  return client.watchBlockNumber({
    onBlockNumber: onNewBlock,
    emitOnBegin: false,
    emitMissed: !polling, // the crawler scans all blocks since its last run
    poll: polling,
    pollingInterval: environment.pollingInterval ?? 5000,
  });
}
