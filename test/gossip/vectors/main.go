// Generates test/gossip/vectors.json for test/gossip/opstack_test.mjs.
//
// Every expected result comes from optimism's own code: op-node's gossip
// block validator (p2p.BuildBlocksValidator), message id function
// (p2p.BuildMsgIdFn) and the op-service SSZ encoder and V1 block signer. The
// payload cases are the ones in op-node/p2p/gossip_test.go
// (TestBlockValidator, TestGossipTimestampThreshold); the "real" cases are OP
// mainnet blocks re-encoded and signed with a throwaway key.
//
// usage: go run . > ../vectors.json
package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"time"

	pubsub "github.com/libp2p/go-libp2p-pubsub"
	pb "github.com/libp2p/go-libp2p-pubsub/pb"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/ethereum-optimism/optimism/op-node/p2p"
	"github.com/ethereum-optimism/optimism/op-node/rollup"
	"github.com/ethereum-optimism/optimism/op-service/clock"
	"github.com/ethereum-optimism/optimism/op-service/eth"
	oplog "github.com/ethereum-optimism/optimism/op-service/log"
	opsigner "github.com/ethereum-optimism/optimism/op-service/signer"
	"github.com/ethereum-optimism/optimism/op-service/testutils"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/golang/snappy"
	"github.com/holiman/uint256"
)

// A fixed "now" so the vectors don't depend on when they're run.
const now = 1790000000

type gossipConf struct{ threshold time.Duration }

func (g gossipConf) PeerScoringParams() *p2p.ScoringParams          { return nil }
func (g gossipConf) ConfigureGossip(*rollup.Config) []pubsub.Option { return nil }
func (g gossipConf) GetGossipTimestampThreshold() time.Duration     { return g.threshold }

// createSignedP2Payload from gossip_test.go: sign the SSZ, prefix the
// signature, snappy the whole message.
func sign(raw []byte, key *ecdsa.PrivateKey, chainID uint64) []byte {
	signer := &p2p.PreparedSigner{Signer: opsigner.NewLocalSigner(key)}
	sig, err := signer.SignBlockV1(context.Background(), eth.ChainIDFromUInt64(chainID), opsigner.PayloadHash(raw))
	if err != nil {
		panic(err)
	}
	return snappy.Encode(nil, append(append([]byte{}, sig[:]...), raw...))
}

