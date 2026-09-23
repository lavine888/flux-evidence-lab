# Contributing

Flux Evidence Lab is an evidence-bound, verifiable paper-decision prototype. It preserves the full decision trail behind an AI-assisted decision and lets anyone re-verify it. A change is mergeable only if the audit artifact stays independently verifiable.

## Project invariants

1. **Model proposes, risk decides.** The final action comes from deterministic risk rules, never from the model.
2. **Paper-only boundary.** No exchange, wallet, credential, order-route, or live-execution code path may be added.
3. **Verifiable artifacts.** Every run produces a signed artifact that the independent verifier (`verifyDecisionArtifact` / `tools/review-evidence.mjs`) can check without the UI.
4. **Deterministic offline baseline.** Committed fixtures reproduce the same result; the offline path has no hidden network or wall-clock dependence.
5. **Fail closed.** Missing, conflicting, or invalid evidence blocks the action instead of being guessed.
6. **No claims.** No investment, performance, or accuracy claims in code, docs, or copy.

## Welcome contributions

- New deterministic offline fixtures and scenarios.
- New risk rules with boundary and failure tests.
- Evidence-schema and verifier improvements that keep verification independent.
- Corrections to the audit mapping, compliance boundary, and docs.

## Hard rules

- Do not add exchange, wallet, credential, or live-execution connectivity.
- Do not commit secrets, keys, account data, or references to real funds.
- Do not weaken or bypass the signing/verification path.
- Tests and the offline verifier must run without network access.
- No new dependency without a stated reason.

## Local verification

CI runs the same commands on `windows-latest`; please run them before opening a PR:

```powershell
cd app
npm ci --ignore-scripts
npm run check
npm test
cd ..
node tools/review-evidence.mjs --verify-examples
```

`examples/` holds committed audit artifacts; `--verify-examples` re-checks them offline.

## Commit messages

Conventional Commits, English or Chinese:

```text
feat: add a risk-limit boundary fixture
fix: keep the verifier independent of the console
docs: clarify the paper-only boundary
```

## Pull request checklist

- [ ] `npm run check` and `npm test` pass in `app/`.
- [ ] `node tools/review-evidence.mjs --verify-examples` passes.
- [ ] No exchange, wallet, or execution connectivity was added.
- [ ] No secrets or real-account data.
- [ ] Artifact-schema changes update the verifier, `examples/`, and docs.
- [ ] No investment, performance, or accuracy claim was introduced.

## Boundary

This repository is a competition demonstration and software-research prototype — not a broker, exchange, investment adviser, custodian, wallet, or live execution service. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md) for the complete boundary.
