# crawler-call-block-logs

> An `@attestate/crawler` strategy to download and transform Ethereum block
> event logs.

- How do I use this: [Documentation](https://attestate.com/crawler-call-block-logs/main)
- What is `@attestate/crawler`: [Information](https://attestate.com/crawler/main)
- How do I build my own strategy: [Specification](https://attestate.com/crawler/main/strategy-specification.html)

## Following OP Stack block gossip

By default, the coordinator's `state.watch()` polls `eth_blockNumber` every
`environment.pollingInterval` ms and triggers a crawl for every new block. On
OP Stack chains it can instead follow the sequencer's block gossip, as
op-node does (libp2p gossipsub, peers found through discv5):

```js
environment: {
  rpcHttpHost: "https://mainnet.optimism.io",
  gossip: "optimism", // or true, or { network: "optimism", udpPort: 9200, maxPeers: 30 }
}
```

Every gossiped block is checked like op-node checks it (sequencer signature,
payload, block hash). A crawl is triggered only when a block's `logsBloom`
may hold a log matching the extractor's `args.address` and `args.topics`,
or after blocks were missed in the gossip. The crawl then fetches the logs
since the last scan with `eth_getLogs` as before, once the RPC node has the
block (it waits up to a minute for the node to catch up). On OP mainnet,
about 0.25% of blocks match a filter by chance (~100 a day), so instead of
an `eth_blockNumber` and an `eth_getLogs` call every polling interval, the
RPC is only called for those and for the blocks that do hold matching logs.
Without `args.address` and `args.topics`, every block matches.

- Only OP Stack chains are supported. `optimism` (OP mainnet) is built in;
  for other chains pass `network: { chainId, signer, jovianTime, bootnodes }`
  where `signer` is the chain's `SystemConfig.unsafeBlockSigner`.
- It needs outbound TCP (to peers) and UDP (discv5, `udpPort`, default 9200).
  If it can't join the network at startup, `watch()` falls back to polling.
- `rpcHttpHost` is still needed: for the initial catch-up crawl and for the
  logs of the blocks the bloom flags.

## License

See LICENSE file.
