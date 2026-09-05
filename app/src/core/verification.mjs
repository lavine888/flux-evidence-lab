import { canonicalJson, sha256Hex } from "./canonical-json.mjs";
import { ARTIFACT_SCHEMA_VERSION, createDecisionId } from "./decision-id.mjs";
import {
  buildCollectionSummary,
  calculateModelFeatureCoverage,
  deriveResearchId,
  summarizeEvidenceItems,
} from "./evidence.mjs";
import { CHAIN_DOMAIN, GENESIS_HASH } from "./hash-chain.mjs";
import { buildSignatureManifest } from "./manifest.mjs";
import { buildPaperOrderPayload } from "./order.mjs";
import { evaluatePaperRisk } from "./risk.mjs";
import { fingerprintPublicKey, verifyEd25519 } from "./signing.mjs";
import {
  PUBLIC_BTC_COLLECTION_POLICY,
  PUBLIC_BTC_SOURCE_POLICIES,
  validatePublicTransformBinding,
} from "./public-feature-transforms.mjs";
import {
  BTC_MULTINOMIAL_LOGIT_V1,
  inferBtcCandidate,
} from "../../model/btc-multinomial-logit-v1.mjs";

const EXPECTED_STAGES = ["evidence", "model", "risk", "order"];

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function freshnessLabel(asOf, collectedAt) {
  if (asOf === null) return "unknown";
  const ageHours = (Date.parse(collectedAt) - Date.parse(asOf)) / 3_600_000;
  if (!Number.isFinite(ageHours)) return "unknown";
  if (ageHours <= 24) return "fresh";
  if (ageHours <= 72) return "aging";
  return "stale";
}

