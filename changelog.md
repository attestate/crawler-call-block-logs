# Changelog

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
