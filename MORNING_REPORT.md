# Flux Evidence Lab — Morning Report

## Technical delivery

- Current GitHub source checkout is ready: `app/`, docs, audit runner, committed examples, CI, and judge-first README.
- Verified: `npm run check` PASS; `npm test` 32/32 PASS, 3 suites, 0 fail/skip.
- Audit runner: offline constructive, risk limit, and tamper detection each 10/10; two examples verify PASS.
- HTTP smoke: health/catalog/static/offline/tamper paths passed; Paper-only and tamper rejection confirmed.
- Public live: 3 attempts, 0 observed, 3 external unavailable (`502`); no raw public response persisted.
- Release scan: 0 secret-pattern hits, 0 files over 10 MiB; portable runtime/offline-kit/node_modules are absent from the source checkout.
- Fresh-clone replay from the pushed `main`: install, syntax check, 32/32 tests, and sample verification all passed.
- The three-minute script is exactly timed; the main line uses reproducible offline scenarios.
- Historical Windows portable-candidate results are retained as historical evidence, not current-source results.

## GitHub

- Target: `https://github.com/lavine888/flux-evidence-lab` on `main`.
- Final remote SHA and key-file readback are recorded in the delivery receipt after push.

## Human confirmation still required

- Team roles/ownership, official rule version and final track; video and 5–8 minute rehearsal.
- Third-party terms, attribution, cross-border review, project license, and competition-period `>=70%` calculation.
- Final external submission contents and authorization.

## When you wake up

1. Run `node tools/review-evidence.mjs --verify-examples` and open the console.
2. Confirm the manual items in `docs/TEAM_CONFIRMATION_REQUIRED.md`.
3. Record the real video/rehearsal evidence before any competition upload.
