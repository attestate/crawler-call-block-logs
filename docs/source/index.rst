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

  const address = "0x24da31e7bb182cb2cabfef1d88db19c2ae1f5572";
  const topics = [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  ];

  export default [
    {
      name: "call-block-logs",
      extractor: {
        module: blockLogs.extractor,
        args: [range.start, range.end, address, topics],
        output: {
          path: resolve(env.DATA_DIR, "call-block-logs-extraction"),
        },
      },
      transformer: {
        module: blockLogs.transformer,
        args: [/* topics, address */],
        input: {
          path: resolve(env.DATA_DIR, "call-block-logs-extraction"),
        },
        output: {
          path: resolve(env.DATA_DIR, "call-block-logs-transformation"),
        },
      },
    },
  ];

References
----------

Extractor module
________________

.. code-block:: javascript

  // NOTE: address and topics can be used to filter events at the Ethereum node
  //  level.
  function init(start = 0, end, address, topics);

* ``start`` Start block as a decimal-base number.
* ``end`` End block as a decimal-base number.
* ``address`` "0x"- prefixed Ethereum address of where an event log originates
  from.
* ``topics`` Array containing up to three 32 byte long "0x"-prefixed topic
  hashes related to the event.

Transformer module
__________________

.. code-block:: javascript

  export function onLine(line, topics = [], address) {

* ``line`` Cannot be user-defined. Is a respective line defined in the crawl
  path's input path.
* ``address`` "0x"- prefixed Ethereum address of where an event log originates
  from.
* ``topics`` Array containing up to three 32 byte long "0x"-prefixed topic
  hashes related to the event.
