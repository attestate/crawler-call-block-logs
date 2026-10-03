//@format
import test from "ava";

import { rpcHttpHost } from "../src/hosts.mjs";

test("rpcHttpHost returns a single host as is", (t) => {
  t.is(rpcHttpHost({ rpcHttpHost: "https://a" }), "https://a");
  t.is(rpcHttpHost({ rpcHttpHost: "https://a" }), "https://a");
});

test("rpcHttpHost rotates through a list of hosts", (t) => {
  const environment = { rpcHttpHost: ["https://a", "https://b"] };
  const first = rpcHttpHost(environment);
  const second = rpcHttpHost(environment);
  const third = rpcHttpHost(environment);
  t.not(first, second);
  t.is(first, third);
});
