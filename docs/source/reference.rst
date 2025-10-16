Reference
---------

Extractor module
________________

.. code-block:: javascript

  // NOTE: address and topics can be used to filter events at the Ethereum node
  //  level.
  function init({ args: {start = 0, end, address, topics, blockspan = 1}})

* ``start`` Start block as a natural number in decimal-base (default: 0).
* ``end`` End block as a natural number in decimal-base.
* ``address`` "0x"- prefixed Ethereum address of where an event log originates
  from.
* ``topics`` Array containing up to three 32 byte long "0x"-prefixed topic
  hashes related to the event or an array of arrays containing such values.
* ``blockspan`` The distance between ``fromBlock`` and ``toBlock`` in decimal-base (default: 1).
* ``includeTimestamp`` Flag to include the block timestamp as ``block.timestamp`` in
  the result object.
* ``includeValue`` Flag to include the transaction's value as
  ``transaction.value`` in the result object.

Transformer module
__________________

.. code-block:: javascript

  function onLine({args: {topics = [], address, inputs}, state: {line}})

* ``line`` Is an argument defined by ``@attestate/crawler`` internally. It is a 
  line within the strategy's ``input.path`` file.
* ``address`` "0x"- prefixed Ethereum address of where an event log originates
  from.
* ``topics`` Array containing up to three 32 byte long "0x"-prefixed topic
  hashes related to the event or an array of arrays containing such values.
* ``inputs`` When defined, it replaces the event log's "data" property with a
  parsed event log using `web3-eth-abi@1.4.0's decodeLog
  <https://web3js.readthedocs.io/en/v1.4.0/web3-eth-abi.html#decodelog>`_.

Loader module
_____________

.. code-block:: javascript

  function* order({state: {line}})

* ``line`` Is an argument defined by ``@attestate/crawler`` internally. It is a 
  line within the strategy's ``input.path`` file.

``order`` is a JavaScript `generator function
<https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*>`_.
As the ``key``, it concatenates serialized ``blockNumber`` and ``transactionIndex`` to
generate an identifier which defines a total order among ``transactionHash``es.
``value`` is the ``transactionHash``.

.. code-block:: javascript

  function* direct({state: {line}})

* ``line`` Is an argument defined by ``@attestate/crawler`` internally. It is a 
  line within the strategy's ``input.path`` file.

``direct`` is a JavaScript `generator function
<https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*>`_.
As the ``key``, it defines the ``transactionHash`` to generate an identifier
which lets us directly access the log through ``value``.

State module
____________

The state module provides coordinator functionality for continuous blockchain
monitoring via WebSocket subscriptions.

.. code-block:: javascript

  function watch({ environment, onNewBlock })

* ``environment`` Object containing environment variables (e.g., ``rpcWsHost``)
  passed from the crawler configuration.
* ``onNewBlock`` Callback function invoked with the new block number when a new
  block is detected via WebSocket subscription.

The ``watch()`` function:

* Establishes a WebSocket connection to the RPC endpoint specified in
  ``environment.rpcWsHost`` (e.g., ``wss://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY``)
* Subscribes to new block headers using viem's ``watchBlockNumber``
* Automatically handles reconnection if the connection is lost
* Detects and emits missed blocks with ``emitMissed: true``
* Returns an ``unwatch()`` function to cleanly close the subscription

The function provides real-time block notifications with ~1-2 second latency,
replacing the previous polling-based approach which used an ``interval``
parameter.

.. note::
   Prior to version 0.6.0, continuous monitoring required a polling-based
   ``interval`` parameter in the coordinator configuration. This has been
   replaced with WebSocket subscriptions via the ``watch()`` function for
   better performance and resource efficiency.
