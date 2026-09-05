import { canonicalJson } from "./canonical-json.mjs";
import { ARTIFACT_SCHEMA_VERSION, createDecisionId } from "./decision-id.mjs";
import { normalizeEvidenceScenario } from "./evidence.mjs";
import { buildDecisionChain } from "./hash-chain.mjs";
import { buildSignatureManifest } from "./manifest.mjs";
import { buildPaperOrderPayload } from "./order.mjs";
import { evaluatePaperRisk, normalizePaperRiskContext } from "./risk.mjs";
import { createRuntimeSigner } from "./signing.mjs";
import {
  BTC_MULTINOMIAL_LOGIT_V1,
  inferBtcCandidate,
} from "../../model/btc-multinomial-logit-v1.mjs";

function normalizeSignedAt(value) {
  const candidate = value ?? new Date().toISOString();
  const timestamp = Date.parse(candidate);
  if (!Number.isFinite(timestamp)) throw new TypeError("signedAt must be a valid ISO timestamp");
  return new Date(timestamp).toISOString();
}

function assertSigner(signer) {
  if (
    !signer ||
    signer.algorithm !== "Ed25519" ||
    typeof signer.public_key_pem !== "string" ||
    typeof signer.key_fingerprint !== "string" ||
    typeof signer.sign !== "function"
  ) {
    throw new TypeError("signer must be an Ed25519 runtime signer created by createRuntimeSigner()");
  }
}

/**
 * Runs an offline BTC decision from supplied synthetic/public-demo evidence.
 * No network, exchange SDK, credentials, or live order route exists here.
 */
export function runBtcDecision(scenario, options = {}) {
  const evidencePayload = normalizeEvidenceScenario(scenario);
  const normalizedRiskContext = normalizePaperRiskContext(scenario.riskContext);
  const modelPayload = inferBtcCandidate(evidencePayload.evidence_items);
  const decisionId = createDecisionId(
    evidencePayload,
    normalizedRiskContext,
    modelPayload.model_version,
  );
  const riskPayload = evaluatePaperRisk(
    modelPayload,
    evidencePayload,
    normalizedRiskContext,
  );
  const orderPayload = buildPaperOrderPayload(decisionId, riskPayload);
  const steps = buildDecisionChain(decisionId, [
    { stage: "evidence", payload: evidencePayload },
    { stage: "model", payload: modelPayload },
    { stage: "risk", payload: riskPayload },
    { stage: "order", payload: orderPayload },
  ]);

  const artifact = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    decision_id: decisionId,
    research_id: evidencePayload.research_id,
    asset: "BTC",
    scenario_id: evidencePayload.scenario_id,
    as_of: evidencePayload.as_of,
    data_classification: evidencePayload.data_classification,
    safety: {
      data_boundary: "SYNTHETIC_OR_PUBLIC_DEMO_ONLY",
      execution_capability: "PAPER_SIMULATION_ONLY",
      external_order_route: "PHYSICALLY_UNAVAILABLE",
      real_funds: false,
      investment_advice: false,
    },
    model: {
      model_family: modelPayload.model_family,
      model_version: modelPayload.model_version,
      inference_role: modelPayload.inference_role,
      performance_claim: BTC_MULTINOMIAL_LOGIT_V1.model_card.performance_claim,
    },
    limitations: [...BTC_MULTINOMIAL_LOGIT_V1.model_card.limitations],
    disclaimer:
      "Synthetic/public demo evidence; not investment advice and not a live-trading input.",
    outcome: {
      candidate_action: modelPayload.candidate_action,
      candidate_probability: modelPayload.candidate_probability,
      final_action: riskPayload.final_action,
      risk_status: riskPayload.status,
      risk_vetoed: riskPayload.vetoed,
      order_status: orderPayload.status,
    },
    steps,
  };

  const signer = options.signer ?? createRuntimeSigner();
  assertSigner(signer);
  const signedAt = normalizeSignedAt(options.signedAt);
  const manifest = buildSignatureManifest(artifact, signedAt, signer.key_fingerprint);
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
