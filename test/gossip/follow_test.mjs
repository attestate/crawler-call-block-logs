//@format
import test from "ava";

import { follow } from "../../src/gossip/follow.mjs";
import { optimism } from "../../src/gossip/networks.mjs";
import * as state from "../../src/state.mjs";

test("follow starts and stops cleanly without peers", async (t) => {
  const network = { ...optimism, bootnodes: [] };
  const started = Date.now();
  const handle = await follow({ network, udpPort: 0, log: () => {} });
  const stats = handle.stats();
  t.is(stats.peers, 0);
  t.is(stats.head, null);
  t.is(typeof stats.peerId, "string");

  await handle.stop();
  await handle.stop(); // idempotent
  t.true(Date.now() - started < 10_000);
});

test("watch joins the gossip with the real follow and unwatches", async (t) => {
  const unwatch = state.watch({
    environment: {
      rpcHttpHost: "http://127.0.0.1:1",
      gossip: { network: { ...optimism, bootnodes: [] }, udpPort: 0 },
    },
    args: { address: "0x1111111111111111111111111111111111111111" },
    onNewBlock: () => t.fail(),
  });
  t.is(typeof unwatch, "function");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await unwatch();
  t.pass();
});
