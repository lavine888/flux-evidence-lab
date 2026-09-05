import { canonicalHash } from "./canonical-json.mjs";

export const SIGNATURE_MANIFEST_VERSION = "flux-signature-manifest@1.0.0";

export function buildSignatureManifest(artifact, signedAt, signerKeyFingerprint) {
  const unsignedArtifact = { ...artifact };
  delete unsignedArtifact.signature;
  return {
    manifest_schema_version: SIGNATURE_MANIFEST_VERSION,
    artifact_schema_version: artifact.schema_version,
    artifact_hash: canonicalHash(unsignedArtifact, "flux-signed-artifact-v1"),
    decision_id: artifact.decision_id,
    research_id: artifact.research_id,
    asset: artifact.asset,
    scenario_id: artifact.scenario_id,
    as_of: artifact.as_of,
    data_classification: artifact.data_classification,
    model_version: artifact.model.model_version,
    candidate_action: artifact.outcome.candidate_action,
    final_action: artifact.outcome.final_action,
    risk_status: artifact.outcome.risk_status,
    order_status: artifact.outcome.order_status,
    chain_head: artifact.steps.at(-1).hash,
    step_hashes: artifact.steps.map((step) => ({
      sequence: step.sequence,
      stage: step.stage,
      hash: step.hash,
    })),
    signed_at: signedAt,
    signer_key_fingerprint: signerKeyFingerprint,
  };
}
