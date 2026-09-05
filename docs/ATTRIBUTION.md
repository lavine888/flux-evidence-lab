# Attribution and Material Disclosure

This index describes the source checkout. It is a disclosure aid, not a license grant and not evidence that an external competition requirement has been satisfied.

## Open-source Libraries

- The application uses Node.js built-in modules (`node:http`, `node:crypto`, `node:fs`, `node:test`, and related standard modules).
- `app/package.json` and `app/package-lock.json` currently declare no third-party npm runtime or development dependency.
- The browser surface uses local HTML, CSS, and JavaScript; it does not load a CDN, analytics SDK, icon package, or bundled font.
- Node.js licensing and its bundled third-party notices are described in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Models

- `btc-multinomial-logit@1.0.0` in [`../app/model/btc-multinomial-logit-v1.mjs`](../app/model/btc-multinomial-logit-v1.mjs) is the transparent model artifact used by the decision path.
- No external model weights, hosted inference service, remote LLM, prompt package, or model vendor is used by the current source checkout.
- The model parameters are demo parameters. `performance_claim: NONE` remains the authoritative statement.

## Public Data Sources

`public-btc-live` reads CoinLore, Coin Metrics Community, Alternative.me, and the GitHub `bitcoin/bitcoin` repository through the URLs and time semantics listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The adapter keeps raw responses in memory only, applies registered transforms, and does not commit or redistribute raw upstream payloads. Current source terms, processing locations, attribution requirements, and cross-border suitability are not verified here and remain `TBD` for an authorized team review.

## Pre-hackathon Assets

- Historical or previously supplied material is catalogued in [`PRIOR_WORK_DISCLOSURE.md`](PRIOR_WORK_DISCLOSURE.md), [`AI-HANDOFF.md`](../AI-HANDOFF.md), and [`BUILD-INFO.json`](../BUILD-INFO.json).
- The old root trading system, its credentials, runtime state, logs, and historical data were not imported into this source checkout.
- Generated portable media under `promo/offline-kit/` and the bundled Windows runtime were excluded from the source checkout; the retained [`manifest.sha256`](../manifest.sha256) records provenance for the verified handoff artifact, not this Git tree.

## Hackathon-period New Work

The current source delivery includes the Flux Evidence Lab application, tests, audit documentation, generated offline examples, and the `tools/review-evidence.mjs` evidence runner. The repository does not contain an authorized work log, official denominator, date boundary, or reviewer sign-off, so the competition-period `>=70%` calculation is **TBD**. This section must be completed by the team from the official rules before external submission; repository file count is not a substitute for that calculation.

## Licenses

- Project license: `UNLICENSED` pending an explicit team decision; no `LICENSE` file has been added.
- Node.js and any third-party runtime notices remain subject to the installed Node.js distribution and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- Public data availability does not imply permission to redistribute raw responses. The team must re-check each provider term before any public artifact or video claim.
- The final project license, attribution wording, and external submission authorization remain human-confirmed `TBD` items.
