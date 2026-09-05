import { calculateModelFeatureCoverage } from "./evidence.mjs";
import {
  PUBLIC_BTC_COLLECTION_POLICY,
  evidenceFreshnessLimitMinutes,
} from "./public-feature-transforms.mjs";

const round = (value, digits = 8) => Number(value.toFixed(digits));

export const PAPER_RISK_POLICY_VERSION = "btc-paper-risk@1.1.0";

export const DEFAULT_PAPER_RISK_LIMITS = Object.freeze({
  max_evidence_age_minutes: 180,
  min_feature_coverage: 0.5,
  min_candidate_probability: 0.58,
  max_order_notional_usd: 1_000,
  max_position_pct_equity: 0.02,
  max_daily_paper_orders: 12,
});

function finiteNumber(value, field, { min = -Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  if ((exclusiveMin && value <= min) || (!exclusiveMin && value < min)) {
    throw new RangeError(`${field} is below its allowed minimum`);
  }
  return value;
}

export function normalizePaperRiskContext(context = {}) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new TypeError("riskContext must be an object");
  }
  const portfolio = context.paperPortfolio ?? {};
  const suppliedLimits = context.limits ?? {};
  const limits = {
    max_evidence_age_minutes: finiteNumber(
      suppliedLimits.maxEvidenceAgeMinutes ?? DEFAULT_PAPER_RISK_LIMITS.max_evidence_age_minutes,
      "limits.maxEvidenceAgeMinutes",
      { min: 0, exclusiveMin: true },
    ),
    min_feature_coverage: finiteNumber(
      suppliedLimits.minFeatureCoverage ?? DEFAULT_PAPER_RISK_LIMITS.min_feature_coverage,
      "limits.minFeatureCoverage",
      { min: DEFAULT_PAPER_RISK_LIMITS.min_feature_coverage },
    ),
    min_candidate_probability: finiteNumber(
      suppliedLimits.minCandidateProbability ??
        DEFAULT_PAPER_RISK_LIMITS.min_candidate_probability,
      "limits.minCandidateProbability",
      { min: 0 },
    ),
    max_order_notional_usd: finiteNumber(
      suppliedLimits.maxOrderNotionalUsd ?? DEFAULT_PAPER_RISK_LIMITS.max_order_notional_usd,
      "limits.maxOrderNotionalUsd",
      { min: 0, exclusiveMin: true },
    ),
    max_position_pct_equity: finiteNumber(
      suppliedLimits.maxPositionPctEquity ??
        DEFAULT_PAPER_RISK_LIMITS.max_position_pct_equity,
      "limits.maxPositionPctEquity",
      { min: 0, exclusiveMin: true },
    ),
    max_daily_paper_orders: finiteNumber(
      suppliedLimits.maxDailyPaperOrders ?? DEFAULT_PAPER_RISK_LIMITS.max_daily_paper_orders,
      "limits.maxDailyPaperOrders",
      { min: 0 },
    ),
  };
  if (limits.min_candidate_probability > 1) {
    throw new RangeError("limits.minCandidateProbability cannot exceed 1");
  }
  if (limits.min_feature_coverage > 1) {
    throw new RangeError("limits.minFeatureCoverage cannot exceed 1");
  }
  if (limits.max_position_pct_equity > 1) {
    throw new RangeError("limits.maxPositionPctEquity cannot exceed 1");
  }
  const suppliedReferenceEvidenceId =
    context.referencePriceEvidenceId ?? context.reference_price_evidence_id ?? null;
  const referencePriceEvidenceId =
    suppliedReferenceEvidenceId === null ? null : String(suppliedReferenceEvidenceId).trim();
  if (referencePriceEvidenceId === "") {
    throw new TypeError("referencePriceEvidenceId must be a non-empty string when supplied");
  }

  return {
    requested_execution_mode: String(context.requestedExecutionMode ?? "PAPER_SIMULATION")
      .trim()
      .toUpperCase(),
    requested_notional_usd: round(
      finiteNumber(context.requestedNotionalUsd ?? 250, "requestedNotionalUsd", {
        min: 0,
        exclusiveMin: true,
      }),
      2,
    ),
    reference_price_usd: round(
      finiteNumber(context.referencePriceUsd ?? 60_000, "referencePriceUsd", {
        min: 0,
        exclusiveMin: true,
      }),
      2,
    ),
    reference_price_evidence_id: referencePriceEvidenceId,
    paper_portfolio: {
      equity_usd: round(
        finiteNumber(portfolio.equityUsd ?? 10_000, "paperPortfolio.equityUsd", {
          min: 0,
          exclusiveMin: true,
        }),
        2,
      ),
      current_btc: round(
        finiteNumber(portfolio.currentBtc ?? 0.01, "paperPortfolio.currentBtc", { min: 0 }),
      ),
      daily_paper_orders: Math.trunc(
        finiteNumber(portfolio.dailyPaperOrders ?? 0, "paperPortfolio.dailyPaperOrders", {
          min: 0,
        }),
      ),
    },
    limits,
  };
}

