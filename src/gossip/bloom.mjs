// @format
// A block header's logsBloom (2048 bits) has, for every log in the block,
// three bits set for its address and for each of its topics. It never
// misses a log, including logs emitted in internal calls (smart wallets,
// ERC-4337), but can match a block without one.
import { hexToBytes, keccak256 } from "viem";

export function contains(bloom, value) {
  const hash = hexToBytes(keccak256(value));
  for (let i = 0; i < 6; i += 2) {
    const bit = ((hash[i] << 8) | hash[i + 1]) & 2047;
    if ((bloom[255 - (bit >> 3)] & (1 << (bit & 7))) === 0) return false;
  }
  return true;
}

// eth_getLogs filter semantics: `address` is one address or a list (any of
// them), `topics` a list of positions where null (or an empty list)
// matches anything and a list matches any of its entries.
export function matches(bloom, { address, topics = [] }) {
  const any = (values) => {
    const list = [values].flat().filter((v) => v !== null && v !== undefined);
    return list.length === 0 || list.some((v) => contains(bloom, v));
  };
  return any(address) && topics.every(any);
}
