const FEATURE_NAMES = [
  "network_activity_z",
  "exchange_netflow_z",
  "realized_cap_growth_z",
  "developer_activity_z",
  "social_sentiment_z",
  "price_momentum_z",
  "macro_liquidity_z",
  "regulatory_risk_z",
];

function syntheticEvidence(values, observedAt) {
  return FEATURE_NAMES.map((metric, index) => ({
    evidenceId: `syn_${metric}`,
    metric,
    value: values[index],
    unit: "z_score",
    observedAt,
    classification: "SYNTHETIC_DEMO",
    source: {
      name: "Flux BTC Synthetic Fixture Generator",
      type: "SYNTHETIC",
      url: null,
    },
  }));
}

function riskContext(overrides = {}) {
  return {
    requestedExecutionMode: "PAPER_SIMULATION",
    requestedNotionalUsd: 500,
    referencePriceUsd: 60_000,
    paperPortfolio: {
      equityUsd: 100_000,
      currentBtc: 0.02,
      dailyPaperOrders: 1,
    },
    limits: {
      maxEvidenceAgeMinutes: 180,
      minCandidateProbability: 0.58,
      maxOrderNotionalUsd: 1_000,
      maxPositionPctEquity: 0.02,
      maxDailyPaperOrders: 12,
    },
    ...overrides,
  };
}

const base = {
  asset: "BTC",
  asOf: "2026-09-01T04:00:00.000Z",
  dataClassification: "SYNTHETIC_DEMO",
};

export const demoScenarios = Object.freeze({
  "positive-buy": {
    ...base,
    scenarioId: "positive-buy",
    title: "Fresh bullish evidence",
    expected: { candidateAction: "BUY", riskStatus: "PASS", finalAction: "BUY" },
    evidence: syntheticEvidence(
      [1.2, -1.1, 0.9, 0.5, 0.8, 1.1, 0.6, -0.7],
      "2026-09-01T03:30:00.000Z",
    ),
    riskContext: riskContext(),
  },
  "neutral-hold": {
    ...base,
    scenarioId: "neutral-hold",
    title: "Neutral evidence",
    expected: { candidateAction: "HOLD", riskStatus: "NO_ACTION", finalAction: "HOLD" },
    evidence: syntheticEvidence([0, 0, 0, 0, 0, 0, 0, 0], "2026-09-01T03:30:00.000Z"),
    riskContext: riskContext(),
  },
  "bearish-sell": {
    ...base,
    scenarioId: "bearish-sell",
    title: "Fresh bearish evidence",
    expected: { candidateAction: "SELL", riskStatus: "PASS", finalAction: "SELL" },
    evidence: syntheticEvidence(
      [-1.2, 1.1, -0.9, -0.5, -0.8, -1.1, -0.6, 0.7],
      "2026-09-01T03:30:00.000Z",
    ),
    riskContext: riskContext(),
  },
  "stale-veto": {
    ...base,
    scenarioId: "stale-veto",
    title: "Bullish but stale evidence",
    expected: { candidateAction: "BUY", riskStatus: "BLOCK", finalAction: "HOLD" },
    evidence: syntheticEvidence(
      [1.2, -1.1, 0.9, 0.5, 0.8, 1.1, 0.6, -0.7],
      "2026-08-31T04:00:00.000Z",
    ),
    riskContext: riskContext(),
  },
  "live-mode-veto": {
    ...base,
    scenarioId: "live-mode-veto",
    title: "Rejected live-mode attempt",
    expected: { candidateAction: "BUY", riskStatus: "BLOCK", finalAction: "HOLD" },
    evidence: syntheticEvidence(
      [1.2, -1.1, 0.9, 0.5, 0.8, 1.1, 0.6, -0.7],
      "2026-09-01T03:30:00.000Z",
    ),
    riskContext: riskContext({ requestedExecutionMode: "LIVE" }),
  },
});

export const demoScenarioCatalog = Object.freeze(
  Object.values(demoScenarios).map(({ scenarioId, title, expected, dataClassification }) => ({
    scenarioId,
    title,
    expected,
    dataClassification,
  })),
);

export function getDemoScenario(scenarioId) {
  const scenario = demoScenarios[scenarioId];
  if (!scenario) throw new RangeError(`Unknown demo scenario: ${scenarioId}`);
  return structuredClone(scenario);
}