function inspectPublicEvidence(evidencePayload, normalizedRiskContext) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message, stage: "evidence" });
  const items = Array.isArray(evidencePayload?.evidence_items)
    ? evidencePayload.evidence_items
    : [];
  const sourceHealth = Array.isArray(evidencePayload?.source_health)
    ? evidencePayload.source_health
    : [];
  const healthById = new Map(sourceHealth.map((source) => [source.id, source]));
  const strictPublicCollection =
    evidencePayload?.collection?.adapter_id === PUBLIC_BTC_COLLECTION_POLICY.adapter_id ||
    items.some((item) => typeof item?.transform_id === "string");

  if (
    strictPublicCollection &&
    items.some((item) => item?.source?.type === "PUBLIC" && typeof item.transform_id !== "string")
  ) {
    add(
      "PUBLIC_TRANSFORM_MISMATCH",
      "Every public evidence item in a transform-bound collection must declare raw and transform_id",
    );
  }

  for (const item of items.filter((candidate) => typeof candidate?.transform_id === "string")) {
    try {
      const transformBinding = validatePublicTransformBinding(item);
      if (!transformBinding.ok) {
        add(
          transformBinding.code,
          `${item.evidence_id} does not match its whitelisted raw-value transform`,
        );
      }
    } catch (error) {
      add(
        "PUBLIC_TRANSFORM_MISMATCH",
        `${item?.evidence_id ?? "unknown evidence"} transform cannot be replayed: ${error.message}`,
      );
    }

    const source = item?.source ?? {};
    const health = healthById.get(source.id);
    const expectedSource = PUBLIC_BTC_SOURCE_POLICIES[source.id];
    if (source.status !== "ok" || !health || health.status !== source.status) {
      add(
        "SOURCE_STATUS_MISMATCH",
        `${item.evidence_id} must bind to an available source-health record`,
      );
    }
    if (
      source.as_of !== item.observed_at ||
      !health ||
      health.as_of !== source.as_of ||
      health.observed_at !== item.observed_at ||
      health.retrieved_at !== source.retrieved_at ||
      health.timestamp_basis !== source.timestamp_basis ||
      Date.parse(source.retrieved_at) + 300_000 < Date.parse(source.as_of)
    ) {
      add(
        "SOURCE_TIME_MISMATCH",
        `${item.evidence_id} observation/retrieval time is inconsistent with source health`,
      );
    }
    if (
      !health ||
      health.name !== source.name ||
      health.category !== source.category ||
      health.type !== source.type ||
      health.url !== source.url ||
      !expectedSource ||
      expectedSource.name !== source.name ||
      expectedSource.category !== source.category ||
      expectedSource.type !== source.type ||
      expectedSource.url !== source.url
    ) {
      add(
        "SOURCE_PROVENANCE_MISMATCH",
        `${item.evidence_id} provenance differs from its source-health record`,
      );
    }
  }

  const collection = evidencePayload?.collection;
  if (strictPublicCollection) {
    if (
      collection?.adapter_id === PUBLIC_BTC_COLLECTION_POLICY.adapter_id &&
      !sameCanonical(
        collection.expected_source_ids,
        PUBLIC_BTC_COLLECTION_POLICY.expected_source_ids,
      )
    ) {
      add("SOURCE_HEALTH_MISMATCH", "Public BTC collection source set differs from policy");
    }
    if (collection?.adapter_id === PUBLIC_BTC_COLLECTION_POLICY.adapter_id) {
      for (const requiredId of PUBLIC_BTC_COLLECTION_POLICY.required_source_ids) {
        if (healthById.get(requiredId)?.status !== "ok") {
          add("SOURCE_STATUS_MISMATCH", `Required source ${requiredId} is not available`);
        }
      }
    }
    if (collection.collected_at !== evidencePayload.as_of) {
      add("SOURCE_TIME_MISMATCH", "Collection time must equal the signed evidence as_of time");
    }
    for (const health of sourceHealth) {
      const expectedSource = PUBLIC_BTC_SOURCE_POLICIES[health.id];
      if (
        !expectedSource ||
        expectedSource.name !== health.name ||
        expectedSource.category !== health.category ||
        expectedSource.type !== health.type ||
        expectedSource.url !== health.url
      ) {
        add("SOURCE_PROVENANCE_MISMATCH", `${health.id} differs from the public source policy`);
      }
      const expectedObservedAt = health.as_of ?? health.retrieved_at;
      const invalidStatus =
        (health.status === "ok" && health.error !== null) ||
        (health.status === "error" && health.error === null);
      const invalidTime =
        health.observed_at !== expectedObservedAt ||
        Date.parse(health.retrieved_at) > Date.parse(collection.collected_at) + 300_000 ||
        (health.as_of !== null &&
          Date.parse(health.as_of) > Date.parse(health.retrieved_at) + 300_000) ||
        health.freshness !== freshnessLabel(health.as_of, collection.collected_at);
      if (invalidStatus) {
        add("SOURCE_STATUS_MISMATCH", `${health.id} status and error detail are inconsistent`);
      }
      if (invalidTime) {
        add("SOURCE_TIME_MISMATCH", `${health.id} health timestamps/freshness are inconsistent`);
      }
    }
  }

  const coverage = calculateModelFeatureCoverage(items);
  if (
    evidencePayload?.evidence_summary?.model_feature_coverage !== coverage.coverage ||
    evidencePayload?.evidence_summary?.model_feature_count !== coverage.supplied_feature_count ||
    evidencePayload?.evidence_summary?.expected_model_feature_count !== coverage.expected_feature_count ||
    !sameCanonical(
      evidencePayload?.evidence_summary?.missing_model_features,
      coverage.missing_features,
    )
  ) {
    add("FEATURE_COVERAGE_MISMATCH", "Signed feature-coverage summary cannot be reproduced");
  }

  const referenceItems = items.filter((item) => item?.role === "RISK_REFERENCE");
  const referenceId = normalizedRiskContext?.reference_price_evidence_id ?? null;
  const strictReference =
    collection?.adapter_id === PUBLIC_BTC_COLLECTION_POLICY.adapter_id ||
    referenceId !== null ||
    referenceItems.length > 0;
  const boundReference = referenceItems.find((item) => item.evidence_id === referenceId);
  if (
    strictReference &&
    (referenceItems.length !== 1 ||
      !boundReference ||
      Number(boundReference.value?.toFixed?.(2)) !== normalizedRiskContext?.reference_price_usd)
  ) {
    add(
      "REFERENCE_PRICE_MISMATCH",
      "Risk reference price is not bound to exactly one signed RISK_REFERENCE evidence item",
    );
  }

  return issues;
}

