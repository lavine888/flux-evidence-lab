import {
  PUBLIC_BTC_COLLECTION_POLICY,
  PUBLIC_BTC_SOURCE_POLICIES,
  PUBLIC_TRANSFORM_IDS,
  getPublicTransform,
  transformPublicRawValue,
} from "../core/public-feature-transforms.mjs";

const DEFAULT_TIMEOUT_MS = 12_000;
const RESPONSE_LIMIT_BYTES = 1_000_000;

export const PUBLIC_BTC_ENDPOINTS = Object.freeze({
  market: Object.freeze({
    id: "coinlore_market",
    ...PUBLIC_BTC_SOURCE_POLICIES.coinlore_market,
  }),
  network: Object.freeze({
    id: "coinmetrics_network",
    ...PUBLIC_BTC_SOURCE_POLICIES.coinmetrics_network,
  }),
  sentiment: Object.freeze({
    id: "alternative_fng",
    ...PUBLIC_BTC_SOURCE_POLICIES.alternative_fng,
  }),
  developer: Object.freeze({
    id: "github_bitcoin",
    ...PUBLIC_BTC_SOURCE_POLICIES.github_bitcoin,
  }),
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function iso(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function nowIso(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("clock must return a valid date");
  return date.toISOString();
}

function freshness(asOf, generatedAt) {
  const ageHours = (Date.parse(generatedAt) - Date.parse(asOf)) / 3_600_000;
  if (!Number.isFinite(ageHours)) return "unknown";
  if (ageHours <= 24) return "fresh";
  if (ageHours <= 72) return "aging";
  return "stale";
}

async function fetchJson(spec, { fetchImpl, clock, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let retrievedAt = nowIso(clock);
  try {
    const response = await fetchImpl(spec.url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Flux-Evidence-Lab/1.0",
      },
      signal: controller.signal,
    });
    retrievedAt = nowIso(clock);
    const declaredLength = finite(response.headers?.get?.("content-length")) ?? 0;
    if (declaredLength > RESPONSE_LIMIT_BYTES) {
      throw new Error(`${spec.name} response exceeds 1 MB`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > RESPONSE_LIMIT_BYTES) {
      throw new Error(`${spec.name} response exceeds 1 MB`);
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`${spec.name} returned invalid JSON`);
    }
    if (!response.ok) throw new Error(`${spec.name} returned HTTP ${response.status}`);
    return { ok: true, payload, retrievedAt, error: null };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? `${spec.name} request timed out`
      : String(error?.message || error);
    return { ok: false, payload: null, retrievedAt, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function parseMarket(payload) {
  const item = Array.isArray(payload) ? payload[0] : null;
  const priceUsd = finite(item?.price_usd);
  if (!item || priceUsd === null || priceUsd <= 0) throw new Error("CoinLore market payload is unusable");
  return {
    priceUsd,
    marketCapUsd: finite(item.market_cap_usd),
    volume24hUsd: finite(item.volume24),
    priceChange24hPct: finite(item.percent_change_24h),
    priceChange7dPct: finite(item.percent_change_7d),
  };
}

function parseNetwork(payload) {
  const rows = Array.isArray(payload?.data)
    ? payload.data
        .map((row) => ({
          time: iso(row?.time),
          activeAddresses: finite(row?.AdrActCnt),
          transactionCount: finite(row?.TxCnt),
        }))
        .filter((row) => row.time && row.activeAddresses !== null)
        .sort((left, right) => Date.parse(left.time) - Date.parse(right.time))
    : [];
  if (!rows.length) throw new Error("Coin Metrics network payload is unusable");
  const first = rows[0];
  const latest = rows.at(-1);
  const changePct = rows.length > 1 && first.activeAddresses !== 0
    ? ((latest.activeAddresses - first.activeAddresses) / Math.abs(first.activeAddresses)) * 100
    : 0;
  return { ...latest, activeAddresses7dChangePct: changePct };
}

function parseSentiment(payload) {
  const item = Array.isArray(payload?.data) ? payload.data[0] : null;
  const value = finite(item?.value);
  if (!item || value === null || value < 0 || value > 100) {
    throw new Error("Alternative.me sentiment payload is unusable");
  }
  const timestampSeconds = finite(item.timestamp);
  return {
    value,
    label: String(item.value_classification || "unknown"),
    asOf: timestampSeconds === null ? null : new Date(timestampSeconds * 1_000).toISOString(),
  };
}

function parseDeveloper(payload, retrievedAt) {
  const pushedAt = iso(payload?.pushed_at);
  if (!pushedAt || String(payload?.full_name || "").toLowerCase() !== "bitcoin/bitcoin") {
    throw new Error("GitHub repository payload is unusable");
  }
  return {
    pushedAt,
    daysSincePush: Math.max(0, (Date.parse(retrievedAt) - Date.parse(pushedAt)) / 86_400_000),
    stars: finite(payload.stargazers_count),
  };
}

function publicEvidence({ id, rawValue, fieldPath, transformId, observedAt, timestampBasis, source, retrievedAt }) {
  const transform = getPublicTransform(transformId);
  if (!transform) throw new RangeError(`Unsupported public transform: ${transformId}`);
  const signedRawValue = Number(rawValue.toFixed(6));
  return {
    evidenceId: id,
    metric: transform.metric,
    role: transform.role,
    value: transformPublicRawValue(transformId, signedRawValue),
    unit: transform.output_unit,
    raw: {
      value: signedRawValue,
      unit: transform.raw_unit,
      fieldPath,
    },
    transformId,
    observedAt,
    classification: "PUBLIC_DEMO",
    source: {
      id: source.id,
      name: source.name,
      category: source.category,
      type: "PUBLIC",
      url: source.url,
      retrievedAt,
      asOf: observedAt,
      timestampBasis,
      status: "ok",
    },
  };
}

function statusFor(spec, result, asOf, generatedAt, timestampBasis) {
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    type: "PUBLIC",
    status: result.ok ? "ok" : "error",
    configured: true,
    url: spec.url,
    retrievedAt: result.retrievedAt,
    asOf: asOf || null,
    observedAt: asOf || result.retrievedAt,
    timestampBasis,
    freshness: asOf ? freshness(asOf, generatedAt) : "unknown",
    cached: false,
    error: result.error,
  };
}

export async function fetchPublicBtcScenario({
  fetchImpl = fetch,
  clock = () => new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (typeof clock !== "function") throw new TypeError("clock must be a function");

  const specs = PUBLIC_BTC_ENDPOINTS;
  const [marketResult, networkResult, sentimentResult, developerResult] = await Promise.all([
    fetchJson(specs.market, { fetchImpl, clock, timeoutMs }),
    fetchJson(specs.network, { fetchImpl, clock, timeoutMs }),
    fetchJson(specs.sentiment, { fetchImpl, clock, timeoutMs }),
    fetchJson(specs.developer, { fetchImpl, clock, timeoutMs }),
  ]);
  const generatedAt = nowIso(clock);

  let market;
  try {
    if (!marketResult.ok) throw new Error(marketResult.error);
    market = parseMarket(marketResult.payload);
  } catch (error) {
    const failure = new Error(`Public BTC market source unavailable: ${error.message}`);
    failure.statusCode = 502;
    throw failure;
  }

  const evidence = [];
  const parsed = { market, network: null, sentiment: null, developer: null };
  evidence.push(publicEvidence({
    id: "public_coinlore_reference_price",
    rawValue: market.priceUsd,
    fieldPath: "$[0].price_usd",
    transformId: PUBLIC_TRANSFORM_IDS.REFERENCE_PRICE,
    observedAt: marketResult.retrievedAt,
    timestampBasis: "RETRIEVAL_TIME",
    source: specs.market,
    retrievedAt: marketResult.retrievedAt,
  }));
  if (market.priceChange7dPct !== null) {
    evidence.push(publicEvidence({
      id: "public_coinlore_price_momentum",
      rawValue: market.priceChange7dPct,
      fieldPath: "$[0].percent_change_7d",
      transformId: PUBLIC_TRANSFORM_IDS.MOMENTUM,
      observedAt: marketResult.retrievedAt,
      timestampBasis: "RETRIEVAL_TIME",
      source: specs.market,
      retrievedAt: marketResult.retrievedAt,
    }));
  }

  if (networkResult.ok) {
    try {
      parsed.network = parseNetwork(networkResult.payload);
      evidence.push(publicEvidence({
        id: "public_coinmetrics_network_activity",
        rawValue: parsed.network.activeAddresses7dChangePct,
        fieldPath: "derived($.data[].AdrActCnt:first,last):percent_change_7d",
        transformId: PUBLIC_TRANSFORM_IDS.NETWORK_ACTIVITY,
        observedAt: parsed.network.time,
        timestampBasis: "SOURCE_OBSERVATION_TIME",
        source: specs.network,
        retrievedAt: networkResult.retrievedAt,
      }));
    } catch (error) {
      networkResult.ok = false;
      networkResult.error = error.message;
    }
  }

  if (sentimentResult.ok) {
    try {
      parsed.sentiment = parseSentiment(sentimentResult.payload);
      evidence.push(publicEvidence({
        id: "public_alternative_sentiment",
        rawValue: parsed.sentiment.value,
        fieldPath: "$.data[0].value",
        transformId: PUBLIC_TRANSFORM_IDS.SENTIMENT,
        observedAt: parsed.sentiment.asOf || sentimentResult.retrievedAt,
        timestampBasis: parsed.sentiment.asOf ? "SOURCE_PUBLISHED_TIME" : "RETRIEVAL_TIME",
        source: specs.sentiment,
        retrievedAt: sentimentResult.retrievedAt,
      }));
    } catch (error) {
      sentimentResult.ok = false;
      sentimentResult.error = error.message;
    }
  }

  if (developerResult.ok) {
    try {
      parsed.developer = parseDeveloper(developerResult.payload, developerResult.retrievedAt);
      evidence.push(publicEvidence({
        id: "public_github_developer_activity",
        rawValue: parsed.developer.daysSincePush,
        fieldPath: "derived($.pushed_at,retrieved_at):days_since_push",
        transformId: PUBLIC_TRANSFORM_IDS.DEVELOPER_ACTIVITY,
        observedAt: parsed.developer.pushedAt,
        timestampBasis: "SOURCE_EVENT_TIME",
        source: specs.developer,
        retrievedAt: developerResult.retrievedAt,
      }));
    } catch (error) {
      developerResult.ok = false;
      developerResult.error = error.message;
    }
  }

  if (!evidence.some((item) => item.role === "MODEL_FEATURE")) {
    const error = new Error("Public BTC sources returned no supported model features");
    error.statusCode = 502;
    throw error;
  }

  const sourceStatus = [
    statusFor(specs.market, marketResult, marketResult.retrievedAt, generatedAt, "RETRIEVAL_TIME"),
    statusFor(specs.network, networkResult, parsed.network?.time, generatedAt, "SOURCE_OBSERVATION_TIME"),
    statusFor(
      specs.sentiment,
      sentimentResult,
      sentimentResult.ok ? parsed.sentiment?.asOf || sentimentResult.retrievedAt : null,
      generatedAt,
      parsed.sentiment?.asOf ? "SOURCE_PUBLISHED_TIME" : "RETRIEVAL_TIME",
    ),
    statusFor(specs.developer, developerResult, parsed.developer?.pushedAt, generatedAt, "SOURCE_EVENT_TIME"),
  ];

  const inputSummary = {
    source: "publicLive",
    data_classification: "PUBLIC_DEMO",
    market_price_usd: market.priceUsd,
    market_change_24h_pct: market.priceChange24hPct,
    market_change_7d_pct: market.priceChange7dPct,
    feature_count: evidence.filter((item) => item.role === "MODEL_FEATURE").length,
    source_ok_count: sourceStatus.filter((item) => item.status === "ok").length,
    source_count: sourceStatus.length,
    feature_mapping: "DETERMINISTIC_PUBLIC_SOURCE_NORMALIZATION",
  };

  return {
    scenario: {
      scenarioId: "public-btc-live",
      asset: "BTC",
      asOf: generatedAt,
      dataClassification: "PUBLIC_DEMO",
      evidence,
      sourceStatus,
      collection: {
        adapterId: PUBLIC_BTC_COLLECTION_POLICY.adapter_id,
        mode: "PUBLIC_HTTPS_READ_ONLY",
        expectedSourceIds: PUBLIC_BTC_COLLECTION_POLICY.expected_source_ids,
        collectedAt: generatedAt,
      },
      riskContext: {
        requestedExecutionMode: "PAPER_SIMULATION",
        requestedNotionalUsd: 500,
        referencePriceUsd: market.priceUsd,
        referencePriceEvidenceId: "public_coinlore_reference_price",
        paperPortfolio: { equityUsd: 100_000, currentBtc: 0.01, dailyPaperOrders: 1 },
        limits: {
          maxEvidenceAgeMinutes: 60,
          minFeatureCoverage: 0.5,
          minCandidateProbability: 0.58,
          maxOrderNotionalUsd: 1_000,
          maxPositionPctEquity: 0.02,
          maxDailyPaperOrders: 12,
        },
      },
    },
    sourceStatus,
    inputSummary,
  };
}
