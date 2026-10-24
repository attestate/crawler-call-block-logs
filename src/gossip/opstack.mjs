// @format
// OP Stack block gossip, as op-node publishes and validates it: message ids,
// the sequencer's block signature, the SSZ execution payload and the block
// hash. Ported from optimism's op-node/p2p/gossip.go (BuildBlocksValidator,
// BuildMsgIdFn), op-service/signer (V1 block signing) and op-service/eth
// (ssz.go, CheckBlockHash). test/gossip/opstack_test.mjs runs op-node's own
// validator tests against vectors made by that Go code.
import { createHash } from "crypto";

import SnappyJS from "snappyjs";
import { createMPT } from "@ethereumjs/mpt";
import {
  bytesToHex,
  concat,
  hexToBytes,
  keccak256,
  numberToHex,
  recoverAddress,
  toRlp,
} from "viem";

export const MAX_GOSSIP_SIZE = 10 * (1 << 20);
const MIN_GOSSIP_SIZE = 66;
const MAX_WITHDRAWALS = 1 << 4;
const MAX_TRANSACTIONS = 1 << 20;
const WITHDRAWAL_SIZE = 8 + 8 + 20 + 8;
const EMPTY_UNCLE_HASH =
  "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347";
const EMPTY_REQUESTS_HASH =
  "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// Topic /optimism/<chainId>/<n>/blocks carries payload version n + 1.
export function topics(chainId) {
  return Object.fromEntries(
    [1, 2, 3, 4].map((version) => [
      `/optimism/${chainId}/${version - 1}/blocks`,
      version,
    ]),
  );
}

export function uncompress(data) {
  return SnappyJS.uncompress(data, MAX_GOSSIP_SIZE);
}

// BuildMsgIdFn: sha256(domain ‖ len(topic) as LE u64 ‖ topic ‖ data)[:20],
// where data is the uncompressed message if it's valid snappy.
export function msgId(topic, data) {
  let body = data;
  let domain = Uint8Array.of(0, 0, 0, 0);
  try {
    body = uncompress(data);
    domain = Uint8Array.of(1, 0, 0, 0);
  } catch {}
  const len = Buffer.alloc(8);
  len.writeBigUInt64LE(BigInt(topic.length));
  const hash = createHash("sha256")
    .update(domain)
    .update(len)
    .update(topic)
    .update(body)
    .digest();
  return new Uint8Array(hash.subarray(0, 20));
}

// BlockSigningMessage.ToSigningHash with SigningDomainBlocksV1 (32 zero
// bytes): keccak256(domain ‖ chainId as 32 bytes ‖ keccak256(payload)).
export function signingHash(payload, chainId) {
  return keccak256(
    concat([
      bytesToHex(new Uint8Array(32)),
      numberToHex(BigInt(chainId), { size: 32 }),
      keccak256(payload),
    ]),
  );
}

export async function recoverSigner(signature, payload, chainId) {
  const sig = new Uint8Array(signature);
  // Go's crypto.Sign gives v as 0 or 1.
  if (sig[64] > 1) return null;
  sig[64] += 27;
  try {
    const address = await recoverAddress({
      hash: signingHash(payload, chainId),
      signature: bytesToHex(sig),
    });
    return address.toLowerCase();
  } catch {
    return null;
  }
}

// verifyBlockSignature: the current unsafe block signer, or the previous one
// during a signer rotation's grace period.
export async function verifyBlockSignature(
  signature,
  payload,
  { chainId, signer, previousSigner },
) {
  if (!signer || BigInt(signer) === 0n) return "ignore";
  const recovered = await recoverSigner(signature, payload, chainId);
  const allowed = [signer, previousSigner]
    .filter((a) => a && BigInt(a) !== 0n)
    .map((a) => a.toLowerCase());
  return recovered && allowed.includes(recovered) ? "accept" : "reject";
}

const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u32 = (b, o) => view(b).getUint32(o, true);
const u64 = (b, o) => view(b).getBigUint64(o, true);

function uint256LE(b) {
  let n = 0n;
  for (let i = 31; i >= 0; i--) n = (n << 8n) | BigInt(b[i]);
  return n;
}