/**
 * Offline validator for chain integrity, Ed25519 signature, cross-step binding,
 * and deterministic replay of model, risk, and paper-order logic.
 */
export function verifyDecisionArtifact(artifact) {
  const errors = [];
  const checks = {
    schema: false,
    hash_chain: false,
    decision_binding: false,
    evidence_integrity: false,
    deterministic_replay: false,
    paper_only_policy: false,
    ed25519_signature: false,
  };
  const addError = (code, message, stage = null) => errors.push({ code, message, stage });

  try {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      addError("INVALID_ARTIFACT", "Artifact must be an object");
      return { ok: false, checks, errors };
    }
    if (artifact.schema_version !== ARTIFACT_SCHEMA_VERSION) {
      addError("SCHEMA_VERSION_MISMATCH", "Unsupported artifact schema version");
    } else {
      checks.schema = true;
    }
    if (!Array.isArray(artifact.steps) || artifact.steps.length !== EXPECTED_STAGES.length) {
      addError("STEP_COUNT_MISMATCH", "Artifact must contain evidence/model/risk/order steps");
      return { ok: false, checks, errors };
    }

    let previousHash = GENESIS_HASH;
    let chainValid = true;
    let bindingValid = true;
    artifact.steps.forEach((step, index) => {
      const expectedStage = EXPECTED_STAGES[index];
      if (step.sequence !== index + 1 || step.stage !== expectedStage) {
        addError("STEP_ORDER_MISMATCH", `Expected step ${index + 1} to be ${expectedStage}`, step.stage);
        chainValid = false;
      }
      if (step.decision_id !== artifact.decision_id) {
        addError("DECISION_ID_MISMATCH", "Step decision_id differs from artifact", step.stage);
        bindingValid = false;
      }
      if (step.previous_hash !== previousHash) {
        addError("PREVIOUS_HASH_MISMATCH", "Step does not point to the preceding hash", step.stage);
        chainValid = false;
      }
      const body = {
        sequence: step.sequence,
        stage: step.stage,
        decision_id: step.decision_id,
        previous_hash: step.previous_hash,
        payload: step.payload,
      };
      const computedCanonical = canonicalJson(body);
      if (step.canonical_json !== computedCanonical) {
        addError("STEP_CANONICAL_MISMATCH", "Stored canonical JSON differs from step content", step.stage);
        chainValid = false;
      }
      const computedHash = sha256Hex(`${CHAIN_DOMAIN}\n${computedCanonical}`);
      if (step.hash !== computedHash) {
        addError("STEP_HASH_MISMATCH", "Stored SHA-256 hash differs from step content", step.stage);
        chainValid = false;
      }
      previousHash = step.hash;
    });
    checks.hash_chain = chainValid;

    const [evidenceStep, modelStep, riskStep, orderStep] = artifact.steps;
    let evidenceIntegrityValid = true;
    try {
      const expectedSummary = summarizeEvidenceItems(
        evidenceStep.payload.as_of,
        evidenceStep.payload.evidence_items,
        evidenceStep.payload.source_health,
      );
      if (!sameCanonical(expectedSummary, evidenceStep.payload.evidence_summary)) {
        addError(
          "EVIDENCE_SUMMARY_MISMATCH",
          "Evidence freshness and provenance summary does not match signed evidence items",
          "evidence",
        );
        evidenceIntegrityValid = false;
      }
      const expectedCollection = buildCollectionSummary(
        evidenceStep.payload.collection,
        evidenceStep.payload.source_health,
      );
      if (!sameCanonical(expectedCollection, evidenceStep.payload.collection)) {
        addError(
          "SOURCE_HEALTH_MISMATCH",
          "Collection health summary does not match signed source-health records",
          "evidence",
        );
        evidenceIntegrityValid = false;
      }
      for (const issue of inspectPublicEvidence(
        evidenceStep.payload,
        riskStep.payload.normalized_context,
      )) {
        addError(issue.code, issue.message, issue.stage);
        evidenceIntegrityValid = false;
      }
      const expectedResearchId = deriveResearchId(evidenceStep.payload);
      if (evidenceStep.payload.research_id !== expectedResearchId) {
        addError(
          "RESEARCH_ID_DERIVATION_MISMATCH",
          "research_id is not derived from the signed evidence payload",
          "evidence",
        );
        evidenceIntegrityValid = false;
      }
    } catch (error) {
      addError("EVIDENCE_INTEGRITY_INVALID", error.message, "evidence");
      evidenceIntegrityValid = false;
    }
    checks.evidence_integrity = evidenceIntegrityValid;

    const expectedDecisionId = createDecisionId(
      evidenceStep.payload,
      riskStep.payload.normalized_context,
      modelStep.payload.model_version,
    );
    if (artifact.decision_id !== expectedDecisionId) {
      addError("DECISION_ID_DERIVATION_MISMATCH", "decision_id is not derived from signed inputs");
      bindingValid = false;
    }
    if (orderStep.payload.paper_order?.decision_id !== artifact.decision_id) {
      if (orderStep.payload.paper_order !== null) {
        addError("ORDER_DECISION_ID_MISMATCH", "Paper order is not bound to the decision_id", "order");
        bindingValid = false;
      }
    }
    if (
      artifact.scenario_id !== evidenceStep.payload.scenario_id ||
      artifact.research_id !== evidenceStep.payload.research_id ||
      artifact.as_of !== evidenceStep.payload.as_of ||
      artifact.data_classification !== evidenceStep.payload.data_classification
    ) {
      addError("EVIDENCE_HEADER_MISMATCH", "Artifact header or research_id differs from evidence step");
      bindingValid = false;
    }
    if (
      artifact.outcome.candidate_action !== modelStep.payload.candidate_action ||
      artifact.outcome.candidate_probability !== modelStep.payload.candidate_probability ||
      artifact.outcome.final_action !== riskStep.payload.final_action ||
      artifact.outcome.risk_status !== riskStep.payload.status ||
      artifact.outcome.risk_vetoed !== riskStep.payload.vetoed ||
      artifact.outcome.order_status !== orderStep.payload.status
    ) {
      addError("OUTCOME_BINDING_MISMATCH", "Artifact outcome differs from decision steps");
      bindingValid = false;
    }
    checks.decision_binding = bindingValid;

    const paperPolicyViolations = [];
    const safety = artifact.safety || {};
    if (artifact.asset !== "BTC") paperPolicyViolations.push("asset must be BTC");
    if (safety.data_boundary !== "SYNTHETIC_OR_PUBLIC_DEMO_ONLY") {
      paperPolicyViolations.push("data boundary is not demo-only");
    }
    if (safety.execution_capability !== "PAPER_SIMULATION_ONLY") {
      paperPolicyViolations.push("execution capability is not paper-only");
    }
    if (safety.external_order_route !== "PHYSICALLY_UNAVAILABLE") {
      paperPolicyViolations.push("external order route is not physically unavailable");
    }
    if (safety.real_funds !== false || safety.investment_advice !== false) {
      paperPolicyViolations.push("real-funds or investment-advice safety flag is invalid");
    }
    if (riskStep.payload.live_execution !== "FORBIDDEN") {
      paperPolicyViolations.push("risk step does not forbid live execution");
    }
    if (
      orderStep.payload.execution_mode !== "PAPER_SIMULATION_ONLY" ||
      orderStep.payload.external_route !== "DISABLED" ||
      orderStep.payload.real_funds !== false
    ) {
      paperPolicyViolations.push("order step is not structurally paper-only");
    }
    if (
      orderStep.payload.paper_order &&
      (orderStep.payload.paper_order.persistence !== "LOCAL_DEMO_ONLY" ||
        orderStep.payload.paper_order.order_type !== "MARKET_SIMULATION")
    ) {
      paperPolicyViolations.push("paper order contains a non-simulation execution claim");
    }
    if (paperPolicyViolations.length) {
      addError(
        "PAPER_ONLY_POLICY_VIOLATION",
        paperPolicyViolations.join("; "),
      );
    }
    checks.paper_only_policy = paperPolicyViolations.length === 0;

    let replayValid = true;
    if (modelStep.payload.model_version !== BTC_MULTINOMIAL_LOGIT_V1.model_version) {
      addError("MODEL_VERSION_UNSUPPORTED", "Cannot replay an unknown model version", "model");
      replayValid = false;
    } else {
      const replayedModel = inferBtcCandidate(evidenceStep.payload.evidence_items);
      if (!sameCanonical(replayedModel, modelStep.payload)) {
        addError("MODEL_REPLAY_MISMATCH", "Model output does not match deterministic replay", "model");
        replayValid = false;
      }
      const replayedRisk = evaluatePaperRisk(
        modelStep.payload,
        evidenceStep.payload,
        riskStep.payload.normalized_context,
      );
      if (!sameCanonical(replayedRisk, riskStep.payload)) {
        addError("RISK_REPLAY_MISMATCH", "Risk output does not match deterministic replay", "risk");
        replayValid = false;
      }
      const replayedOrder = buildPaperOrderPayload(artifact.decision_id, riskStep.payload);
      if (!sameCanonical(replayedOrder, orderStep.payload)) {
        addError("ORDER_REPLAY_MISMATCH", "Paper order does not match deterministic replay", "order");
        replayValid = false;
      }
    }
    checks.deterministic_replay = replayValid;

    let signatureValid = true;
    try {
      if (artifact.signature?.algorithm !== "Ed25519") {
        addError("SIGNATURE_ALGORITHM_MISMATCH", "Signature algorithm must be Ed25519");
        signatureValid = false;
      } else {
        const actualFingerprint = fingerprintPublicKey(artifact.signature.public_key_pem);
        if (actualFingerprint !== artifact.signature.key_fingerprint) {
          addError("PUBLIC_KEY_FINGERPRINT_MISMATCH", "Public key fingerprint is invalid");
          signatureValid = false;
        }
        const expectedManifest = buildSignatureManifest(
          artifact,
          artifact.signature.manifest.signed_at,
          artifact.signature.key_fingerprint,
        );
        const expectedCanonicalManifest = canonicalJson(expectedManifest);
        if (
          !sameCanonical(expectedManifest, artifact.signature.manifest) ||
          expectedCanonicalManifest !== artifact.signature.canonical_manifest
        ) {
          addError("SIGNATURE_MANIFEST_MISMATCH", "Signature manifest does not bind this artifact");
          signatureValid = false;
        }
        if (
          !verifyEd25519(
            artifact.signature.public_key_pem,
            expectedCanonicalManifest,
            artifact.signature.signature_base64,
          )
        ) {
          addError("SIGNATURE_INVALID", "Ed25519 signature verification failed");
          signatureValid = false;
        }
      }
    } catch (error) {
      addError("SIGNATURE_INVALID", `Signature validation failed: ${error.message}`);
      signatureValid = false;
    }
    checks.ed25519_signature = signatureValid;
  } catch (error) {
    addError("VERIFICATION_EXCEPTION", error.message);
  }

  return { ok: errors.length === 0, checks, errors };
}
