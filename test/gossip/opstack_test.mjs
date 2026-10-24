// @format
// op-node's own gossip validator tests, run against src/gossip/opstack.mjs.
// vectors.json is made by vectors/main.go with optimism's Go code: the cases
// from op-node/p2p/gossip_test.go plus real OP mainnet blocks, each with
// op-node's verdict.
import { readFileSync } from "fs";

import test from "ava";
import { bytesToHex, hexToBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount, sign } from "viem/accounts";

import * as opstack from "../../src/gossip/opstack.mjs";
import { matches } from "../../src/gossip/bloom.mjs";

const vectors = JSON.parse(
  readFileSync(new URL("./vectors.json", import.meta.url), "utf8"),
);
const bytes = (hex) => hexToBytes(`0x${hex}`);

for (const v of vectors.validator) {
  test(`op-node validator: ${v.name}`, async (t) => {
    const seen = new Map();
    for (const [i, step] of v.steps.entries()) {
      const { result, reason } = await opstack.validate(bytes(step.data), {
        version: v.version,
        chainId: v.chainId,
        signer: BigInt(v.signer) === 0n ? null : v.signer,
        previousSigner: v.previousSigner,
        now: v.now,
        threshold: v.threshold,
        jovianTime: v.jovianTime ?? Infinity,
        seen,
      });
      t.is(result, step.expected, `step ${i}: ${reason}`);
    }
  });
}

test("real blocks decode to their number, hash and transactions", async (t) => {
  const real = vectors.validator.filter((v) => v.name.endsWith("ValidThenSeen") && v.number);
  t.is(real.length, 2);
  for (const v of real) {
    const message = opstack.uncompress(bytes(v.steps[0].data));
    const block = opstack.decodePayload(v.version, message.subarray(65));
    t.is(block.number, BigInt(v.number));
    t.is(block.hash, v.hash.toLowerCase());
    t.is(block.transactions.length, v.txs);
    t.is(await opstack.blockHash(block), block.hash);
  }
});

test("the logs bloom flags the block with Kiwi's delegation only", (t) => {
  const filter = {
    address: "0x418910fef46896eb0bfe38f656e2f7df3eca7198",
    topics: ["0xcd9cc59d1cc3aa17955023d009176720c8a383000a973ae2933c1cf6cbeee480"],
  };
  const bloomOf = (name) => {
    const v = vectors.validator.find((v) => v.name === name);
    const message = opstack.uncompress(bytes(v.steps[0].data));
    return opstack.decodePayload(v.version, message.subarray(65)).logsBloom;
  };
  t.true(matches(bloomOf("Real_158327753_ValidThenSeen"), filter));
  t.false(matches(bloomOf("Real_158327752_ValidThenSeen"), filter));
});

for (const [i, v] of vectors.msgId.entries()) {
  test(`op-node message id ${i} (${v.topic})`, (t) => {
    t.is(bytesToHex(opstack.msgId(v.topic, bytes(v.data))), `0x${v.id}`);
  });
}

// TestVerifyBlockSignature, including the signer rotation grace period.
async function signV1(key, payload, chainId) {
  const sig = hexToBytes(
    await sign({ hash: opstack.signingHash(payload, chainId), privateKey: key, to: "hex" }),
  );
  sig[64] -= 27; // Go's crypto.Sign: v is 0 or 1
  return sig;
}

test("verifyBlockSignature: op-node's cases", async (t) => {
  const msg = new TextEncoder().encode("any msg");
  const chainId = 100;
  const [secrets, newSecrets, thirdSecrets] = [
    generatePrivateKey(),
    generatePrivateKey(),
    generatePrivateKey(),
  ];
  const address = (k) => privateKeyToAccount(k).address;
  const verify = async (key, signer, previousSigner) =>
    opstack.verifyBlockSignature(await signV1(key, msg, chainId), msg, {
      chainId,
      signer,
      previousSigner,
    });

  t.is(await verify(secrets, address(secrets)), "accept", "Valid");
  t.is(await verify(secrets, "0x0000000000000000000000000000000000001234"), "reject", "WrongSigner");
  t.is(
    await opstack.verifyBlockSignature(new Uint8Array(65), msg, { chainId, signer: address(secrets) }),
    "reject",
    "InvalidSignature",
  );
  t.is(await verify(secrets, null), "ignore", "NoSequencer");

  const cases = [
    ["PreviousSignerAccepted", address(newSecrets), address(secrets), secrets, "accept"],
    ["NewSignerConfirms", address(newSecrets), address(secrets), newSecrets, "accept"],
    ["GracePeriodExpired", address(newSecrets), null, secrets, "reject"],
    ["ThirdPartySignerRejected", address(newSecrets), address(secrets), thirdSecrets, "reject"],
    ["ValidNoGracePeriod", address(secrets), null, secrets, "accept"],
  ];
  for (const [name, current, previous, key, want] of cases) {
    t.is(await verify(key, current, previous), want, name);
  }
});
