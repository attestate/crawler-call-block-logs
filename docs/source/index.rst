@attestate/crawler-call-block-logs
==================================

A key concept of Ethereum are the event logs emitted from smart contracts. They
are used to signal historic calls to specific smart contract functions and can
hence be used to keep a local application synchronized to the latest state of a
smart contract on the Ethereum mainnet.

The Attestate crawler contains a strategy for downloading
Ethereum event logs on a per block basis. This strategy is
currently distributed via GitHub under the name
`crawler-call-block-logs
<https://github.com/attestate/crawler-call-block-logs>`_.

Installation
------------

Assuming you already have the crawler set up, install the strategy via npm:

.. code-block:: bash

  npm i @attestate/crawler-call-block-logs

Usage
-----

The strategy is used by loading it in the crawl path as follows:

.. code-block:: javascript

  import { boot } from "@attestate/crawler";
  import * as blockLogs from "@attestate/crawler-call-block-logs";

  const config = {
    queue: {
      options: {
        concurrent: 1,
      },
    },
  };

  const range = {
    start: 16370086,
    end: 16370087 // start + 1
  };

  // keccak-256("Transfer(address,address,uint256)") == "0xddf..."
  const topic0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const topic1 = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const topic2 = null;
  const address = null;

  const crawlPath = [{
    extractor: {
      module: blockLogs.extractor,
      args: [range.start, range.end]
    },
    // While we're downloading all event logs unfiltered, in the transformer
    // strategy, we're then filtering down by transfers and mint transactions
    // (topic1 is the zero address) only.
    transformer: {
      module: blockLogs.transformer,
      args: [
        topic0,
        topic1,
        topic2,
        address
      ]
    }
  }];

  (async () => {
    await boot(crawlPath, config);

  })();


Function reference
------------------

``extractor.init(start = 0, end)``
__________________________________

* ``start`` a JavaScript Number; The first block that ``eth_getLogs`` is called on.
* ``end`` a JavaScript Number; The last block. After this block's event logs are downloaded the strategy is shut down.
