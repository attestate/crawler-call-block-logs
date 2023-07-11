// @format
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
