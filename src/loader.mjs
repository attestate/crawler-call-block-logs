// @format
import log from "./logger.mjs";

export { aggregate } from "./aggregator.mjs";

export function prefixed(value) {
  return value.slice(0, 2) === "0x";
}

export function unfix(value) {
  if (!prefixed(value))
    throw Error(`Cannot remove 0x prefix from value "${value}"`);
  return value.slice(2);
}

export function serialize(value, length) {
  value = value.map(unfix);
  return value.map((elem) => elem.padStart(length, "0"));
}

export function* order({ state: { line } }) {
  let logs;
  try {
    logs = JSON.parse(line);
  } catch (err) {
    log(err.toString());
    return;
  }

  for (let log of logs) {
    const key = serialize([log.blockNumber, log.transactionIndex], 16);
    yield {
      key,
      value: log.transactionHash,
    };
  }
}

export function* direct({ state: { line } }) {
  let logs;
  try {
    logs = JSON.parse(line);
  } catch (err) {
    log(err.toString());
    return;
  }

  for (let log of logs) {
    yield {
      key: log.transactionHash,
      value: log,
    };
  }
}
