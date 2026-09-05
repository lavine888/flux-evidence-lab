import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  fetchPublicBtcScenario,
  PUBLIC_BTC_ENDPOINTS,
} from "../src/adapters/public-btc.mjs";
import {
  canonicalJson,
  createRuntimeSigner,
  runBtcDecision,
  verifyDecisionArtifact,
} from "../src/core/index.mjs";
import { createDecisionId } from "../src/core/decision-id.mjs";
import { deriveResearchId } from "../src/core/evidence.mjs";
import { buildDecisionChain } from "../src/core/hash-chain.mjs";
import { buildSignatureManifest } from "../src/core/manifest.mjs";
import { buildPaperOrderPayload } from "../src/core/order.mjs";

const FIXED_NOW = "2026-09-02T02:30:00.000Z";

function payloads() {
  return new Map([
    [PUBLIC_BTC_ENDPOINTS.market.url, [{
      id: "90",
      symbol: "BTC",
      price_usd: "77251.88",
      market_cap_usd: "1542785900041.30",
      volume24: 26149982128.419193,
      percent_change_24h: "-1.28",
      percent_change_7d: "-2.47",
    }]],
    [PUBLIC_BTC_ENDPOINTS.network.url, { data: [
      { asset: "btc", time: "2026-08-25T00:00:00.000000000Z", AdrActCnt: "673531", TxCnt: "618688" },
      { asset: "btc", time: "2026-09-01T00:00:00.000000000Z", AdrActCnt: "677321", TxCnt: "622703" },
    ] }],
    [PUBLIC_BTC_ENDPOINTS.sentiment.url, { data: [{
      value: "63",
      value_classification: "Greed",
      timestamp: "1788307200",
    }] }],
    [PUBLIC_BTC_ENDPOINTS.developer.url, {
      full_name: "bitcoin/bitcoin",
      pushed_at: "2026-09-01T10:39:19Z",
      stargazers_count: 90078,
    }],
  ]);
}

