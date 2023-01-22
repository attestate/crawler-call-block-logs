@attestate/crawler-call-block-logs
==================================

A ``@attestate/crawler`` strategy to extract and transform Ethereum block event
logs from the JSON-RPC API.

Context
-------

A key concept of Ethereum are the event logs emitted from smart contracts. They
are used to signal historic calls to specific smart contract functions and can
hence be used to keep a local application synchronized to the latest state of a
smart contract on the Ethereum mainnet.

* Source code: `github.com/attestate/crawler-call-block-logs <https://github.com/attestate/crawler-call-block-logs>`_.

Installation
------------

Assuming you already have the crawler set up, install the strategy via npm:

.. code-block:: bash

  npm i @attestate/crawler-call-block-logs

Usage
-----

.. code-block:: javascript

  import { resolve } from "path";
  import { env } from "process";
  import * as blockLogs from "@attestate/crawler-call-block-logs";

  const range = {
    start: 16370086,
    end: 16370087, // start + 1
  };

  //keccak - 256("Transfer(address,address,uint256)") == "0xddf...";
  const topic0 =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const topic1 =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  export default [
    {
      name: "call-block-logs",
      extractor: {
        module: blockLogs.extractor,
        args: [range.start, range.end],
        output: {
          path: resolve(env.DATA_DIR, "call-block-logs-extraction"),
        },
      },
      transformer: {
        module: blockLogs.transformer,
        args: [topic0, topic1],
        input: {
          path: resolve(env.DATA_DIR, "call-block-logs-extraction"),
        },
        output: {
          path: resolve(env.DATA_DIR, "call-block-logs-transformation"),
        },
      },
    },
  ];
