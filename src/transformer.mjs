// @format
import log from "./logger.mjs";

function filter(topics, address) {
  const [topic0, topic1, topic2] = topics;
  return (log) => {
    if (
      (topic0 && topic0 !== log.topics[0]) ||
      (topic1 && topic1 !== log.topics[1]) ||
      (topic2 && topic2 !== log.topics[2]) ||
      (address && address !== log.address)
    ) {
      return false;
    } else {
      return true;
    }
  };
}

export function onClose() {}

export function onLine({ args: { topics = [], address }, state }) {
  let logs;
  try {
    logs = JSON.parse(state.line);
  } catch (err) {
    log(err.toString());
    return;
  }

  logs = logs.filter(filter(topics, address));
  if (logs.length) {
    return JSON.stringify(logs);
  } else {
    return "";
  }
}