// Fixed part sizes (op-service/eth/ssz.go blockV1FixedPart …)
const FIXED = { 1: 508, 2: 512, 3: 528, 4: 560 };

function decodeTransactions(list) {
  if (list.length === 0) return [];
  if (list.length < 4) throw new Error("not enough scope for first tx offset");
  const first = u32(list, 0);
  if (first % 4 !== 0) throw new Error("first tx offset not a multiple of 4");
  if (first > list.length) throw new Error("first tx offset out of scope");
  const count = first / 4;
  if (count === 0) throw new Error("no transactions in scope");
  if (count > MAX_TRANSACTIONS) throw new Error("too many transactions");
  const txs = [];
  let current = first;
  for (let i = 0; i < count; i++) {
    const next = i + 1 < count ? u32(list, (i + 1) * 4) : list.length;
    if (next < current || next > list.length)
      throw new Error(`tx ${i} has a bad next offset`);
    txs.push(list.subarray(current, next));
    current = next;
  }
  return txs;
}

function decodeWithdrawals(list) {
  if (list.length % WITHDRAWAL_SIZE !== 0)
    throw new Error("invalid withdrawals data");
  const count = list.length / WITHDRAWAL_SIZE;
  if (count > MAX_WITHDRAWALS) throw new Error("too many withdrawals");
  const withdrawals = [];
  for (let i = 0; i < count; i++) {
    const w = list.subarray(i * WITHDRAWAL_SIZE);
    withdrawals.push({
      index: u64(w, 0),
      validator: u64(w, 8),
      address: bytesToHex(w.subarray(16, 36)),
      amount: u64(w, 36),
    });
  }
  return withdrawals;
}

// ExecutionPayload(Envelope).UnmarshalSSZ for a topic's payload version.
// Versions 3 and 4 are envelopes that start with the parent beacon root.
export function decodePayload(version, bytes) {
  let parentBeaconBlockRoot = null;
  let p = bytes;
  if (version >= 3) {
    if (p.length < 32) throw new Error("scope too small");
    parentBeaconBlockRoot = bytesToHex(p.subarray(0, 32));
    p = p.subarray(32);
  }
  const fixed = FIXED[version];
  if (!fixed) throw new Error(`unknown payload version ${version}`);
  if (p.length < fixed) throw new Error("scope too small for payload");
  const extraOffset = u32(p, 436);
  if (extraOffset !== fixed) throw new Error("unexpected extra data offset");
  const txOffset = u32(p, 504);
  if (txOffset < extraOffset) throw new Error("bad transactions offset");
  let withdrawalsOffset = p.length;
  if (version >= 2) {
    withdrawalsOffset = u32(p, 508);
    if (withdrawalsOffset < txOffset) throw new Error("bad withdrawals offset");
    if (withdrawalsOffset > p.length) throw new Error("withdrawals offset too large");
  }
  if (txOffset > extraOffset + 32 || txOffset > p.length)
    throw new Error("extra data is too large");

  return {
    parentBeaconBlockRoot,
    parentHash: bytesToHex(p.subarray(0, 32)),
    feeRecipient: bytesToHex(p.subarray(32, 52)),
    stateRoot: bytesToHex(p.subarray(52, 84)),
    receiptsRoot: bytesToHex(p.subarray(84, 116)),
    logsBloom: p.subarray(116, 372),
    prevRandao: bytesToHex(p.subarray(372, 404)),
    number: u64(p, 404),
    gasLimit: u64(p, 412),
    gasUsed: u64(p, 420),
    timestamp: u64(p, 428),
    baseFeePerGas: uint256LE(p.subarray(440, 472)),
    hash: bytesToHex(p.subarray(472, 504)),
    blobGasUsed: version >= 3 ? u64(p, 512) : null,
    excessBlobGas: version >= 3 ? u64(p, 520) : null,
    withdrawalsRoot: version >= 4 ? bytesToHex(p.subarray(528, 560)) : null,
    extraData: bytesToHex(p.subarray(extraOffset, txOffset)),
    transactions: decodeTransactions(p.subarray(txOffset, withdrawalsOffset)),
    withdrawals:
      version >= 2 ? decodeWithdrawals(p.subarray(withdrawalsOffset)) : null,
  };
}

