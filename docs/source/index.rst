@attestate/crawler-call-block-logs
==================================

A ``@attestate/crawler`` strategy to extract, transform and load Ethereum block
event logs from the JSON-RPC API into an LMDB store.

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


Table of Contents
-----------------

.. toctree::
  
  usage
  reference
