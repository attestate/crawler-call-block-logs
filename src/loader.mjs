// @format
import log from "./logger.mjs";

export function* order(line) {
  let logs;
  try {
    logs = JSON.parse(line);
  } catch (err) {
    log(err.toString());
    return;
  }

  for (let log of logs) {
    yield {
      key: [log.blockNumber, log.transactionIndex],
      value: log.transactionHash,
    };
  }
}

export function* direct(line) {
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