// types.DeriveSha: the root of a trie keyed by rlp(index).
async function deriveSha(items) {
  const trie = await createMPT();
  for (let i = 0; i < items.length; i++) {
    await trie.put(hexToBytes(toRlp(int(i))), items[i]);
  }
  return bytesToHex(trie.root());
}

const int = (n) => (BigInt(n) === 0n ? "0x" : numberToHex(BigInt(n)));

// ExecutionPayloadEnvelope.CheckBlockHash: rebuild the header and hash it.
export async function blockHash(block) {
  const header = [
    block.parentHash,
    EMPTY_UNCLE_HASH,
    block.feeRecipient,
    block.stateRoot,
    await deriveSha(block.transactions),
    block.receiptsRoot,
    bytesToHex(block.logsBloom),
    "0x", // difficulty
    int(block.number),
    int(block.gasLimit),
    int(block.gasUsed),
    int(block.timestamp),
    block.extraData,
    block.prevRandao,
    "0x0000000000000000", // nonce
    int(block.baseFeePerGas),
  ];
  if (block.withdrawalsRoot !== null) {
    header.push(block.withdrawalsRoot); // Isthmus
  } else if (block.withdrawals !== null) {
    header.push(
      await deriveSha(
        block.withdrawals.map((w) =>
          hexToBytes(
            toRlp([int(w.index), int(w.validator), w.address, int(w.amount)]),
          ),
        ),
      ),
    ); // Canyon
  }
  if (block.blobGasUsed !== null) {
    header.push(int(block.blobGasUsed), int(block.excessBlobGas));
  }
  if (block.parentBeaconBlockRoot !== null) header.push(block.parentBeaconBlockRoot);
  if (block.withdrawalsRoot !== null) header.push(EMPTY_REQUESTS_HASH);
  return keccak256(toRlp(header));
}

// BuildBlocksValidator, minus libp2p: returns "accept", "reject" or
// "ignore" with the decoded block. `signer` (and during a rotation
// `previousSigner`) is the chain's unsafe block signer, `now` is in seconds,
// `seen` maps block numbers to the hashes seen at that height and is
// updated.
export async function validate(
  data,
  {
    version,
    chainId,
    signer,
    previousSigner,
    now = Math.floor(Date.now() / 1000),
    threshold = 60,
    jovianTime = Infinity,
    seen = new Map(),
  },
) {
  const reject = (reason) => ({ result: "reject", reason });

  let message;
  try {
    message = uncompress(data);
  } catch (err) {
    return reject(`invalid snappy compression: ${err.message}`);
  }
  if (message.length < MIN_GOSSIP_SIZE) return reject("undersized payload");

  const signature = message.subarray(0, 65);
  const payload = message.subarray(65);

  const verdict = await verifyBlockSignature(signature, payload, {
    chainId,
    signer,
    previousSigner,
  });
  if (verdict === "ignore") return { result: "ignore", reason: "no sequencer address" };
  if (verdict === "reject") return reject("invalid block signature");

  let block;
  try {
    block = decodePayload(version, payload);
  } catch (err) {
    return reject(`invalid payload: ${err.message}`);
  }

  const timestamp = Number(block.timestamp);
  if (timestamp < now - threshold) return reject("payload is too old");
  if (timestamp > now + 5) return reject("payload is too new");

  if ((await blockHash(block)) !== block.hash) return reject("bad block hash");

  if (version >= 2 && block.withdrawals.length !== 0)
    return reject("non-empty withdrawals");
  if (version >= 3) {
    if (timestamp < jovianTime && block.blobGasUsed !== 0n)
      return reject("non-zero blob gas used before Jovian");
    if (block.excessBlobGas !== 0n) return reject("non-zero excess blob gas");
  }

  const height = block.number;
  const hashes = seen.get(height) ?? new Set();
  seen.set(height, hashes);
  if (hashes.size > 5) return reject("too many blocks at the same height");
  if (hashes.has(block.hash)) return { result: "ignore", reason: "seen", block };
  hashes.add(block.hash);
  if (seen.size > 1000) seen.delete(seen.keys().next().value);

  return { result: "accept", block };
}
