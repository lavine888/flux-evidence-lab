import { canonicalHash } from "./canonical-json.mjs";
import {
  getPublicTransform,
  validatePublicTransformBinding,
} from "./public-feature-transforms.mjs";
import { BTC_MULTINOMIAL_LOGIT_V1 } from "../../model/btc-multinomial-logit-v1.mjs";

const ALLOWED_CLASSIFICATIONS = new Set([
  "SYNTHETIC_DEMO",
  "PUBLIC_DEMO",
  "MIXED_PUBLIC_SYNTHETIC_DEMO",
]);
const ALLOWED_ROLES = new Set(["MODEL_FEATURE", "RISK_REFERENCE"]);
const ALLOWED_SOURCE_TYPES = new Set(["SYNTHETIC", "PUBLIC"]);
const ALLOWED_SOURCE_STATUSES = new Set(["ok", "error"]);
const MODEL_FEATURES = new Set(BTC_MULTINOMIAL_LOGIT_V1.feature_order);

const round = (value, digits = 6) => Number(value.toFixed(digits));

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field);
}

function normalizedIso(value, field) {
  const text = requiredText(value, field);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${field} must be a valid ISO timestamp`);
  return new Date(timestamp).toISOString();
}

function optionalIso(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return normalizedIso(value, field);
}

function normalizedUrl(value, field, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new TypeError(`${field} must be a non-empty URL`);
    return null;
  }
  const url = requiredText(value, field);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`${field} must be a valid URL`);
  }
  if (!new Set(["https:", "http:"]).has(parsed.protocol)) {
    throw new RangeError(`${field} must use http or https`);
  }
  return url;
}

function normalizeClassification(value, field) {
  const classification = requiredText(value, field).toUpperCase();
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) {
    throw new RangeError(
      `${field} must be SYNTHETIC_DEMO, PUBLIC_DEMO, or MIXED_PUBLIC_SYNTHETIC_DEMO`,
    );
  }
  return classification;
}

function normalizeSource(source, index, strictPublic) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(`evidence[${index}].source must be an object`);
  }
  const sourceType = requiredText(source.type, `evidence[${index}].source.type`).toUpperCase();
  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
    throw new RangeError(`evidence[${index}].source.type must be SYNTHETIC or PUBLIC`);
  }
  if (strictPublic && sourceType !== "PUBLIC") {
    throw new RangeError(`evidence[${index}] public transform requires a PUBLIC source`);
  }

  const prefix = `evidence[${index}].source`;
  const statusValue = source.status ?? (strictPublic ? null : "ok");
  const status = strictPublic
    ? requiredText(statusValue, `${prefix}.status`).toLowerCase()
    : String(statusValue ?? "ok").trim().toLowerCase();
  if (!ALLOWED_SOURCE_STATUSES.has(status)) {
    throw new RangeError(`${prefix}.status must be ok or error`);
  }

  return {
    id: strictPublic
      ? requiredText(source.id, `${prefix}.id`)
      : optionalText(source.id, `${prefix}.id`),
    name: requiredText(source.name, `${prefix}.name`),
    category: strictPublic
      ? requiredText(source.category, `${prefix}.category`)
      : optionalText(source.category, `${prefix}.category`),
    type: sourceType,
    url: normalizedUrl(source.url, `${prefix}.url`, strictPublic),
    retrieved_at: strictPublic
      ? normalizedIso(source.retrievedAt ?? source.retrieved_at, `${prefix}.retrievedAt`)
      : optionalIso(source.retrievedAt ?? source.retrieved_at, `${prefix}.retrievedAt`),
    as_of: strictPublic
      ? normalizedIso(source.asOf ?? source.as_of, `${prefix}.asOf`)
      : optionalIso(source.asOf ?? source.as_of, `${prefix}.asOf`),
    timestamp_basis: strictPublic
      ? requiredText(source.timestampBasis ?? source.timestamp_basis, `${prefix}.timestampBasis`)
      : optionalText(source.timestampBasis ?? source.timestamp_basis, `${prefix}.timestampBasis`),
    status,
  };
}

function normalizeRaw(raw, index, transformId) {
  if (transformId === null) {
    if (raw === undefined || raw === null) return null;
    throw new RangeError(`evidence[${index}].raw requires transformId`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(`evidence[${index}].raw must be an object`);
  }
  if (typeof raw.value !== "number" || !Number.isFinite(raw.value)) {
    throw new TypeError(`evidence[${index}].raw.value must be a finite number`);
  }
  return {
    value: round(raw.value),
    unit: requiredText(raw.unit, `evidence[${index}].raw.unit`),
    field_path: requiredText(raw.fieldPath ?? raw.field_path, `evidence[${index}].raw.fieldPath`),
  };
}

function normalizeSourceHealth(items) {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw new TypeError("sourceStatus must be an array");
  const seenIds = new Set();
  const normalized = items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError(`sourceStatus[${index}] must be an object`);
    }
    const prefix = `sourceStatus[${index}]`;
    const id = requiredText(item.id, `${prefix}.id`);
    if (seenIds.has(id)) throw new RangeError(`Duplicate sourceStatus id: ${id}`);
    seenIds.add(id);
    const status = requiredText(item.status, `${prefix}.status`).toLowerCase();
    if (!ALLOWED_SOURCE_STATUSES.has(status)) {
      throw new RangeError(`${prefix}.status must be ok or error`);
    }
    return {
      id,
      name: requiredText(item.name, `${prefix}.name`),
      category: requiredText(item.category, `${prefix}.category`),
      type: requiredText(item.type ?? "PUBLIC", `${prefix}.type`).toUpperCase(),
      url: normalizedUrl(item.url, `${prefix}.url`, true),
      status,
      configured: item.configured !== false,
      retrieved_at: normalizedIso(item.retrievedAt ?? item.retrieved_at, `${prefix}.retrievedAt`),
      as_of: optionalIso(item.asOf ?? item.as_of, `${prefix}.asOf`),
      observed_at: optionalIso(item.observedAt ?? item.observed_at, `${prefix}.observedAt`),
      timestamp_basis: requiredText(
        item.timestampBasis ?? item.timestamp_basis,
        `${prefix}.timestampBasis`,
      ),
      freshness: requiredText(item.freshness ?? "unknown", `${prefix}.freshness`).toLowerCase(),
      cached: item.cached === true,
      error: optionalText(item.error, `${prefix}.error`),
    };
  });
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildCollectionSummary(seed, sourceHealth) {
  const expectedSourceIds = [...new Set(seed.expected_source_ids)].sort();
  const reportedIds = sourceHealth.map((item) => item.id).sort();
  const reportedSet = new Set(reportedIds);
  const expectedSet = new Set(expectedSourceIds);
  const missingSourceIds = expectedSourceIds.filter((id) => !reportedSet.has(id));
  const unexpectedSourceIds = reportedIds.filter((id) => !expectedSet.has(id));
  const okCount = sourceHealth.filter((item) => item.status === "ok").length;
  const errorCount = sourceHealth.filter((item) => item.status === "error").length;
  let status = "NOT_REPORTED";
  if (expectedSourceIds.length === 0 && sourceHealth.length === 0) status = "NOT_APPLICABLE";
  else if (missingSourceIds.length === 0 && unexpectedSourceIds.length === 0 && errorCount === 0) {
    status = "HEALTHY";
  } else status = "DEGRADED";

  return {
    adapter_id: seed.adapter_id,
    mode: seed.mode,
    collected_at: seed.collected_at,
    expected_source_ids: expectedSourceIds,
    expected_source_count: expectedSourceIds.length,
    reported_source_count: sourceHealth.length,
    ok_source_count: okCount,
    error_source_count: errorCount,
    missing_source_ids: missingSourceIds,
    unexpected_source_ids: unexpectedSourceIds,
    status,
  };
}

function normalizeCollection(collection, sourceHealth, classification, asOf) {
  if (
    collection !== undefined &&
    collection !== null &&
    (typeof collection !== "object" || Array.isArray(collection))
  ) {
    throw new TypeError("collection must be an object");
  }
  const supplied = collection ?? {};
  const isSynthetic = classification === "SYNTHETIC_DEMO";
  const expectedSourceIds =
    supplied.expectedSourceIds ?? supplied.expected_source_ids ?? sourceHealth.map((item) => item.id);
  if (!Array.isArray(expectedSourceIds) || expectedSourceIds.some((id) => typeof id !== "string")) {
    throw new TypeError("collection.expectedSourceIds must be an array of strings");
  }
  const seed = {
    adapter_id: requiredText(
      supplied.adapterId ??
        supplied.adapter_id ??
        (isSynthetic ? "repository-fixture@1.0.0" : "legacy-public-input@1.0.0"),
      "collection.adapterId",
    ),
    mode: requiredText(
      supplied.mode ?? (isSynthetic ? "SYNTHETIC_FIXTURE" : "PUBLIC_INPUT_UNSPECIFIED"),
      "collection.mode",
    ),
    collected_at: normalizedIso(
      supplied.collectedAt ?? supplied.collected_at ?? asOf,
      "collection.collectedAt",
    ),
    expected_source_ids: expectedSourceIds.map((id, index) =>
      requiredText(id, `collection.expectedSourceIds[${index}]`)),
  };
  return buildCollectionSummary(seed, sourceHealth);
}

export function calculateModelFeatureCoverage(items) {
  const supplied = new Set(
    items
      .filter((item) => item.role !== "RISK_REFERENCE" && MODEL_FEATURES.has(item.metric))
      .map((item) => item.metric),
  );
  return {
    supplied_feature_count: supplied.size,
    expected_feature_count: MODEL_FEATURES.size,
    coverage: round(supplied.size / MODEL_FEATURES.size),
    supplied_features: [...supplied].sort(),
    missing_features: BTC_MULTINOMIAL_LOGIT_V1.feature_order.filter((metric) => !supplied.has(metric)),
  };
}

export function summarizeEvidenceItems(asOf, items, sourceHealth = []) {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs) || !Array.isArray(items) || items.length === 0) {
    throw new TypeError("asOf and non-empty evidence items are required");
  }
  if (!Array.isArray(sourceHealth)) throw new TypeError("sourceHealth must be an array");
  const ages = items.map((item) => {
    const observedMs = Date.parse(item?.observed_at);
    if (!Number.isFinite(observedMs)) throw new TypeError("evidence observed_at must be valid");
    return (asOfMs - observedMs) / 60_000;
  });
  const sourceNames = [...new Set(items.map((item) => item.source.name))].sort();
  const publicCount = items.filter((item) => item.source.type === "PUBLIC").length;
  const coverage = calculateModelFeatureCoverage(items);
  return {
    item_count: items.length,
    public_item_count: publicCount,
    synthetic_item_count: items.length - publicCount,
    public_transform_count: items.filter((item) => item.transform_id !== null).length,
    risk_reference_count: items.filter((item) => item.role === "RISK_REFERENCE").length,
    source_count: sourceNames.length,
    source_names: sourceNames,
    source_health_count: sourceHealth.length,
    source_ok_count: sourceHealth.filter((item) => item.status === "ok").length,
    source_error_count: sourceHealth.filter((item) => item.status === "error").length,
    model_feature_count: coverage.supplied_feature_count,
    expected_model_feature_count: coverage.expected_feature_count,
    model_feature_coverage: coverage.coverage,
    missing_model_features: coverage.missing_features,
    max_age_minutes: round(Math.max(...ages), 3),
    min_age_minutes: round(Math.min(...ages), 3),
    future_item_count: ages.filter((age) => age < 0).length,
  };
}

export function deriveResearchId(evidencePayload) {
  if (!evidencePayload || typeof evidencePayload !== "object" || Array.isArray(evidencePayload)) {
    throw new TypeError("evidencePayload must be an object");
  }
  const normalized = { ...evidencePayload };
  delete normalized.research_id;
  return `btc_res_${canonicalHash(normalized, "flux-research-id-v1").slice(0, 24)}`;
}

export function normalizeEvidenceScenario(scenario) {
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    throw new TypeError("scenario must be an object");
  }
  const asset = requiredText(scenario.asset ?? "BTC", "asset").toUpperCase();
  if (asset !== "BTC") throw new RangeError("This competition module supports BTC only");

  const asOf = normalizedIso(scenario.asOf, "asOf");
  const scenarioId = requiredText(scenario.scenarioId, "scenarioId");
  const classification = normalizeClassification(
    scenario.dataClassification,
    "dataClassification",
  );
  if (!Array.isArray(scenario.evidence) || scenario.evidence.length === 0) {
    throw new TypeError("evidence must be a non-empty array");
  }

  const seenIds = new Set();
  const seenMetrics = new Set();
  const items = scenario.evidence.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError(`evidence[${index}] must be an object`);
    }
    const evidenceId = requiredText(item.evidenceId, `evidence[${index}].evidenceId`);
    const metric = requiredText(item.metric, `evidence[${index}].metric`);
    if (seenIds.has(evidenceId)) throw new RangeError(`Duplicate evidenceId: ${evidenceId}`);
    if (seenMetrics.has(metric)) throw new RangeError(`Duplicate evidence metric: ${metric}`);
    seenIds.add(evidenceId);
    seenMetrics.add(metric);

    if (typeof item.value !== "number" || !Number.isFinite(item.value)) {
      throw new TypeError(`evidence[${index}].value must be a finite number`);
    }
    const transformId = optionalText(
      item.transformId ?? item.transform_id,
      `evidence[${index}].transformId`,
    );
    const transform = transformId === null ? null : getPublicTransform(transformId);
    if (transformId !== null && transform === null) {
      throw new RangeError(`Unsupported public transform: ${transformId}`);
    }
    const role = requiredText(
      item.role ?? transform?.role ?? "MODEL_FEATURE",
      `evidence[${index}].role`,
    ).toUpperCase();
    if (!ALLOWED_ROLES.has(role)) {
      throw new RangeError(`evidence[${index}].role must be MODEL_FEATURE or RISK_REFERENCE`);
    }
    const raw = normalizeRaw(item.raw, index, transformId);
    const source = normalizeSource(item.source, index, transformId !== null);
    const itemClassification = normalizeClassification(
      item.classification ?? (source.type === "PUBLIC" ? "PUBLIC_DEMO" : "SYNTHETIC_DEMO"),
      `evidence[${index}].classification`,
    );
    const expectedItemClassification =
      source.type === "PUBLIC" ? "PUBLIC_DEMO" : "SYNTHETIC_DEMO";
    if (itemClassification !== expectedItemClassification) {
      throw new RangeError(
        `evidence[${index}] classification must match its ${source.type} source type`,
      );
    }
    const observedAt = normalizedIso(item.observedAt, `evidence[${index}].observedAt`);

    const normalizedItem = {
      evidence_id: evidenceId,
      metric,
      role,
      value: round(item.value),
      unit: requiredText(item.unit ?? "z_score", `evidence[${index}].unit`),
      raw,
      transform_id: transformId,
      observed_at: observedAt,
      classification: itemClassification,
      source,
    };
    if (transformId !== null) {
      if (source.status !== "ok") {
        throw new RangeError(`evidence[${index}].source.status must be ok for usable evidence`);
      }
      if (source.as_of !== observedAt) {
        throw new RangeError(`evidence[${index}].observedAt must equal source.asOf`);
      }
      if (Date.parse(source.retrieved_at) + 300_000 < Date.parse(source.as_of)) {
        throw new RangeError(`evidence[${index}].source.asOf cannot be after retrieval time`);
      }
      const binding = validatePublicTransformBinding(normalizedItem);
      if (!binding.ok) {
        throw new RangeError(
          `evidence[${index}] ${binding.code}: expected ${binding.expected_value}`,
        );
      }
    }
    return normalizedItem;
  });
  items.sort((left, right) =>
    left.metric.localeCompare(right.metric) || left.evidence_id.localeCompare(right.evidence_id),
  );

  const sourceHealth = normalizeSourceHealth(scenario.sourceStatus ?? scenario.source_health);
  const evidenceSummary = summarizeEvidenceItems(asOf, items, sourceHealth);
  const publicCount = evidenceSummary.public_item_count;
  const syntheticCount = evidenceSummary.synthetic_item_count;
  const derivedClassification =
    publicCount === items.length
      ? "PUBLIC_DEMO"
      : syntheticCount === items.length
        ? "SYNTHETIC_DEMO"
        : "MIXED_PUBLIC_SYNTHETIC_DEMO";
  if (classification !== derivedClassification) {
    throw new RangeError(
      `dataClassification ${classification} does not match evidence provenance ${derivedClassification}`,
    );
  }
  const collection = normalizeCollection(scenario.collection, sourceHealth, classification, asOf);

  const normalized = {
    asset,
    scenario_id: scenarioId,
    as_of: asOf,
    data_classification: classification,
    collection,
    source_health: sourceHealth,
    evidence_items: items,
    evidence_summary: evidenceSummary,
    usage_boundary: "RESEARCH_AND_PAPER_SIMULATION_ONLY",
    disclaimer: "Synthetic/public demo evidence; not investment advice and not a live-trading input.",
  };
  return {
    research_id: deriveResearchId(normalized),
    ...normalized,
  };
}
