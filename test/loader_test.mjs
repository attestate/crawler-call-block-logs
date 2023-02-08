// @format
import test from "ava";

import * as blockLogs from "../src/index.mjs";

test("generating direct ids from lines", (t) => {
  const snapshot = [
    {
      address: "0xabefbc9fd2f806065b4f3c237d4b59d9a97bcac7",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000f0dd6582e6e1a6a1e195fd74bef56b4327cd81c1",
        "0x0000000000000000000000000000000000000000000000000000000000001d0d",
      ],
      data: "0x",
      blockNumber: "0x00",
      transactionHash: "0x0a",
      transactionIndex: "0x00",
      blockHash:
        "0x4d9237aeaa30879232afeea1c33a123dfccc7bb0c99a91d4b0955fb93f2fb26a",
      logIndex: "0x73",
      removed: false,
    },
    {
      address: "0x0bc2a24ce568dad89691116d5b34deb6c203f342",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000008a5847fd0e592b058c026c5fdc322aee834b87f5",
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ],
      data: "0x",
      blockNumber: "0x00",
      transactionHash: "0x0b",
      transactionIndex: "0x01",
      blockHash:
        "0x1ed9bcf2a42169b8afd1cb167c0973b96ec0280fcd077870d185257a2fd38e7a",
      logIndex: "0x8f",
      removed: false,
    },
    {
      address: "0x0bc2a24ce568dad89691116d5b34deb6c203f342",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000008a5847fd0e592b058c026c5fdc322aee834b87f5",
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ],
      data: "0x",
      blockNumber: "0x01",
      transactionHash: "0x0c",
      transactionIndex: "0x00",
      blockHash:
        "0x1ed9bcf2a42169b8afd1cb167c0973b96ec0280fcd077870d185257a2fd38e7a",
      logIndex: "0x8f",
      removed: false,
    },
  ];

  const generator = blockLogs.loader.direct(JSON.stringify(snapshot));

  const v0 = generator.next().value;
  t.deepEqual(v0, {
    key: snapshot[0].transactionHash,
    value: snapshot[0],
  });

  const v1 = generator.next().value;
  t.deepEqual(v1, {
    key: snapshot[1].transactionHash,
    value: snapshot[1],
  });

  const v2 = generator.next().value;
  t.deepEqual(v2, {
    key: snapshot[2].transactionHash,
    value: snapshot[2],
  });
});

test("generating lexographic ids from lines", (t) => {
  const snapshot = [
    {
      address: "0xabefbc9fd2f806065b4f3c237d4b59d9a97bcac7",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000f0dd6582e6e1a6a1e195fd74bef56b4327cd81c1",
        "0x0000000000000000000000000000000000000000000000000000000000001d0d",
      ],
      data: "0x",
      blockNumber: "0x00",
      transactionHash: "0x0a",
      transactionIndex: "0x00",
      blockHash:
        "0x4d9237aeaa30879232afeea1c33a123dfccc7bb0c99a91d4b0955fb93f2fb26a",
      logIndex: "0x73",
      removed: false,
    },
    {
      address: "0x0bc2a24ce568dad89691116d5b34deb6c203f342",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000008a5847fd0e592b058c026c5fdc322aee834b87f5",
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ],
      data: "0x",
      blockNumber: "0x00",
      transactionHash: "0x0b",
      transactionIndex: "0x01",
      blockHash:
        "0x1ed9bcf2a42169b8afd1cb167c0973b96ec0280fcd077870d185257a2fd38e7a",
      logIndex: "0x8f",
      removed: false,
    },
    {
      address: "0x0bc2a24ce568dad89691116d5b34deb6c203f342",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000008a5847fd0e592b058c026c5fdc322aee834b87f5",
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ],
      data: "0x",
      blockNumber: "0x01",
      transactionHash: "0x0c",
      transactionIndex: "0x00",
      blockHash:
        "0x1ed9bcf2a42169b8afd1cb167c0973b96ec0280fcd077870d185257a2fd38e7a",
      logIndex: "0x8f",
      removed: false,
    },
  ];

  const generator = blockLogs.loader.order(JSON.stringify(snapshot));

  const v0 = generator.next().value;
  t.deepEqual(v0, { key: ["0x00", "0x00"], value: "0x0a" });

  const v1 = generator.next().value;
  t.deepEqual(v1, { key: ["0x00", "0x01"], value: "0x0b" });

  const v2 = generator.next().value;
  t.deepEqual(v2, { key: ["0x01", "0x00"], value: "0x0c" });

  const v3 = generator.next();
  t.true(v3.done);
});
