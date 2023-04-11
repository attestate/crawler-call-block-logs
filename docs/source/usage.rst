Usage
-----

.. code-block:: javascript

  import * as blockLogs from "@attestate/crawler-call-block-logs";
  
  export default {
    path: [
      {
        name: "call-block-logs",
        extractor: {
          module: blockLogs.extractor,
          args: {
            start: 16579759,
            end: 16579761,
            address: "0x0bC2A24ce568DAd89691116d5B34DEB6C203F342",
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            ]
          },
          output: {
            name: "call-block-logs-extraction",
          },
        },
        transformer: {
          module: blockLogs.transformer,
          args: {},
          input: {
            name: "call-block-logs-extraction",
          },
          output: {
            name: "call-block-logs-transformation",
          },
        },
        loader: {
          module: blockLogs.loader,
          input: {
            name: "call-block-logs-transformation",
          },
          output: {
            name: "call-block-logs-load",
          },
        },
      },
    ],
    queue: {
      options: {
        concurrent: 100,
      },
    },
  };
