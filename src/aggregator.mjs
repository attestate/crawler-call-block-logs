const zeroAddr = "0x0000000000000000000000000000000000000000";
// NOTE: `events` must be sorted precisely as within the inter and intra block
// order.
export function aggregate(events) {
  const sorted = events.filter(({ to, from }) => from !== to);

  const buckets = sorted.reduce((acc, evt) => {
    const { timestamp } = evt;
    if (!acc[timestamp]) {
      acc[timestamp] = [];
    }
    acc[timestamp].push(evt);
    return acc;
  }, {});

  const data = {};

  for (let bucket of Object.values(buckets)) {
    for (let { to, from, timestamp, tokenId } of bucket) {
      if (!data[to] && to !== zeroAddr) {
        data[to] = {
          tokens: {},
          // NOTE: We're increasing balance's count below
          balance: 0,
        };
      }

      if (to !== zeroAddr) data[to].balance += 1;
      if (from !== zeroAddr) data[from].balance -= 1;

      if (data[to] && !data[to].tokens[tokenId]) {
        data[to].tokens[tokenId] = [];
      }
      if (data[to] && to !== zeroAddr) {
        data[to].tokens[tokenId].push({
          start: timestamp,
        });
      }

      if (data[from] && from !== zeroAddr) {
        for (let [i, period] of data[from].tokens[tokenId].entries()) {
          if (period.start !== undefined && period.end === undefined) {
            data[from].tokens[tokenId][i].end = timestamp;
            break;
          }
        }
      }
    }
  }

  return data;
}
