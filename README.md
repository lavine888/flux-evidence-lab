# Flux Evidence Lab

**Verifiable evidence and audit infrastructure for AI-assisted financial decisions.**

Flux Evidence Lab is a BTC research and decision-audit prototype for the AIx Origin Summit Flux track. It connects public or offline evidence to deterministic feature transforms, a versioned probabilistic model, deterministic risk controls, a local paper simulation, and an independently verifiable audit artifact.

> **This is not a live trading system.**
>
> Public evidence + paper-only simulation · no exchange · no wallet · no real funds

![Flux Evidence Lab judge console](promo/agent-ui/dashboard-full.png)

## Why this matters

A `BUY`, `HOLD`, or `SELL` label is not enough for a research or risk reviewer. The useful question is whether the result can be traced from evidence to model inputs, risk decisions, simulated outcome, and post-run integrity checks.

Flux Evidence Lab makes that path explicit:

```text
Evidence → Decision → Risk → Result → Verification
```

The goal is not to claim that the demo model predicts markets or produces returns. The goal is to make AI-assisted financial decisions traceable, explainable, reproducible, and independently reviewable.

## Core architecture

```text
Public / offline evidence
        ↓
Deterministic, whitelisted feature transforms
        ↓
btc-multinomial-logit@1.0.0
        ↓
Candidate BUY / HOLD / SELL
        ↓
btc-paper-risk@1.1.0 deterministic veto
        ↓
Local paper order or NOT_CREATED
        ↓
SHA-256 chain + ephemeral Ed25519 signature
        ↓
Separate verification path and tamper detection
```

The responsibility boundary is deliberate:

- **Model proposes.** The transparent multinomial logistic model directly produces the candidate action, class probabilities, and per-feature contributions.
- **Risk decides.** The deterministic Paper risk layer is the final authority and can return `HOLD` after a `BUY` or `SELL` candidate.
- **Paper simulates.** Orders, balances, positions, and fills are local demo records only; there is no external order route.
- **Verifier checks.** The verifier replays evidence normalization, model inference, risk evaluation, order construction, the four-step hash chain, and the Ed25519 signature.

