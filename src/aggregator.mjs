const zeroAddr = "0x0000000000000000000000000000000000000000";
// NOTE: `events` must be sorted precisely as within the inter and intra block
// order.
export function aggregate(events) {
  const sorted = events.filter(({ to, from }) => from !== to);

  const data = {};

  for (let { to, from, timestamp } of sorted) {
    if (!data[to] && to !== zeroAddr) {
      data[to] = {
        start: timestamp,
        balance: 0,
      };
    }

    if (to !== zeroAddr) data[to].balance += 1;
    if (from !== zeroAddr) data[from].balance -= 1;

    if (to !== zeroAddr && data[to].balance > 1 && data[to].end !== undefined)
      delete data[to].end;

    if (data[from] && data[from].balance === 0 && from !== zeroAddr) {
      data[from].end = timestamp;
    }
  }

  // NOTE: We're filtering holding periods that span just a block here as this
  // is a state we don't perceive as reasonable for providing utility to
  // ownership. For example, in the case of Kiwi News, why would someone "just"
  // post a message for one specific timestamp, ever.
  for (const key of Object.keys(data)) {
    if (data[key].start === data[key].end) {
      delete data[key];
    }
  }
  return data;
}
