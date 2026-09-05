import { canonicalHash } from "./canonical-json.mjs";

export const ARTIFACT_SCHEMA_VERSION = "flux-verifiable-btc-decision@1.0.0";

export function createDecisionId(evidencePayload, normalizedRiskContext, modelVersion) {
  const digest = canonicalHash(
    {
      artifact_schema_version: ARTIFACT_SCHEMA_VERSION,
      model_version: modelVersion,
      evidence: evidencePayload,
      risk_context: normalizedRiskContext,
    },
    "flux-decision-id-v1",
  );
  return `btc_dec_${digest.slice(0, 24)}`;
}
