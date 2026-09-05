# Flux Evidence Lab

**Verifiable evidence and audit infrastructure for AI-assisted financial decisions.**

Flux Evidence Lab is a BTC **paper-only** decision agent built for AIx Origin Summit. It binds public or offline evidence to deterministic feature transforms, a versioned probabilistic model, deterministic risk controls, local paper simulation, and independently verifiable integrity records.

> 真实公开输入 + Paper-only 模拟执行；不连接交易所、不连接钱包、不接触真实资金。

## Core flow

```text
Evidence
  -> deterministic normalization
  -> versioned probabilistic model
  -> deterministic risk veto
  -> paper-only simulation
  -> hash-chain + Ed25519 verification
```

The model produces a candidate `BUY`, `HOLD`, or `SELL` action. Risk controls have final veto authority.

## Quick start from this repository

Requirements: Node.js >= 20.11.0.

```bash
cd app
npm test
npm start
```

Then open the local URL printed by the server.

## Repository vs. portable handoff package

This GitHub repository is the **source repository**. The signed Windows portable handoff ZIP distributed to teammates is a separate delivery artifact.

To keep Git history reviewable, this repository intentionally does **not** version:

- `runtime/node.exe` (embedded Windows Node.js runtime, ~93 MB)
- generated `promo/offline-kit/` PDFs/PNGs/ZIP bundle

The original `manifest.sha256` and portable verification scripts are retained for provenance, but a normal GitHub checkout is **not byte-identical to the portable handoff ZIP** and should not be validated as though it were that ZIP.

For project context, start with:

1. `AI-HANDOFF.md`
2. `PROJECT-CONTEXT.json`
3. `docs/ARCHITECTURE.md`
4. `docs/COMPLIANCE.md`
5. `docs/DEMO_SCRIPT_3MIN.md`
6. `docs/COMPETITION_REQUIREMENTS_MATRIX.md`

## What this project proves

Flux Evidence Lab is not presented as a profitable trading system. Its focus is **traceability and verification**:

- what evidence entered the decision;
- how evidence was transformed;
- what the versioned model proposed;
- which deterministic risk rule allowed or blocked execution;
- whether a paper order was created;
- whether the resulting artifact can be independently replayed and verified;
- whether post-hoc tampering can be detected.

## Safety boundary

- Paper-only execution
- No exchange connectivity
- No wallet connectivity
- No real funds
- Local bind only for the demo server

See `docs/COMPLIANCE.md` for the complete boundary.

## License status

**UNLICENSED pending an explicit team decision.** See `docs/LICENSE-DECISION.md` before adding an open-source license.
