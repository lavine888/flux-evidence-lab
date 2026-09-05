const round = (value, digits = 6) => Number(value.toFixed(digits));

/**
 * Frozen, versioned multinomial logistic-regression artifact for the demo.
 * The coefficients are intentionally transparent and are not presented as a
 * profitable or production-trained strategy.
 */
export const BTC_MULTINOMIAL_LOGIT_V1 = Object.freeze({
  model_family: "multinomial_logistic_regression",
  model_version: "btc-multinomial-logit@1.0.0",
  asset: "BTC",
  classes: Object.freeze(["BUY", "HOLD", "SELL"]),
  feature_order: Object.freeze([
    "network_activity_z",
    "exchange_netflow_z",
    "realized_cap_growth_z",
    "developer_activity_z",
    "social_sentiment_z",
    "price_momentum_z",
    "macro_liquidity_z",
    "regulatory_risk_z",
  ]),
  feature_bounds: Object.freeze({ min: -3, max: 3 }),
  intercepts: Object.freeze({ BUY: -0.5, HOLD: 0.9, SELL: -0.5 }),
  coefficients: Object.freeze({
    BUY: Object.freeze({
      network_activity_z: 0.65,
      exchange_netflow_z: -0.75,
      realized_cap_growth_z: 0.55,
      developer_activity_z: 0.25,
      social_sentiment_z: 0.35,
      price_momentum_z: 0.7,
      macro_liquidity_z: 0.45,
      regulatory_risk_z: -0.8,
    }),
    HOLD: Object.freeze({
      network_activity_z: 0,
      exchange_netflow_z: 0,
      realized_cap_growth_z: 0,
      developer_activity_z: 0,
      social_sentiment_z: 0,
      price_momentum_z: 0,
      macro_liquidity_z: 0,
      regulatory_risk_z: 0,
    }),
    SELL: Object.freeze({
      network_activity_z: -0.65,
      exchange_netflow_z: 0.75,
      realized_cap_growth_z: -0.55,
      developer_activity_z: -0.25,
      social_sentiment_z: -0.35,
      price_momentum_z: -0.7,
      macro_liquidity_z: -0.45,
      regulatory_risk_z: 0.8,
    }),
  }),
  model_card: Object.freeze({
    intended_use: "Competition demonstration of auditable BTC candidate-signal inference.",
    data_scope: "Synthetic/public-demo normalized features only.",
    performance_claim: "NONE",
    limitations: Object.freeze([
      "Coefficients are transparent demo parameters, not evidence of future returns.",
      "Output is a candidate signal and remains subject to deterministic paper-only risk vetoes.",
      "The artifact cannot place or route a live order.",
    ]),
  }),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function softmax(logits, classes) {
  const maxLogit = Math.max(...classes.map((label) => logits[label]));
  const exponentials = Object.fromEntries(
    classes.map((label) => [label, Math.exp(logits[label] - maxLogit)]),
  );
  const denominator = classes.reduce((sum, label) => sum + exponentials[label], 0);
  return Object.fromEntries(
    classes.map((label) => [label, round(exponentials[label] / denominator)]),
  );
}

/**
 * Executes the frozen model. Evidence metrics map one-to-one to model features;
 * absent features are neutral (zero) and are reported explicitly.
 */
export function inferBtcCandidate(evidenceItems, model = BTC_MULTINOMIAL_LOGIT_V1) {
  if (!Array.isArray(evidenceItems)) {
    throw new TypeError("evidenceItems must be an array");
  }

  const metricValues = new Map(evidenceItems.map((item) => [item.metric, item.value]));
  const featureVector = {};
  const missingFeatures = [];

  for (const feature of model.feature_order) {
    const supplied = metricValues.get(feature);
    if (supplied === undefined) {
      featureVector[feature] = 0;
      missingFeatures.push(feature);
      continue;
    }
    if (typeof supplied !== "number" || !Number.isFinite(supplied)) {
      throw new TypeError(`Feature ${feature} must be a finite number`);
    }
    featureVector[feature] = round(
      clamp(supplied, model.feature_bounds.min, model.feature_bounds.max),
    );
  }

  const logits = {};
  const contributions = {};
  for (const label of model.classes) {
    contributions[label] = {};
    let logit = model.intercepts[label];
    for (const feature of model.feature_order) {
      const contribution = featureVector[feature] * model.coefficients[label][feature];
      contributions[label][feature] = round(contribution);
      logit += contribution;
    }
    logits[label] = round(logit);
  }

  const probabilities = softmax(logits, model.classes);
  const candidateAction = model.classes.reduce((winner, label) =>
    probabilities[label] > probabilities[winner] ? label : winner,
  );

  return {
    model_family: model.model_family,
    model_version: model.model_version,
    candidate_action: candidateAction,
    candidate_probability: probabilities[candidateAction],
    class_probabilities: probabilities,
    logits,
    feature_vector: featureVector,
    feature_contributions: contributions,
    missing_features: missingFeatures,
    inference_role: "DIRECT_CANDIDATE_SIGNAL",
    performance_claim: model.model_card.performance_claim,
  };
}
