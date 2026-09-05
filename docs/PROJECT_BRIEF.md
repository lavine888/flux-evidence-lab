# Project Brief

## Problem

AI-assisted financial decisions are difficult to review when the evidence, model output, risk decision, simulated order, and post-run integrity check are separate or undocumented.

## Target User

Digital-asset researchers, model-risk and risk-control reviewers, and audit/compliance or engineering reviewers who need to replay a Paper decision.

## Solution

Flux Evidence Lab binds public or offline evidence to a versioned BTC candidate signal, deterministic Paper-only risk controls, a local simulated result, a SHA-256 decision chain, and an offline Ed25519 verifier.

## AI Contribution

`btc-multinomial-logit@1.0.0` is a transparent, frozen multinomial logistic model. It directly produces `BUY` / `HOLD` / `SELL` probabilities, the candidate action, and per-feature contributions. The deterministic risk layer can veto that candidate but does not replace it. This prototype does not use a remote LLM or claim predictive accuracy.

## Finance / Web3 Contribution

The financial boundary is BTC research and Paper simulation: evidence freshness, public-source health, feature coverage, reference-price binding, confidence, notional, position, inventory, and frequency rules are explicit. There is no exchange, wallet, account, real fund, or external order route.

## Tech Stack

Node.js `>=20.11.0`, native ESM and `node:test`, native `fetch`, HTML/CSS/JavaScript, SHA-256 canonical JSON, and Ed25519 from Node `crypto`. The runtime has no third-party npm dependency and the frontend has no CDN dependency.

## Team Roles

Team names, competition owner, demo operator, compliance reviewer, and final submission approver are not available in this workspace: `TBD`. Do not infer people or ownership from the repository history.

## Trust Boundary

`PAPER_ONLY` is an enforced execution boundary, not a profitability claim. TEE / ZKP: **Not used in the current prototype.** Competition rules, video, rehearsal, license choice, cross-border/vendor review, and the `>=70%` competition-period work calculation remain human-confirmed items.
