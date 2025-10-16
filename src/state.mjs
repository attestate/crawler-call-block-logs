// @format
import { createPublicClient, webSocket } from "viem";
import { mainnet } from "viem/chains";

export async function remote({ execute, environment }) {
  const options = {
    url: environment.rpcHttpHost,
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
  if (!environment.rpcWsHost) {
    throw new Error(
      "RPC_WS_HOST is required for WebSocket block subscriptions"
    );
  }

  // Create client without hardcoded chain - viem will handle it
  const client = createPublicClient({
    transport: webSocket(environment.rpcWsHost),
  });

  const unwatch = client.watchBlockNumber({
    onBlockNumber: async (blockNumber) => {
      await onNewBlock(blockNumber);
    },
    emitOnBegin: false,
    emitMissed: true, // Emit all missed blocks after reconnection
    poll: false, // Use WebSocket subscription
  });

  return unwatch;
}