function rule(id, passed, observed, limit) {
  return { rule_id: id, passed: Boolean(passed), observed, limit };
}

function freshnessAssessment(evidencePayload, fallbackLimitMinutes) {
  const asOfMs = Date.parse(evidencePayload.as_of);
  const items = evidencePayload.evidence_items.map((item) => {
    const ageMinutes = (asOfMs - Date.parse(item.observed_at)) / 60_000;
    const limitMinutes = evidenceFreshnessLimitMinutes(item, fallbackLimitMinutes);
    return {
      evidence_id: item.evidence_id,
      metric: item.metric,
      age_minutes: round(ageMinutes, 3),
      limit_minutes: limitMinutes,
      passed: Number.isFinite(ageMinutes) && ageMinutes <= limitMinutes,
    };
  });
  return {
    passed: items.every((item) => item.passed),
    observed: {
      stale_item_count: items.filter((item) => !item.passed).length,
      items,
    },
  };
}

function referencePriceAssessment(evidencePayload, normalizedContext) {
  const evidenceId = normalizedContext.reference_price_evidence_id;
  const referenceItems = evidencePayload.evidence_items.filter(
    (item) => item.role === "RISK_REFERENCE",
  );
  const strict =
    evidencePayload.collection?.adapter_id === PUBLIC_BTC_COLLECTION_POLICY.adapter_id ||
    evidenceId !== null ||
    referenceItems.length > 0;
  if (!strict) {
    return { passed: true, observed: "LEGACY_UNBOUND_CONTEXT", limit: "NOT_APPLICABLE" };
  }
  const bound = referenceItems.find((item) => item.evidence_id === evidenceId);
  const evidencePrice = bound?.value ?? null;
  return {
    passed:
      referenceItems.length === 1 &&
      bound !== undefined &&
      round(evidencePrice, 2) === normalizedContext.reference_price_usd,
    observed: {
      context_evidence_id: evidenceId,
      reference_item_count: referenceItems.length,
      evidence_price_usd: evidencePrice,
      context_price_usd: normalizedContext.reference_price_usd,
    },
    limit: "EXACT_EVIDENCE_ID_AND_PRICE_MATCH",
  };
}