func encodePayload(p *eth.ExecutionPayload) []byte {
	var buf bytes.Buffer
	if _, err := p.MarshalSSZ(&buf); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

func encodeEnvelope(e *eth.ExecutionPayloadEnvelope) []byte {
	var buf bytes.Buffer
	if _, err := e.MarshalSSZ(&buf); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

type validatorCfg struct {
	chainID   uint64
	version   eth.BlockVersion
	signer    common.Address
	previous  common.Address
	threshold time.Duration
	jovian    *uint64
	now       int64
}

func newValidator(c validatorCfg) pubsub.ValidatorEx {
	cfg := &rollup.Config{L2ChainID: new(big.Int).SetUint64(c.chainID), JovianTime: c.jovian}
	runCfg := &testutils.MockRuntimeConfig{P2PSeqAddress: c.signer, PrevP2PSeqAddress: c.previous}
	clk := clock.NewDeterministicClock(time.Unix(c.now, 0))
	return p2p.BuildBlocksValidator(oplog.NewLogger(slog.DiscardHandler), cfg, runCfg, c.version, gossipConf{c.threshold}, clk)
}

func result(r pubsub.ValidationResult) string {
	switch r {
	case pubsub.ValidationAccept:
		return "accept"
	case pubsub.ValidationReject:
		return "reject"
	case pubsub.ValidationIgnore:
		return "ignore"
	}
	panic(r)
}

type step struct {
	Data     string `json:"data"`
	Expected string `json:"expected"`
}

type vector struct {
	Name       string  `json:"name"`
	ChainID    uint64  `json:"chainId"`
	Version    int     `json:"version"`
	Signer     string  `json:"signer"`
	Previous   string  `json:"previousSigner,omitempty"`
	Now        int64   `json:"now"`
	Threshold  int64   `json:"threshold"`
	JovianTime *uint64 `json:"jovianTime,omitempty"`
	Steps      []step  `json:"steps"`
	Number     uint64  `json:"number,omitempty"`
	Hash       string  `json:"hash,omitempty"`
	Txs        int     `json:"txs,omitempty"`
}

// Runs messages through one validator instance (so "seen" carries over) and
// records op-node's verdict for each.
func run(name string, c validatorCfg, msgs ...[]byte) vector {
	v := newValidator(c)
	var steps []step
	for _, data := range msgs {
		msg := &pubsub.Message{Message: &pb.Message{Data: data}}
		steps = append(steps, step{hex.EncodeToString(data), result(v(context.Background(), peer.ID("foo"), msg))})
	}
	out := vector{
		Name: name, ChainID: c.chainID, Version: int(c.version) + 1, Signer: c.signer.Hex(),
		Now: c.now, Threshold: int64(c.threshold.Seconds()), JovianTime: c.jovian, Steps: steps,
	}
	if c.previous != (common.Address{}) {
		out.Previous = c.previous.Hex()
	}
	return out
}

func expect(v vector, want ...string) vector {
	for i, w := range want {
		if v.Steps[i].Expected != w {
			panic(fmt.Sprintf("%s step %d: op-node says %s, gossip_test.go expects %s", v.Name, i, v.Steps[i].Expected, w))
		}
	}
	return v
}

// createExecutionPayload / createEnvelope from gossip_test.go, with the
// fixed clock instead of time.Now().
func createExecutionPayload(w types.Withdrawals, withdrawalsRoot *common.Hash, excessBlobGas, blobGasUsed *uint64, ts int64) *eth.ExecutionPayload {
	return &eth.ExecutionPayload{
		Timestamp:       hexutil.Uint64(ts),
		Withdrawals:     &w,
		WithdrawalsRoot: withdrawalsRoot,
		ExcessBlobGas:   (*eth.Uint64Quantity)(excessBlobGas),
		BlobGasUsed:     (*eth.Uint64Quantity)(blobGasUsed),
	}
}

func withHash(e *eth.ExecutionPayloadEnvelope) *eth.ExecutionPayloadEnvelope {
	e.ExecutionPayload.BlockHash, _ = e.CheckBlockHash()
	return e
}

const rpcURL = "https://mainnet.optimism.io"

func call(method string, params []any, out any) {
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	res, err := http.Post(rpcURL, "application/json", bytes.NewReader(body))
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()
	var env struct {
		Result json.RawMessage
		Error  any
	}
	if err := json.NewDecoder(res.Body).Decode(&env); err != nil {
		panic(err)
	}
	if env.Error != nil {
		panic(fmt.Sprint(env.Error))
	}
	if err := json.Unmarshal(env.Result, out); err != nil {
		panic(err)
	}
}

type header struct {
	ParentHash            common.Hash          `json:"parentHash"`
	Miner                 common.Address       `json:"miner"`
	StateRoot             common.Hash          `json:"stateRoot"`
	ReceiptsRoot          common.Hash          `json:"receiptsRoot"`
	LogsBloom             eth.Bytes256         `json:"logsBloom"`
	MixHash               common.Hash          `json:"mixHash"`
	Number                hexutil.Uint64       `json:"number"`
	GasLimit              hexutil.Uint64       `json:"gasLimit"`
	GasUsed               hexutil.Uint64       `json:"gasUsed"`
	Timestamp             hexutil.Uint64       `json:"timestamp"`
	ExtraData             hexutil.Bytes        `json:"extraData"`
	BaseFeePerGas         hexutil.Big          `json:"baseFeePerGas"`
	Hash                  common.Hash          `json:"hash"`
	BlobGasUsed           *hexutil.Uint64      `json:"blobGasUsed"`
	ExcessBlobGas         *hexutil.Uint64      `json:"excessBlobGas"`
	WithdrawalsRoot       *common.Hash         `json:"withdrawalsRoot"`
	ParentBeaconBlockRoot *common.Hash         `json:"parentBeaconBlockRoot"`
	Transactions          []*types.Transaction `json:"transactions"`
	Withdrawals           types.Withdrawals    `json:"withdrawals"`
}

// An OP mainnet block as the sequencer would gossip it (an Isthmus
// envelope); the sequencer's signature is replaced by the given key's.
func realBlock(n uint64) (*eth.ExecutionPayloadEnvelope, int) {
	var h header
	call("eth_getBlockByNumber", []any{hexutil.Uint64(n), true}, &h)
	txs := make([]eth.Data, len(h.Transactions))
	for i, tx := range h.Transactions {
		raw, err := tx.MarshalBinary()
		if err != nil {
			panic(err)
		}
		txs[i] = raw
	}
	var fee eth.Uint256Quantity
	(*uint256.Int)(&fee).SetFromBig((*big.Int)(&h.BaseFeePerGas))
	w := h.Withdrawals
	return &eth.ExecutionPayloadEnvelope{
		ParentBeaconBlockRoot: h.ParentBeaconBlockRoot,
		ExecutionPayload: &eth.ExecutionPayload{
			ParentHash: h.ParentHash, FeeRecipient: h.Miner, StateRoot: eth.Bytes32(h.StateRoot),
			ReceiptsRoot: eth.Bytes32(h.ReceiptsRoot), LogsBloom: h.LogsBloom, PrevRandao: eth.Bytes32(h.MixHash),
			BlockNumber: eth.Uint64Quantity(h.Number), GasLimit: eth.Uint64Quantity(h.GasLimit),
			GasUsed: eth.Uint64Quantity(h.GasUsed), Timestamp: eth.Uint64Quantity(h.Timestamp),
			ExtraData: eth.BytesMax32(h.ExtraData), BaseFeePerGas: fee, BlockHash: h.Hash, Transactions: txs,
			Withdrawals: &w, BlobGasUsed: (*eth.Uint64Quantity)(h.BlobGasUsed),
			ExcessBlobGas: (*eth.Uint64Quantity)(h.ExcessBlobGas), WithdrawalsRoot: h.WithdrawalsRoot,
		},
	}, len(txs)
}

func main() {
	key, _ := crypto.GenerateKey()
	other, _ := crypto.GenerateKey()
	addr := crypto.PubkeyToAddress(key.PublicKey)
	otherAddr := crypto.PubkeyToAddress(other.PublicKey)

	var vectors []vector

	// TestBlockValidator (chain 100, 60 s threshold)
	zero, one := uint64(0), uint64(1)
	beaconHash, withdrawalsRoot := common.HexToHash("0x1234"), common.HexToHash("0x9876")
	jovianAtGenesis := uint64(0)
	base := func(v eth.BlockVersion) validatorCfg {
		return validatorCfg{chainID: 100, version: v, signer: addr, threshold: 60 * time.Second, now: now}
	}
	payloadCase := func(name string, v eth.BlockVersion, p *eth.ExecutionPayload, want string) {
		withHash(&eth.ExecutionPayloadEnvelope{ExecutionPayload: p})
		vectors = append(vectors, expect(run(name, base(v), sign(encodePayload(p), key, 100)), want))
	}
	envelopeCase := func(name string, c validatorCfg, e *eth.ExecutionPayloadEnvelope, want string) {
		withHash(e)
		vectors = append(vectors, expect(run(name, c, sign(encodeEnvelope(e), key, 100)), want))
	}
	payloadCase("ExecutionPayload_V2Valid", eth.BlockV2, createExecutionPayload(types.Withdrawals{}, nil, nil, nil, now), "accept")
	payloadCase("ExecutionPayload_V2NonZeroWithdrawals", eth.BlockV2, createExecutionPayload(types.Withdrawals{&types.Withdrawal{Index: 1, Validator: 1}}, nil, nil, nil, now), "reject")
	payloadCase("ExecutionPayload_V2NonZeroBlobProperties", eth.BlockV2, createExecutionPayload(types.Withdrawals{}, nil, &zero, &zero, now), "reject")
	payloadCase("ExecutionPayload_V3RejectExecutionPayload", eth.BlockV3, createExecutionPayload(types.Withdrawals{}, nil, &zero, &zero, now), "reject")
	envelopeCase("ExecutionPayloadEnvelope_V3RejectNonZeroExcessGas", base(eth.BlockV3), &eth.ExecutionPayloadEnvelope{ParentBeaconBlockRoot: &beaconHash, ExecutionPayload: createExecutionPayload(types.Withdrawals{}, nil, &one, &zero, now)}, "reject")
	envelopeCase("ExecutionPayloadEnvelope_V3RejectNonZeroBlobGasUsed", base(eth.BlockV3), &eth.ExecutionPayloadEnvelope{ParentBeaconBlockRoot: &beaconHash, ExecutionPayload: createExecutionPayload(types.Withdrawals{}, nil, &zero, &one, now)}, "reject")
	envelopeCase("ExecutionPayloadEnvelope_V3Valid", base(eth.BlockV3), &eth.ExecutionPayloadEnvelope{ParentBeaconBlockRoot: &beaconHash, ExecutionPayload: createExecutionPayload(types.Withdrawals{}, nil, &zero, &zero, now)}, "accept")
	envelopeCase("ExecutionPayloadEnvelope_V4Valid", base(eth.BlockV4), &eth.ExecutionPayloadEnvelope{ParentBeaconBlockRoot: &beaconHash, ExecutionPayload: createExecutionPayload(types.Withdrawals{}, &withdrawalsRoot, &zero, &zero, now)}, "accept")
	envelopeCase("ExecutionPayloadEnvelope_V4RejectNoWithdrawalRoot", base(eth.BlockV4), &eth.ExecutionPayloadEnvelope{ParentBeaconBlockRoot: &beaconHash, ExecutionPayload: createExecutionPayload(types.Withdrawals{}, nil, &zero, &zero, now)}, "reject")
	jovian := base(eth.BlockV4)
	jovian.jovian = &jovianAtGenesis
	envelopeCase("ExecutionPayloadEnvelope_V4AcceptNonZeroBlobGasUsedJovian", jovian, &eth.ExecutionPayloadEnvelope{ParentBeaconBlockRoot: &beaconHash, ExecutionPayload: createExecutionPayload(types.Withdrawals{}, &withdrawalsRoot, &zero, &one, now)}, "accept")

	// TestGossipTimestampThreshold (V2 payloads)
	for _, tc := range []struct {
		name      string
		threshold time.Duration
		age       int64
		want      string
	}{
		{"AcceptWithinThreshold", 30 * time.Second, 15, "accept"},
		{"RejectOutsideThreshold", 30 * time.Second, 45, "reject"},
		{"AcceptWithLongerThreshold", 120 * time.Second, 90, "accept"},
	} {
		p := createExecutionPayload(types.Withdrawals{}, nil, nil, nil, now-tc.age)
		p.BlockNumber = hexutil.Uint64(now)
		withHash(&eth.ExecutionPayloadEnvelope{ExecutionPayload: p})
		c := base(eth.BlockV2)
		c.threshold = tc.threshold
		vectors = append(vectors, expect(run("TimestampThreshold_"+tc.name, c, sign(encodePayload(p), key, 100)), tc.want))
	}

	// Real OP mainnet blocks (chain 10, Jovian since 1764691201): the first
	// holds a Delegate log of Kiwi's Delegator3.
	opJovian := uint64(1764691201)
	var realMessage []byte
	for _, n := range []uint64{158327753, 158327752} {
		e, txs := realBlock(n)
		raw := encodeEnvelope(e)
		ts := int64(e.ExecutionPayload.Timestamp)
		c := validatorCfg{chainID: 10, version: eth.BlockV4, signer: addr, threshold: 60 * time.Second, jovian: &opJovian, now: ts + 2}
		good := sign(raw, key, 10)
		if realMessage == nil {
			realMessage = good
		}
		named := func(name string, v vector) vector {
			v.Number, v.Hash, v.Txs = n, e.ExecutionPayload.BlockHash.Hex(), txs
			v.Name = fmt.Sprintf("Real_%d_%s", n, name)
			return v
		}
		// Valid, then the same block again (ignored as seen).
		vectors = append(vectors, named("ValidThenSeen", run("", c, good, good)))

		tampered := snappy.Encode(nil, func() []byte {
			d, _ := snappy.Decode(nil, good)
			d[65+600] ^= 1 // inside the payload, after the fixed part
			return d
		}())
		vectors = append(vectors, named("Tampered", run("", c, tampered)))
		vectors = append(vectors, named("OtherSigner", run("", c, sign(raw, other, 10))))
		vectors = append(vectors, named("WrongChain", run("", c, sign(raw, key, 8453))))
		prev := c
		prev.signer, prev.previous = otherAddr, addr
		vectors = append(vectors, named("PreviousSigner", run("", prev, good)))
		none := c
		none.signer = common.Address{}
		vectors = append(vectors, named("NoSequencer", run("", none, good)))
		old := c
		old.now = ts + 61
		vectors = append(vectors, named("TooOld", run("", old, good)))
		future := c
		future.now = ts - 6
		vectors = append(vectors, named("TooNew", run("", future, good)))
		preJovian := c
		preJovian.jovian = nil
		vectors = append(vectors, named("BlobGasBeforeJovian", run("", preJovian, good)))
		v3 := c
		v3.version = eth.BlockV3
		vectors = append(vectors, named("WrongTopicVersion", run("", v3, good)))
		badHash := func() []byte {
			copyE := *e
			p := *e.ExecutionPayload
			p.BlockHash = common.Hash{1}
			copyE.ExecutionPayload = &p
			return sign(encodeEnvelope(&copyE), key, 10)
		}()
		vectors = append(vectors, named("BadBlockHash", run("", c, badHash)))
		vectors = append(vectors, named("NotSnappy", run("", c, []byte("not snappy at all"))))
		vectors = append(vectors, named("Undersized", run("", c, snappy.Encode(nil, make([]byte, 65)))))
	}

	// BuildMsgIdFn
	msgIdFn := p2p.BuildMsgIdFn(&rollup.Config{L2ChainID: big.NewInt(10)})
	type idVector struct {
		Topic string `json:"topic"`
		Data  string `json:"data"`
		ID    string `json:"id"`
	}
	var ids []idVector
	for _, d := range [][]byte{realMessage, []byte("not snappy at all")} {
		for _, topic := range []string{"/optimism/10/3/blocks", "/optimism/10/2/blocks"} {
			id := msgIdFn(&pb.Message{Data: d, Topic: &topic})
			ids = append(ids, idVector{topic, hex.EncodeToString(d), hex.EncodeToString([]byte(id))})
		}
	}

	out, _ := json.MarshalIndent(map[string]any{"validator": vectors, "msgId": ids}, "", " ")
	fmt.Fprintln(os.Stdout, string(out))
}