The detailed component and trust-boundary diagram is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/architecture-diagram.svg`](docs/architecture-diagram.svg).

## How it works

1. Evidence is normalized with source, classification, observation time, and a stable `research_id`.
2. `public-btc-live` reads four keyless public sources when requested: CoinLore, Coin Metrics Community, Alternative.me, and GitHub `bitcoin/bitcoin`. Their retrieval time and source time remain separate; responses are not cached or written to disk.
3. The versioned model maps eight bounded features to `BUY` / `HOLD` / `SELL` probabilities and factor contributions. Its parameters are transparent demo parameters, not evidence of accuracy, calibration, or profitability.
4. `btc-paper-risk@1.1.0` checks Paper-only mode, per-metric freshness, future evidence, feature coverage, public-source health, reference-price binding, model confidence, notional, position, inventory, and daily order limits.
5. A passing actionable decision creates a local `SIMULATED_ACCEPTED` order. A `HOLD` or a risk veto creates `NOT_CREATED`; no exchange or wallet operation exists.
6. The `evidence → model → risk → order` payloads share a `decision_id`, form a SHA-256 chain, and are signed by an ephemeral Ed25519 runtime key. The private key is never written to the artifact.

## Demo scenarios

| Scenario | Input | What it demonstrates |
| --- | --- | --- |
| `offline-constructive` | Fixed synthetic fixture | Fresh evidence, model candidate, risk pass, local Paper order |
| `stale-evidence` | Fixed synthetic fixture | `EVIDENCE_FRESHNESS` veto; candidate remains visible, order is not created |
| `risk-limit` | Fixed synthetic fixture | `ORDER_NOTIONAL_LIMIT` veto; final action falls back to `HOLD` |
| `public-btc-live` | Four live keyless public HTTPS sources | Real request-time public evidence with explicit source status and time semantics |
| `local-8790` | Optional local read-only service | Unverified review-only input; never a core dependency or executable Paper path |

The three offline scenarios are the reproducible baseline. Public-source availability, prices, timestamps, probabilities, and actions can change between runs and must be reported as observed. If a public source fails, the application exposes the failure; it does not silently substitute synthetic values.

## Quick start

Requirements: Node.js `>=20.11.0` (Node.js 24 is recommended). No database, API key, wallet, exchange account, or `.env` file is required for the offline baseline.

```powershell
cd app
npm ci
npm run check
npm test
npm start
```

Open the local URL printed by the server, normally [http://127.0.0.1:8810](http://127.0.0.1:8810). The service binds to `127.0.0.1` only. To use another port:

```powershell
$env:PORT = '8811'
npm start
```

The UI lets a reviewer run a scenario, inspect `research_id` and `decision_id`, review evidence and risk rules, re-verify the artifact, run an in-memory tamper test, view JSON, and download the report.

## Verification

The local API exposes:

- `GET /api/health`
- `GET /api/scenarios`
- `GET /api/model-card`
- `POST /api/run`
- `GET /api/reports/:id`
- `POST /api/verify`

For an offline verification path, run `offline-constructive`, click **验证原件**, then click **篡改副本测试**. The original report should verify, while a modified safety field should be rejected. The automated tests cover the same contracts, including re-chaining and re-signing attempts that try to bypass public transform, source-health, reference-price, or Paper-only checks.

Integrity has a limited meaning. SHA-256 and Ed25519 detect changes after evidence has been collected and signed; they do not prove upstream truth, model correctness, profitability, long-term signer identity, or a trusted timestamp.

Committed audit examples can be checked without network access:

```powershell
node tools/review-evidence.mjs --verify-examples
```

See [`docs/AUDIT_REPORT_SAMPLE.md`](docs/AUDIT_REPORT_SAMPLE.md) for the field-by-field audit mapping and [`examples/`](examples/) for the generated artifacts.

## Safety and compliance boundary

This project is for competition demonstration, software research, and Paper decision review. It is not a broker, exchange, investment adviser, custodian, wallet, or live execution service.

- No exchange connectivity
- No wallet connectivity
- No account credentials or real funds
- No external order route
- No live execution mode
- No investment, performance, or accuracy claim
- No implicit short selling; Paper `SELL` requires simulated inventory

`public-btc-live` uses real public inputs, but execution remains simulated. “Paper-only” describes the account, order, position, and fill boundary; it does not re-label public market data as synthetic. See [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the complete data, network, cross-border, and responsibility boundary.

## Repository structure

```text
app/
├─ server.js                 # local HTTP API and static console server
├─ public/                   # judge console
├─ src/adapters/             # public BTC read-only adapter
├─ src/core/                 # evidence, model path, risk, chain, signing, verification
├─ model/                    # frozen transparent model artifact
├─ fixtures/                 # reproducible offline scenarios
└─ test/                     # Node native tests
docs/                        # architecture, compliance, demo, testing, submission notes
examples/                    # committed, independently verifiable audit examples
promo/agent-ui/              # representative judge-console screenshots
promo/COPY_DECK.md           # competition and presentation copy
tools/                       # audit review plus portable handoff helpers
```

## Source repository vs. portable handoff

This repository is the **source repository**. The Windows portable handoff ZIP is a separate delivery artifact.

The source checkout intentionally excludes:

- `runtime/node.exe` and the portable runtime directory;
- generated `promo/offline-kit/` PDFs, PNGs, and print ZIP;
- caches, logs, `node_modules/`, coverage, and local output.

The original [`manifest.sha256`](manifest.sha256) is retained as provenance for the verified handoff ZIP. It describes that portable artifact, not this source checkout; therefore a normal GitHub checkout is not expected to match or pass the portable-package manifest. The root `.cmd` launchers and `tools/*.ps1` helpers are likewise intended for a complete portable handoff containing the matching runtime and manifest. For a source checkout, use the Node.js commands above.

The historical Windows x64 portable candidate results remain in [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) and [`docs/SUBMISSION.md`](docs/SUBMISSION.md) as external evidence. That candidate ZIP, its bundled Node runtime, and `promo/offline-kit/` are not part of this checkout; the current-source results are recorded separately and must not be conflated with the historical package.

## Competition context

The project is positioned as verifiable AI reasoning / quantitative-factor infrastructure, with a supporting AI × Fintech decision loop. The repository includes the demo script, test plan/report, competition requirements matrix, prior-work disclosure, and third-party notices:

- [`docs/DEMO_SCRIPT_3MIN.md`](docs/DEMO_SCRIPT_3MIN.md)
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)
- [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md)
- [`docs/COMPETITION_REQUIREMENTS_MATRIX.md`](docs/COMPETITION_REQUIREMENTS_MATRIX.md)
- [`docs/PRIOR_WORK_DISCLOSURE.md`](docs/PRIOR_WORK_DISCLOSURE.md)
- [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md)
- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md)
- [`docs/AUDIT_REPORT_SAMPLE.md`](docs/AUDIT_REPORT_SAMPLE.md)
- [`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md)
- [`docs/TEAM_CONFIRMATION_REQUIRED.md`](docs/TEAM_CONFIRMATION_REQUIRED.md)

Official rule version, submission portal details, video, rehearsal evidence, cross-border/vendor review, the competition-period `>=70%` calculation, final license approval, and external submission authorization remain team-confirmed `TBD` items. Technical tests must not be presented as model-performance or competition-submission proof.

## License

**UNLICENSED pending an explicit team decision.** No MIT, Apache-2.0, or other project license has been added without team authorization. See [`docs/LICENSE-DECISION.md`](docs/LICENSE-DECISION.md).
