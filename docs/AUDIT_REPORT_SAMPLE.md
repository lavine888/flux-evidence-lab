# Audit Report Sample

This directory contains two real artifacts generated from the current source checkout:

- [`../examples/offline-constructive.json`](../examples/offline-constructive.json): model `BUY`, risk `PASS`, Paper order accepted locally;
- [`../examples/risk-limit.json`](../examples/risk-limit.json): model `BUY`, deterministic `ORDER_NOTIONAL_LIMIT` veto, final `HOLD`, no order.

They are produced by running `node tools/review-evidence.mjs`. The command invokes the same core decision and the repository's separate verifier entrypoint used by the application; it does not hand-assemble a JSON fixture. This is a separate replay path, not an independently reimplemented reference implementation, so shared deterministic primitives remain part of the trust boundary. Each run creates an ephemeral Ed25519 key and a new `signed_at`, so signatures and byte counts are expected to change. The examples contain synthetic offline evidence only; the public API runner records status and counts in memory and never writes raw public responses.

## Complete Decision Record

| Audit field | Artifact location | Meaning |
| --- | --- | --- |
| Research ID | `research_id` and `steps[0].payload.research_id` | Stable identifier for the normalized evidence snapshot |
| Decision ID | `decision_id` and every step | Identifier shared by evidence, model, risk, and order stages |
| Evidence sources | `steps[0].payload.evidence_items` and `source_health` | Source, classification, role, value, transform, and status |
| Retrieved at / as of | `steps[0].payload.collection` and each source | Collection time is kept distinct from source observation time |
| Feature set | `steps[1].payload.feature_vector` | The bounded inputs used by the model |
| Model version | `model.model_version` and model step | Frozen model identity and inference role |
| Candidate action | `outcome.candidate_action` and model step | Action directly selected by the model probability output |
| Risk rules | `steps[2].payload.rules` and `failed_rule_ids` | Deterministic Paper-only checks and any veto reason |
| Final decision | `outcome.final_action`, `risk_status`, `risk_vetoed` | Risk-constrained result after the model proposal |
| Paper result | `steps[3].payload` | Local simulated order or explicit `NOT_CREATED` reason |
| Hash chain | `steps[*].previous_hash` and `hash` | Ordered SHA-256 evidence/model/risk/order chain |
| Signature | `signature.manifest`, public key, fingerprint, signature | Ed25519 binding of the unsigned artifact and chain head |
| Verification result | `tools/review-evidence.mjs --verify-examples` | Separate replay and signature result; expected `PASS` |
| Limitations | `limitations`, `model.performance_claim`, and model card | No accuracy, calibration, profitability, upstream-truth, or trusted-time claim |
| Disclaimer | `disclaimer` and evidence payload | Synthetic/public demo boundary; not investment advice or live trading |

## Reproduce and Verify

From the repository root:

```powershell
node tools/review-evidence.mjs
node tools/review-evidence.mjs --verify-examples
```

The default command runs ten direct offline constructive decisions, ten risk-limit decisions, ten tamper checks, writes the two examples, performs local API smoke checks, and attempts three `public-btc-live` requests. Public network failure is recorded as `EXTERNAL_DEPENDENCY_UNAVAILABLE`; it must not be rewritten as a successful live-source result. Set `FLUX_PUBLIC_TIMEOUT_MS` or `FLUX_PUBLIC_ATTEMPTS` only when documenting a deliberate test variation.

## Integrity and Safety Limits

The verifier proves that the signed artifact still matches its decision chain, deterministic replay, Paper-only policy, and Ed25519 signature. It does not prove that an upstream provider was truthful, that sources were synchronized, that the model is accurate, or that a simulated action would be profitable. The runtime signer is ephemeral rather than a long-term identity. TEE / ZKP is not used in this prototype. No real funds, exchange, wallet, or external order route is involved.
