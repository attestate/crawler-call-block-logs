import { env } from "process";

import test from "ava";

import { aggregate } from "../src/loader.mjs";

const zeroAddr = "0x0000000000000000000000000000000000000000";

test("simultaneous in and out within the same block", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
      tokenId: 0,
    },
    {
      from: "0xabc",
      to: "0xdef",
      timestamp: 1,
      tokenId: 0,
    },
    {
      from: "0xdef",
      to: "0xabc",
      timestamp: 1,
      tokenId: 0,
    },
    {
      from: "0xabc",
      to: zeroAddr,
      timestamp: 2,
      tokenId: 0,
    },
  ];
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        balance: 0,
        tokens: {
          0: [
            {
              start: 0,
              end: 1,
            },
            {
              start: 1,
              end: 2,
            },
          ],
        },
      },
      "0xdef": {
        balance: 0,
        tokens: {
          0: [
            {
              start: 1,
              end: 1,
            },
          ],
        },
      },
    },
    result
  );
});

test("filter self-transfers", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
      tokenId: 0,
    },
    {
      from: "0xabc",
      to: "0xabc",
      timestamp: 1,
      tokenId: 0,
    },
  ];
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        tokens: {
          0: [
            {
              start: 0,
            },
          ],
        },
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
      tokenId: 0,
    },
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 1,
      tokenId: 1,
    },
    {
      from: "0xabc",
      to: zeroAddr,
      timestamp: 1,
      tokenId: 0,
    },
  ];
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        balance: 1,
        tokens: {
          0: [
            {
              start: 0,
              end: 1,
            },
          ],
          1: [
            {
              start: 1,
            },
          ],
        },
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
      tokenId: 0,
    },
    {
      from: "0xabc",
      to: zeroAddr,
      timestamp: 0,
      tokenId: 0,
    },
  ];
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        balance: 0,
        tokens: {
          0: [
            {
              start: 0,
              end: 0,
            },
          ],
        },
      },
    },
    result
  );
});

test("to make sure that aggregating is valid", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
      tokenId: 0,
    },
    {
      from: zeroAddr,
      to: "0xdef",
      timestamp: 0,
      tokenId: 1,
    },
    {
      from: zeroAddr,
      to: "0xhodler",
      timestamp: 1,
      tokenId: 2,
    },
    {
      from: "0xdef",
      to: "0xabc",
      timestamp: 1,
      tokenId: 1,
    },
    {
      from: "0xabc",
      to: "0xghi",
      timestamp: 2,
      tokenId: 0,
    },
    {
      from: "0xabc",
      to: "0xghi",
      timestamp: 3,
      tokenId: 1,
    },
    {
      from: "0xghi",
      to: zeroAddr,
      timestamp: 4,
      tokenId: 0,
    },
  ];
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        balance: 0,
        tokens: {
          0: [{ start: 0, end: 2 }],
          1: [{ start: 1, end: 3 }],
        },
      },
      "0xdef": {
        balance: 0,
        tokens: {
          1: [{ start: 0, end: 1 }],
        },
      },
      "0xhodler": {
        balance: 1,
        tokens: {
          2: [{ start: 1 }],
        },
      },
      "0xghi": {
        balance: 1,
        tokens: {
          0: [{ start: 2, end: 4 }],
          1: [{ start: 3 }],
        },
      },
    },
    result
  );
});

test("in out, in out", async (t) => {
  const events = [
    {
      from: zeroAddr,
      to: "0xabc",
      timestamp: 0,
      tokenId: 0,
    },
    {
      from: "0xabc",
      to: "0xdef",
      timestamp: 1,
      tokenId: 0,
    },
    {
      from: "0xdef",
      to: "0xabc",
      timestamp: 5,
      tokenId: 0,
    },
    {
      from: "0xabc",
      to: "0xdef",
      timestamp: 6,
      tokenId: 0,
    },
  ];
  const result = aggregate(events);
  t.deepEqual(
    {
      "0xabc": {
        balance: 0,
        tokens: {
          0: [
            {
              start: 0,
              end: 1,
            },
            {
              start: 5,
              end: 6,
            },
          ],
        },
      },
      "0xdef": {
        balance: 1,
        tokens: {
          0: [
            {
              start: 1,
              end: 5,
            },
            {
              start: 6,
            },
          ],
        },
      },
    },
    result
  );
});
