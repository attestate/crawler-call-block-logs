Reference
---------

Extractor module
________________

.. code-block:: javascript

  // NOTE: address and topics can be used to filter events at the Ethereum node
  //  level.
  function init({start = 0, end, address, topics, blockspan = 1})

* ``start`` Start block as a natural number in decimal-base (default: 0).
* ``end`` End block as a natural number in decimal-base.
* ``address`` "0x"- prefixed Ethereum address of where an event log originates
  from.
* ``topics`` Array containing up to three 32 byte long "0x"-prefixed topic
  hashes related to the event or an array of arrays containing such values.
* ``blockspan`` The distance between ``fromBlock`` and ``toBlock`` in decimal-base (default: 1).

Transformer module
__________________

.. code-block:: javascript

  function onLine({args: {topics = [], address}, state: {line}})

* ``line`` Is an argument defined by ``@attestate/crawler`` internally. It is a 
  line within the strategy's ``input.path`` file.
* ``address`` "0x"- prefixed Ethereum address of where an event log originates
  from.
* ``topics`` Array containing up to three 32 byte long "0x"-prefixed topic
  hashes related to the event or an array of arrays containing such values.

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