export function evaluatePaperRisk(modelPayload, evidencePayload, normalizedContext) {
  const candidate = modelPayload.candidate_action;
  if (!new Set(["BUY", "HOLD", "SELL"]).has(candidate)) {
    throw new RangeError("modelPayload.candidate_action must be BUY, HOLD, or SELL");
  }

  const { limits, paper_portfolio: portfolio } = normalizedContext;
  const proposedQuantity = round(
    normalizedContext.requested_notional_usd / normalizedContext.reference_price_usd,
  );
  const currentPositionValue = portfolio.current_btc * normalizedContext.reference_price_usd;
  const projectedPositionValue =
    candidate === "BUY"
      ? currentPositionValue + normalizedContext.requested_notional_usd
      : candidate === "SELL"
        ? Math.max(0, currentPositionValue - normalizedContext.requested_notional_usd)
        : currentPositionValue;
  const projectedPositionPct = projectedPositionValue / portfolio.equity_usd;
  const availableBtcValue = portfolio.current_btc * normalizedContext.reference_price_usd;
  const freshness = freshnessAssessment(evidencePayload, limits.max_evidence_age_minutes);
  const coverage = calculateModelFeatureCoverage(evidencePayload.evidence_items);
  const coverageLimit = Math.max(
    limits.min_feature_coverage,
    DEFAULT_PAPER_RISK_LIMITS.min_feature_coverage,
  );
  const referencePrice = referencePriceAssessment(evidencePayload, normalizedContext);
  const collectionRequiresHealth =
    evidencePayload.collection?.adapter_id === PUBLIC_BTC_COLLECTION_POLICY.adapter_id ||
    evidencePayload.evidence_items.some((item) => item.transform_id !== null);
  const sourceHealthPassed =
    !collectionRequiresHealth || evidencePayload.collection?.status === "HEALTHY";

  const rules = [
    rule(
      "PAPER_ONLY_MODE",
      new Set(["PAPER", "PAPER_SIMULATION"]).has(normalizedContext.requested_execution_mode),
      normalizedContext.requested_execution_mode,
      "PAPER_OR_PAPER_SIMULATION",
    ),
    rule(
      "EVIDENCE_FRESHNESS",
      freshness.passed,
      freshness.observed,
      "TRANSFORM_POLICY_OR_CONTEXT_FALLBACK",
    ),
    rule(
      "NO_FUTURE_EVIDENCE",
      evidencePayload.evidence_summary.future_item_count === 0,
      evidencePayload.evidence_summary.future_item_count,
      0,
    ),
    rule(
      "FEATURE_COVERAGE",
      coverage.coverage >= coverageLimit,
      {
        coverage: coverage.coverage,
        supplied_feature_count: coverage.supplied_feature_count,
        expected_feature_count: coverage.expected_feature_count,
        missing_features: coverage.missing_features,
      },
      coverageLimit,
    ),
    rule(
      "SOURCE_HEALTH",
      sourceHealthPassed,
      evidencePayload.collection?.status ?? "NOT_REPORTED",
      collectionRequiresHealth ? "HEALTHY" : "NOT_APPLICABLE",
    ),
    rule(
      "REFERENCE_PRICE_BOUND",
      referencePrice.passed,
      referencePrice.observed,
      referencePrice.limit,
    ),
    rule(
      "MODEL_CONFIDENCE",
      modelPayload.candidate_probability >= limits.min_candidate_probability,
      modelPayload.candidate_probability,
      limits.min_candidate_probability,
    ),
    rule(
      "ORDER_NOTIONAL_LIMIT",
      normalizedContext.requested_notional_usd <= limits.max_order_notional_usd,
      normalizedContext.requested_notional_usd,
      limits.max_order_notional_usd,
    ),
    rule(
      "PAPER_POSITION_LIMIT",
      projectedPositionPct <= limits.max_position_pct_equity,
      round(projectedPositionPct, 6),
      limits.max_position_pct_equity,
    ),
    rule(
      "PAPER_SELL_INVENTORY",
      candidate !== "SELL" || normalizedContext.requested_notional_usd <= availableBtcValue,
      round(availableBtcValue, 2),
      candidate === "SELL" ? normalizedContext.requested_notional_usd : "NOT_APPLICABLE",
    ),
    rule(
      "DAILY_PAPER_ORDER_LIMIT",
      portfolio.daily_paper_orders < limits.max_daily_paper_orders,
      portfolio.daily_paper_orders,
      limits.max_daily_paper_orders,
    ),
  ];

  const failedRuleIds = rules.filter((item) => !item.passed).map((item) => item.rule_id);
  const actionable = candidate !== "HOLD";
  const criticalInputFailure = failedRuleIds.some((id) =>
    new Set(["FEATURE_COVERAGE", "SOURCE_HEALTH", "REFERENCE_PRICE_BOUND"]).has(id));
  const vetoed = failedRuleIds.length > 0 && (actionable || criticalInputFailure);
  const finalAction = vetoed ? "HOLD" : candidate;
  const status = vetoed ? "BLOCK" : !actionable ? "NO_ACTION" : "PASS";

  return {
    risk_policy_version: PAPER_RISK_POLICY_VERSION,
    enforcement_role: "DETERMINISTIC_FINAL_VETO",
    candidate_action: candidate,
    candidate_probability: modelPayload.candidate_probability,
    status,
    vetoed,
    final_action: finalAction,
    failed_rule_ids: failedRuleIds,
    rules,
    normalized_context: normalizedContext,
    proposed_paper_order:
      actionable
        ? {
            symbol: "BTC-USD",
            side: candidate,
            notional_usd: normalizedContext.requested_notional_usd,
            quantity_btc: proposedQuantity,
            reference_price_usd: normalizedContext.reference_price_usd,
          }
        : null,
    live_execution: "FORBIDDEN",
  };
}
