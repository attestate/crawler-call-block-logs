import { env } from "process";

import test from "ava";

import { aggregate } from "../src/loader.mjs";

const zeroAddr = "0x0000000000000000000000000000000000000000";

test("filter self-transfers", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
    },
    {
      from: "0xabc",
      to: "0xabc",
      timestamp: 1,
    },
  ];
  // NOTE: If we want to get the aggregate at timestamp=2, we can simply filter
  // out all txs with timestamp > 2.
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        start: 0,
        balance: 1,
      },
    },
    result
  );
});

test("in-block transfers (in first, then out)", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
    },
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 1,
    },
    {
      from: "0xabc",
      to: zeroAddr,
      timestamp: 1,
    },
  ];
  // NOTE: If we want to get the aggregate at timestamp=2, we can simply filter
  // out all txs with timestamp > 2.
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        start: 0,
        balance: 1,
      },
    },
    result
  );
});

test("in-block transfers (out first, then in)", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
    },
    {
      from: "0xabc",
      to: zeroAddr,
      timestamp: 0,
    },
  ];
  // NOTE: If we want to get the aggregate at timestamp=2, we can simply filter
  // out all txs with timestamp > 2.
  const result = aggregate(events);
  t.deepEqual({}, result);
});

test("to make sure that aggregating is valid", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
    },
    {
      from: zeroAddr,
      to: "0xdef",
      timestamp: 0,
    },
    {
      from: zeroAddr,
      to: "0xhodler",
      timestamp: 1,
    },
    {
      from: "0xdef",
      to: "0xabc",
      timestamp: 1,
    },
    {
      from: "0xabc",
      to: "0xghi",
      timestamp: 2,
    },
    {
      from: "0xabc",
      to: "0xghi",
      timestamp: 3,
    },
    {
      from: "0xghi",
      to: zeroAddr,
      timestamp: 4,
    },
  ];
  // NOTE: If we want to get the aggregate at timestamp=2, we can simply filter
  // out all txs with timestamp > 2.
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        balance: 0,
        end: 3,
        start: 0,
      },
      "0xdef": {
        balance: 0,
        end: 1,
        start: 0,
      },
      "0xhodler": { start: 1, balance: 1 },
      "0xghi": {
        start: 2,
        balance: 1,
      },
    },
    result
  );
});
