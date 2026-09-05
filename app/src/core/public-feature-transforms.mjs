const round = (value, digits = 6) => Number(value.toFixed(digits));

export const PUBLIC_BTC_COLLECTION_POLICY = Object.freeze({
  adapter_id: "public-btc-keyless@1.0.0",
  expected_source_ids: Object.freeze([
    "alternative_fng",
    "coinlore_market",
    "coinmetrics_network",
    "github_bitcoin",
  ]),
  required_source_ids: Object.freeze(["coinlore_market"]),
});

export const PUBLIC_BTC_SOURCE_POLICIES = Object.freeze({
  alternative_fng: Object.freeze({
    name: "Alternative.me Fear & Greed",
    category: "sentiment",
    type: "PUBLIC",
    url: "https://api.alternative.me/fng/?limit=7&format=json",
  }),
  coinlore_market: Object.freeze({
    name: "CoinLore",
    category: "market",
    type: "PUBLIC",
    url: "https://api.coinlore.net/api/ticker/?id=90",
  }),
  coinmetrics_network: Object.freeze({
    name: "Coin Metrics Community",
    category: "onchain",
    type: "PUBLIC",
    url: "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=AdrActCnt,TxCnt&frequency=1d&page_size=8",
  }),
  github_bitcoin: Object.freeze({
    name: "GitHub bitcoin/bitcoin",
    category: "developer",
    type: "PUBLIC",
    url: "https://api.github.com/repos/bitcoin/bitcoin",
  }),
});

export const PUBLIC_TRANSFORM_IDS = Object.freeze({
  NETWORK_ACTIVITY: "btc.network.active-addresses-7d-change.divide-5@1.0.0",
  DEVELOPER_ACTIVITY: "btc.developer.days-since-push.offset-14-divide-7@1.0.0",
  SENTIMENT: "btc.sentiment.fear-greed.center-50-divide-20@1.0.0",
  MOMENTUM: "btc.market.price-change-7d.divide-5@1.0.0",
  REFERENCE_PRICE: "btc.market.price-usd.identity@1.0.0",
});

const definitions = [
  {
    transform_id: PUBLIC_TRANSFORM_IDS.NETWORK_ACTIVITY,
    source_id: "coinmetrics_network",
    timestamp_basis: "SOURCE_OBSERVATION_TIME",
    metric: "network_activity_z",
    role: "MODEL_FEATURE",
    raw_unit: "percent_change_7d",
    output_unit: "normalized_public_feature",
    formula: "raw / 5",
    max_age_minutes: 4_320,
    apply: (raw) => raw / 5,
  },
  {
    transform_id: PUBLIC_TRANSFORM_IDS.DEVELOPER_ACTIVITY,
    source_id: "github_bitcoin",
    timestamp_basis: "SOURCE_EVENT_TIME",
    metric: "developer_activity_z",
    role: "MODEL_FEATURE",
    raw_unit: "days",
    output_unit: "normalized_public_feature",
    formula: "(14 - raw) / 7",
    max_age_minutes: 43_200,
    apply: (raw) => (14 - raw) / 7,
  },
  {
    transform_id: PUBLIC_TRANSFORM_IDS.SENTIMENT,
    source_id: "alternative_fng",
    timestamp_basis: "SOURCE_PUBLISHED_TIME",
    metric: "social_sentiment_z",
    role: "MODEL_FEATURE",
    raw_unit: "index_0_100",
    output_unit: "normalized_public_feature",
    formula: "(raw - 50) / 20",
    max_age_minutes: 2_880,
    apply: (raw) => (raw - 50) / 20,
  },
  {
    transform_id: PUBLIC_TRANSFORM_IDS.MOMENTUM,
    source_id: "coinlore_market",
    timestamp_basis: "RETRIEVAL_TIME",
    metric: "price_momentum_z",
    role: "MODEL_FEATURE",
    raw_unit: "percent_change_7d",
    output_unit: "normalized_public_feature",
    formula: "raw / 5",
    max_age_minutes: 180,
    apply: (raw) => raw / 5,
  },
  {
    transform_id: PUBLIC_TRANSFORM_IDS.REFERENCE_PRICE,
    source_id: "coinlore_market",
    timestamp_basis: "RETRIEVAL_TIME",
    metric: "btc_reference_price_usd",
    role: "RISK_REFERENCE",
    raw_unit: "USD",
    output_unit: "USD",
    formula: "raw",
    max_age_minutes: 30,
    apply: (raw) => raw,
  },
];

const registry = new Map(definitions.map((definition) => [definition.transform_id, definition]));

export const PUBLIC_FEATURE_TRANSFORMS = Object.freeze(
  Object.fromEntries(
    definitions.map(({ apply: _apply, ...metadata }) => [metadata.transform_id, Object.freeze(metadata)]),
  ),
);

export function getPublicTransform(transformId) {
  const definition = registry.get(transformId);
  if (!definition) return null;
  const { apply: _apply, ...metadata } = definition;
  return metadata;
}

export function transformPublicRawValue(transformId, rawValue) {
  const definition = registry.get(transformId);
  if (!definition) throw new RangeError(`Unsupported public transform: ${transformId}`);
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    throw new TypeError("Public transform raw value must be a finite number");
  }
  return round(definition.apply(rawValue));
}

export function validatePublicTransformBinding(item) {
  const definition = registry.get(item?.transform_id);
  if (!definition) {
    return { ok: false, code: "PUBLIC_TRANSFORM_UNSUPPORTED", expected_value: null };
  }
  const expectedValue = transformPublicRawValue(definition.transform_id, item?.raw?.value);
  const metadataMatches =
    item.metric === definition.metric &&
    item.role === definition.role &&
    item.raw?.unit === definition.raw_unit &&
    item.unit === definition.output_unit &&
    item.source?.id === definition.source_id &&
    item.source?.timestamp_basis === definition.timestamp_basis;
  return {
    ok: metadataMatches && item.value === expectedValue,
    code: metadataMatches ? "PUBLIC_TRANSFORM_MISMATCH" : "PUBLIC_TRANSFORM_METADATA_MISMATCH",
    expected_value: expectedValue,
  };
}

export function evidenceFreshnessLimitMinutes(item, fallbackMinutes) {
  const definition = registry.get(item?.transform_id);
  return definition?.max_age_minutes ?? fallbackMinutes;
}
