// @format
import { readFileSync } from "fs";

import test from "ava";
import { hexToBytes } from "viem";

import { contains, matches } from "../../src/gossip/bloom.mjs";
import { decodePayload, uncompress } from "../../src/gossip/opstack.mjs";

const DELEGATOR = "0x418910fef46896eb0bfe38f656e2f7df3eca7198";
const DELEGATE =
  "0xcd9cc59d1cc3aa17955023d009176720c8a383000a973ae2933c1cf6cbeee480";
const OTHER =
  "0x00000000000000000000000000000000000000000000000000000000deadbeef";

// OP mainnet block 158327753 holds one Delegate log of the Delegator.
const vectors = JSON.parse(
  readFileSync(new URL("./vectors.json", import.meta.url), "utf8"),
);
const v = vectors.validator.find((v) => v.name === "Real_158327753_ValidThenSeen");
const bloom = decodePayload(
  v.version,
  uncompress(hexToBytes(`0x${v.steps[0].data}`)).subarray(65),
).logsBloom;

test("contains finds the log's address and topic", (t) => {
  t.true(contains(bloom, DELEGATOR));
  t.true(contains(bloom, DELEGATE));
  t.false(contains(new Uint8Array(256), DELEGATOR));
});

test("matches follows eth_getLogs filter semantics", (t) => {
  t.true(matches(bloom, { address: DELEGATOR, topics: [DELEGATE] }));
  t.true(matches(bloom, { address: [OTHER.slice(0, 42), DELEGATOR], topics: [DELEGATE] }));
  t.true(matches(bloom, { address: DELEGATOR, topics: [[OTHER, DELEGATE]] }));
  t.true(matches(bloom, { address: DELEGATOR, topics: [null] }));
  t.true(matches(bloom, { address: [], topics: [] }), "empty filter matches");
  t.true(matches(bloom, { topics: [DELEGATE] }));
  t.false(matches(bloom, { address: DELEGATOR, topics: [OTHER] }));
  t.false(matches(bloom, { address: DELEGATOR, topics: [DELEGATE, OTHER] }));
  t.false(matches(new Uint8Array(256), { address: DELEGATOR }));
});
