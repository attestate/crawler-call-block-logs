# Changelog

## 0.6.1

- Update peer dependency to `@attestate/crawler@^0.7.0` for compatibility with WebSocket-based coordinator

## 0.6.0

- Add WebSocket support via `state.watch()` function for real-time block monitoring
- New `watch()` function enables subscription to new block headers via WebSocket (e.g., Alchemy, Infura)
- Replaces polling-based approach (coordinator `interval`) with event-driven WebSocket subscriptions
- Requires `RPC_WS_HOST` environment variable (e.g., `wss://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY`)
- Improves performance: real-time notifications (~1-2s latency) vs polling delays
- Better resource efficiency: single persistent WebSocket connection vs repeated HTTP calls
- Uses viem's `watchBlockNumber` with automatic reconnection and missed block handling
- Chain-agnostic: works without hardcoded chain configuration

### Migration from polling to WebSocket

**Before (polling with interval):**
```javascript
coordinator: {
  archive: false,
  module: blockLogs.state,
  interval: 15000,  // Poll every 15 seconds
}
```

**After (WebSocket subscription):**
```javascript
coordinator: {
  archive: false,
  module: blockLogs.state,  // Now includes watch() function
}
```

The coordinator will automatically use WebSocket subscriptions when `RPC_WS_HOST` is configured and the `watch()` function is available.

## 0.5.2

- Support node 20

## 0.5.1

- (fix) 0.5.0 was labeled to only be compatible with maximally
  @attestate/crawler@0.6.1. This is now fixed.

## 0.5.0

Improvements to the aggregation function for ERC721 token transfer logs:

- We used to roughly determine the holding period of someone owning a type of
  token in the aggregation function. For example, if someone held token:0 from
  time:0 to time:2, and then token:1 from time:3 to time:4, for simplicity, we
  just said that the person then held tokens between time:0 and time:4. This is
  is obviously imprecise.
- We have now adjusted the aggregation function as to precisely list the token
  holding period as a unix time stamp on a per-token basis.

```
{
  //...
  tokens: {
    "5": [{
      start: 0,
      end: 2
    },{
      start: 3,
      end: 4
    }]
    "6": [{
      start: 10
    }]
  },
  //...
}
```

As you can see, we're now keeping track of every token precisely for how long it
has been in the address's possession. One suboptimal result that we're still
releasing in this version is inter-block token transfer tracking. The following
can appear as a user's token holdings:

```
{
  //...
  tokens: {
    "5": [{
      start: 0,
      end: 2
    },{
      start: 2,
      end: 3
    }]
  },
  //...
}
```

Here, the user did a rapid transfers of the token:5 at time:2. Maybe they sent
the token to another user, and the other use immediately sent the token back in
the same block. We call this type of interaction "inter-block transfers."

While this output is ugly, it is strictly speaking not wrong. As the runtime
complexity and readability of the code worsened when trying to fix this cosmetic
issue, I left it as is shown above.

## 0.4.5

- Add entire transaction data to output of extractor

## 0.4.4

- Add aggregate function and export in loader

## 0.4.3

- Add `args.includeValue` to extractor strategy. This downloads the transaction
  itself and adds the `value` field to the pipeline's output using
  `eth_getTransactionByHash`.

## 0.4.2

- Add `args.includeTimestamp` to extractor strategy. Now Ethereum block logs'
  timestamps can be downloaded additionally and they'll be available in the log
  at `results[].block.timestamp` as a hexa-decimal value.

## 0.4.1

- Update peerDependency @attestate/crawler to 0.6.x

## 0.4.0

- Stop using `env.VARIABLES` and instead rely on passed-in variables from the 
  crawler's lifecycle using `environment` parameter
- Add event log parsing to transformer. Using `args.inputs` a list of inputs can
  be passed to decode an event log into Solidity types.

## 0.3.0

- NOTE: This version is released with the new @attestate/crawler@0.5.0 which
  features a bunch of changes on the lifecycle API level
- (breaking) All input signatures have been adjusted to new lifecycle API
  interface.
- A new state module has been added to track the lastest local and remote state.
- For storing ordered values into the LMDB, the encoding was adjusted to store
  un-prefixed hex strings that are padded (for LMDB's ordering to work
  properly).
- All docs have been updated, but docs for the state/coordinator module are
  still TBD.

## 0.2.2

- Implement `loader` module for LMDB key-generation

## 0.2.1

- For `extractor.init`, we add `stepSize` as an input parameter to automate the
  distance between `fromBlock` and `toBlock`

## 0.2.0

- Extraction module: Add `address` and `topics` filter
- Transformation module: Change `topics0`, `topics1` and `topics2` to an array
- Add more documentation

## 0.1.0

- (breaking) Fix including `transformer.mjs` and `logger.mjs` files

## 0.0.1

- Initial release