function mockFetch(data, failed = new Set()) {
  return async (url) => {
    if (failed.has(url)) {
      return new Response(JSON.stringify({ error: "fixture failure" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    assert.equal(data.has(url), true, `Unexpected URL: ${url}`);
    return new Response(JSON.stringify(data.get(url)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function rechainAndResign(artifact) {
  const evidencePayload = artifact.steps[0].payload;
  const modelPayload = artifact.steps[1].payload;
  const riskPayload = artifact.steps[2].payload;
  evidencePayload.research_id = deriveResearchId(evidencePayload);
  const decisionId = createDecisionId(
    evidencePayload,
    riskPayload.normalized_context,
    modelPayload.model_version,
  );
  const orderPayload = buildPaperOrderPayload(decisionId, riskPayload);
  artifact.decision_id = decisionId;
  artifact.research_id = evidencePayload.research_id;
  artifact.steps = buildDecisionChain(decisionId, [
    { stage: "evidence", payload: evidencePayload },
    { stage: "model", payload: modelPayload },
    { stage: "risk", payload: riskPayload },
    { stage: "order", payload: orderPayload },
  ]);

  const signer = createRuntimeSigner();
  const manifest = buildSignatureManifest(
    artifact,
    "2026-09-02T02:30:01.000Z",
    signer.key_fingerprint,
  );
  const canonicalManifest = canonicalJson(manifest);
  artifact.signature = {
    algorithm: "Ed25519",
    key_scope: "EPHEMERAL_RUNTIME_DEMO",
    key_fingerprint: signer.key_fingerprint,
    public_key_pem: signer.public_key_pem,
    manifest,
    canonical_manifest: canonicalManifest,
    signature_base64: signer.sign(canonicalManifest),
  };
  return artifact;
}

async function publicArtifact(failed = new Set()) {
  const prepared = await fetchPublicBtcScenario({
    fetchImpl: mockFetch(payloads(), failed),
    clock: () => new Date(FIXED_NOW),
  });
  return runBtcDecision(prepared.scenario, { signedAt: "2026-09-02T02:30:01.000Z" });
}

function errorCodes(verification) {
  return new Set(verification.errors.map((error) => error.code));
}

describe("public BTC adapter", () => {
  test("maps four keyless public sources into traceable paper evidence", async () => {
    const result = await fetchPublicBtcScenario({
      fetchImpl: mockFetch(payloads()),
      clock: () => new Date(FIXED_NOW),
    });

    assert.equal(result.scenario.scenarioId, "public-btc-live");
    assert.equal(result.scenario.dataClassification, "PUBLIC_DEMO");
    assert.equal(result.scenario.riskContext.requestedExecutionMode, "PAPER_SIMULATION");
    assert.equal(result.scenario.riskContext.referencePriceUsd, 77251.88);
    assert.equal(
      result.scenario.riskContext.referencePriceEvidenceId,
      "public_coinlore_reference_price",
    );
    assert.deepEqual(
      result.scenario.evidence
        .filter((item) => item.role === "MODEL_FEATURE")
        .map((item) => item.metric)
        .sort(),
      ["developer_activity_z", "network_activity_z", "price_momentum_z", "social_sentiment_z"],
    );
    const reference = result.scenario.evidence.find((item) => item.role === "RISK_REFERENCE");
    assert.equal(reference.metric, "btc_reference_price_usd");
    assert.equal(reference.raw.value, 77251.88);
    assert.equal(reference.source.id, "coinlore_market");
    assert.equal(reference.source.status, "ok");
    assert.equal(reference.source.asOf, reference.observedAt);
    assert.ok(result.scenario.evidence.every((item) => item.transformId && item.raw.fieldPath));
    assert.equal(result.scenario.evidence.every((item) => item.source.type === "PUBLIC"), true);
    assert.equal(result.scenario.evidence.every((item) => item.classification === "PUBLIC_DEMO"), true);
    assert.equal(result.sourceStatus.every((item) => item.status === "ok"), true);
    assert.equal(result.inputSummary.source_ok_count, 4);
  });

  test("keeps partial public-source failures explicit without synthetic fallback", async () => {
    const failed = new Set([
      PUBLIC_BTC_ENDPOINTS.sentiment.url,
      PUBLIC_BTC_ENDPOINTS.developer.url,
    ]);
    const result = await fetchPublicBtcScenario({
      fetchImpl: mockFetch(payloads(), failed),
      clock: () => new Date(FIXED_NOW),
    });

    assert.equal(result.scenario.evidence.length, 3);
    assert.equal(
      result.scenario.evidence.filter((item) => item.role === "MODEL_FEATURE").length,
      2,
    );
    assert.equal(result.inputSummary.source_ok_count, 2);
    assert.equal(result.sourceStatus.filter((item) => item.status === "error").length, 2);
    assert.equal(result.scenario.evidence.some((item) => item.source.type === "SYNTHETIC"), false);
  });

  test("fails closed when the real market price source is unavailable", async () => {
    await assert.rejects(
      fetchPublicBtcScenario({
        fetchImpl: mockFetch(payloads(), new Set([PUBLIC_BTC_ENDPOINTS.market.url])),
        clock: () => new Date(FIXED_NOW),
      }),
      /Public BTC market source unavailable/,
    );
  });

  test("uses per-metric freshness and binds the paper reference price", async () => {
    const artifact = await publicArtifact();
    const evidenceSummary = artifact.steps[0].payload.evidence_summary;
    const risk = artifact.steps[2].payload;
    assert.ok(evidenceSummary.max_age_minutes > 60);
    assert.equal(risk.rules.find((item) => item.rule_id === "EVIDENCE_FRESHNESS").passed, true);
    assert.equal(risk.rules.find((item) => item.rule_id === "FEATURE_COVERAGE").passed, true);
    assert.equal(risk.rules.find((item) => item.rule_id === "REFERENCE_PRICE_BOUND").passed, true);
    assert.equal(verifyDecisionArtifact(artifact).ok, true);
  });

  test("blocks a partially available public collection with insufficient feature coverage", async () => {
    const artifact = await publicArtifact(new Set([
      PUBLIC_BTC_ENDPOINTS.sentiment.url,
      PUBLIC_BTC_ENDPOINTS.developer.url,
    ]));
    assert.equal(artifact.outcome.risk_status, "BLOCK");
    assert.equal(artifact.outcome.final_action, "HOLD");
    assert.ok(artifact.steps[2].payload.failed_rule_ids.includes("FEATURE_COVERAGE"));
    assert.ok(artifact.steps[2].payload.failed_rule_ids.includes("SOURCE_HEALTH"));
    assert.equal(verifyDecisionArtifact(artifact).ok, true);
  });

  test("does not allow callers to lower the feature-coverage policy floor", async () => {
    const prepared = await fetchPublicBtcScenario({
      fetchImpl: mockFetch(payloads()),
      clock: () => new Date(FIXED_NOW),
    });
    prepared.scenario.riskContext.limits.minFeatureCoverage = 0.49;
    assert.throws(() => runBtcDecision(prepared.scenario), /minFeatureCoverage.*minimum/);
  });

  test("detects a raw transform mismatch after a full re-chain and re-sign", async () => {
    const tampered = structuredClone(await publicArtifact());
    const network = tampered.steps[0].payload.evidence_items.find(
      (item) => item.metric === "network_activity_z",
    );
    network.raw.value += 5;
    rechainAndResign(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.ok, false);
    assert.ok(errorCodes(verification).has("PUBLIC_TRANSFORM_MISMATCH"));
  });

  test("cannot evade transform replay by removing the transform declaration", async () => {
    const tampered = structuredClone(await publicArtifact());
    const network = tampered.steps[0].payload.evidence_items.find(
      (item) => item.metric === "network_activity_z",
    );
    network.transform_id = null;
    network.raw = null;
    rechainAndResign(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.ok, false);
    assert.ok(errorCodes(verification).has("PUBLIC_TRANSFORM_MISMATCH"));
  });

  test("detects a risk reference-price mismatch after a full re-chain and re-sign", async () => {
    const tampered = structuredClone(await publicArtifact());
    tampered.steps[2].payload.normalized_context.reference_price_usd += 1;
    rechainAndResign(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.ok, false);
    assert.ok(errorCodes(verification).has("REFERENCE_PRICE_MISMATCH"));
  });

  test("detects source-status tampering after a full re-chain and re-sign", async () => {
    const tampered = structuredClone(await publicArtifact());
    tampered.steps[0].payload.source_health.find(
      (item) => item.id === "alternative_fng",
    ).status = "error";
    rechainAndResign(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.ok, false);
    assert.ok(errorCodes(verification).has("SOURCE_STATUS_MISMATCH"));
  });

  test("detects source-time tampering after a full re-chain and re-sign", async () => {
    const tampered = structuredClone(await publicArtifact());
    tampered.steps[0].payload.evidence_items.find(
      (item) => item.metric === "developer_activity_z",
    ).source.as_of = "2026-08-31T10:39:19.000Z";
    rechainAndResign(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.ok, false);
    assert.ok(errorCodes(verification).has("SOURCE_TIME_MISMATCH"));
  });

  test("detects source-summary tampering after a full re-chain and re-sign", async () => {
    const tampered = structuredClone(await publicArtifact());
    tampered.steps[0].payload.evidence_summary.source_ok_count = 3;
    rechainAndResign(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.ok, false);
    assert.ok(errorCodes(verification).has("EVIDENCE_SUMMARY_MISMATCH"));
  });
});
