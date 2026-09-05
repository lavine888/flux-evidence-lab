import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
import { getDemoScenario } from "../fixtures/scenarios.mjs";

function resignArtifact(artifact) {
  const signer = createRuntimeSigner();
  const manifest = buildSignatureManifest(
    artifact,
    "2026-09-01T04:00:02.000Z",
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

function assertVerifies(artifact) {
  const verification = verifyDecisionArtifact(artifact);
  assert.equal(verification.ok, true, JSON.stringify(verification.errors));
  assert.deepEqual(verification.checks, {
    schema: true,
    hash_chain: true,
    decision_binding: true,
    evidence_integrity: true,
    deterministic_replay: true,
    paper_only_policy: true,
    ed25519_signature: true,
  });
}

describe("verifiable BTC decision agent", () => {
  test("positive evidence directly produces BUY and a paper-only simulated order", () => {
    const artifact = runBtcDecision(getDemoScenario("positive-buy"), {
      signedAt: "2026-09-01T04:00:01.000Z",
    });
    assert.equal(artifact.outcome.candidate_action, "BUY");
    assert.equal(artifact.outcome.final_action, "BUY");
    assert.equal(artifact.outcome.risk_status, "PASS");
    assert.equal(artifact.outcome.order_status, "SIMULATED_ACCEPTED");
    assert.equal(artifact.safety.execution_capability, "PAPER_SIMULATION_ONLY");
    assert.equal(artifact.steps[3].payload.external_route, "DISABLED");
    assert.equal(artifact.steps[3].payload.real_funds, false);
    assert.equal(artifact.steps[3].payload.paper_order.decision_id, artifact.decision_id);
    assert.equal(artifact.research_id, artifact.steps[0].payload.research_id);
    assert.match(artifact.research_id, /^btc_res_[a-f0-9]{24}$/);
    for (const step of artifact.steps) assert.equal(step.decision_id, artifact.decision_id);
    assertVerifies(artifact);
  });

  test("neutral evidence produces HOLD without creating an order", () => {
    const artifact = runBtcDecision(getDemoScenario("neutral-hold"));
    assert.equal(artifact.outcome.candidate_action, "HOLD");
    assert.equal(artifact.outcome.final_action, "HOLD");
    assert.equal(artifact.outcome.risk_status, "NO_ACTION");
    assert.equal(artifact.steps[3].payload.status, "NOT_CREATED");
    assert.equal(artifact.steps[3].payload.reason, "MODEL_HOLD");
    assertVerifies(artifact);
  });

  test("model supports SELL and still emits only a paper simulation", () => {
    const artifact = runBtcDecision(getDemoScenario("bearish-sell"));
    assert.equal(artifact.outcome.candidate_action, "SELL");
    assert.equal(artifact.outcome.final_action, "SELL");
    assert.equal(artifact.steps[3].payload.paper_order.side, "SELL");
    assert.equal(artifact.steps[3].payload.paper_order.persistence, "LOCAL_DEMO_ONLY");
    assertVerifies(artifact);
  });

 test("stale bullish evidence is vetoed by deterministic final risk control", () => {
   const artifact = runBtcDecision(getDemoScenario("stale-veto"));
   assert.equal(artifact.outcome.candidate_action, "BUY");
   assert.equal(artifact.outcome.risk_status, "BLOCK");
   assert.equal(artifact.outcome.risk_vetoed, true);
   assert.equal(artifact.outcome.final_action, "HOLD");
   assert.ok(artifact.steps[2].payload.failed_rule_ids.includes("EVIDENCE_FRESHNESS"));
   assert.equal(artifact.steps[3].payload.status, "NOT_CREATED");
   assertVerifies(artifact);
 });
  test("future evidence is vetoed even within a small clock-skew window", () => {
    const scenario = getDemoScenario("positive-buy");
    scenario.evidence[0].observedAt = "2026-09-01T04:04:00.000Z";
    const artifact = runBtcDecision(scenario);
    assert.equal(artifact.outcome.candidate_action, "BUY");
    assert.equal(artifact.outcome.risk_status, "BLOCK");
    assert.equal(artifact.outcome.final_action, "HOLD");
    assert.ok(artifact.steps[2].payload.failed_rule_ids.includes("NO_FUTURE_EVIDENCE"));
    assert.equal(artifact.steps[3].payload.status, "NOT_CREATED");
    assertVerifies(artifact);
  });

 test("a live-mode attempt is physically rejected before order creation", () => {
   const artifact = runBtcDecision(getDemoScenario("live-mode-veto"));
   assert.equal(artifact.outcome.candidate_action, "BUY");
   assert.equal(artifact.outcome.final_action, "HOLD");
   assert.ok(artifact.steps[2].payload.failed_rule_ids.includes("PAPER_ONLY_MODE"));
   assert.equal(artifact.steps[3].payload.external_route, "DISABLED");
   assert.equal(artifact.steps[3].payload.paper_order, null);
   assertVerifies(artifact);
 });

  test("local review-only mode cannot create a Paper order", () => {
    const scenario = getDemoScenario("positive-buy");
    scenario.scenarioId = "local-8790";
    scenario.riskContext.requestedExecutionMode = "LOCAL_REVIEW_ONLY";
    const artifact = runBtcDecision(scenario);
    assert.equal(artifact.outcome.candidate_action, "BUY");
    assert.equal(artifact.outcome.risk_status, "BLOCK");
    assert.equal(artifact.outcome.final_action, "HOLD");
    assert.ok(artifact.steps[2].payload.failed_rule_ids.includes("PAPER_ONLY_MODE"));
    assert.equal(artifact.steps[3].payload.status, "NOT_CREATED");
    assert.equal(artifact.steps[3].payload.paper_order, null);
    assertVerifies(artifact);
  });

  test("decision ID is reproducible while runtime signatures use an explicit signer", () => {
    const signer = createRuntimeSigner();
    const scenario = getDemoScenario("positive-buy");
    const first = runBtcDecision(scenario, {
      signer,
      signedAt: "2026-09-01T04:00:01.000Z",
    });
    const second = runBtcDecision(scenario, {
      signer,
      signedAt: "2026-09-01T04:00:01.000Z",
    });
    assert.equal(first.decision_id, second.decision_id);
    assert.equal(first.steps.at(-1).hash, second.steps.at(-1).hash);
    assert.equal(first.signature.signature_base64, second.signature.signature_base64);
    assertVerifies(first);
  });

  test("payload tampering is detected by canonical hash, replay, and signature checks", () => {
    const artifact = runBtcDecision(getDemoScenario("positive-buy"));
    const tampered = structuredClone(artifact);
    tampered.steps[1].payload.candidate_probability = 0.999999;
    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.ok, false);
    const codes = new Set(verification.errors.map((error) => error.code));
    assert.ok(codes.has("STEP_CANONICAL_MISMATCH"));
    assert.ok(codes.has("STEP_HASH_MISMATCH"));
    assert.ok(codes.has("MODEL_REPLAY_MISMATCH"));
    assert.equal(verification.checks.ed25519_signature, false);
    assert.ok(codes.has("SIGNATURE_MANIFEST_MISMATCH"));
  });

  test("an attacker cannot re-hash a modified chain without invalidating the signature", () => {
    const artifact = runBtcDecision(getDemoScenario("positive-buy"));
    const tampered = structuredClone(artifact);
    tampered.steps[1].payload.candidate_probability = 0.999999;
    tampered.steps = buildDecisionChain(
      tampered.decision_id,
      tampered.steps.map((step) => ({ stage: step.stage, payload: step.payload })),
    );
    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.ok, false);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, false);
    assert.ok(
      verification.errors.some((error) => error.code === "SIGNATURE_MANIFEST_MISMATCH"),
    );
  });

  test("signature tampering is detected independently", () => {
    const artifact = runBtcDecision(getDemoScenario("neutral-hold"));
    const tampered = structuredClone(artifact);
    tampered.signature.signature_base64 = Buffer.alloc(64, 7).toString("base64");
    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.ok, false);
    assert.ok(verification.errors.some((error) => error.code === "SIGNATURE_INVALID"));
  });

  test("top-level safety claims are covered by the signed artifact hash", () => {
    const artifact = runBtcDecision(getDemoScenario("positive-buy"));
    const tampered = structuredClone(artifact);
    tampered.safety.external_order_route = "ENABLED";
    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.ok, false);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.ed25519_signature, false);
    assert.ok(
      verification.errors.some((error) => error.code === "SIGNATURE_MANIFEST_MISMATCH"),
    );
  });

  test("paper-only semantics cannot be made valid by signing with a fresh embedded key", () => {
    const tampered = structuredClone(runBtcDecision(getDemoScenario("positive-buy")));
    tampered.safety.external_order_route = "ENABLED";
    resignArtifact(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.ok, false);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.deterministic_replay, true);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.checks.paper_only_policy, false);
    assert.ok(
      verification.errors.some((error) => error.code === "PAPER_ONLY_POLICY_VIOLATION"),
    );
  });

  test("evidence freshness summary is recomputed even after a full re-chain and re-sign", () => {
    const tampered = structuredClone(runBtcDecision(getDemoScenario("positive-buy")));
    const evidencePayload = tampered.steps[0].payload;
    const modelPayload = tampered.steps[1].payload;
    const riskPayload = tampered.steps[2].payload;
    evidencePayload.evidence_items[0].observed_at = "2020-01-01T00:00:00.000Z";
    evidencePayload.research_id = deriveResearchId(evidencePayload);
    const decisionId = createDecisionId(
      evidencePayload,
      riskPayload.normalized_context,
      modelPayload.model_version,
    );
    const orderPayload = buildPaperOrderPayload(decisionId, riskPayload);
    tampered.decision_id = decisionId;
    tampered.research_id = evidencePayload.research_id;
    tampered.steps = buildDecisionChain(decisionId, [
      { stage: "evidence", payload: evidencePayload },
      { stage: "model", payload: modelPayload },
      { stage: "risk", payload: riskPayload },
      { stage: "order", payload: orderPayload },
    ]);
    resignArtifact(tampered);

    const verification = verifyDecisionArtifact(tampered);
    assert.equal(verification.ok, false);
    assert.equal(verification.checks.hash_chain, true);
    assert.equal(verification.checks.decision_binding, true);
    assert.equal(verification.checks.deterministic_replay, false);
    assert.equal(verification.checks.ed25519_signature, true);
    assert.equal(verification.checks.evidence_integrity, false);
    assert.ok(
      verification.errors.some((error) => error.code === "EVIDENCE_SUMMARY_MISMATCH"),
    );
    assert.ok(verification.errors.some((error) => error.code === "RISK_REPLAY_MISMATCH"));
  });

  test("canonical JSON sorts keys recursively", () => {
    assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
  });

  test("evidence provenance labels cannot contradict their source type", () => {
    const scenario = getDemoScenario("positive-buy");
    scenario.evidence[0].classification = "PUBLIC_DEMO";
    assert.throws(
      () => runBtcDecision(scenario),
      /classification must match its SYNTHETIC source type/,
    );
  });
});
