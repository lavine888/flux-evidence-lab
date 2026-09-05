(() => {
  'use strict';

  const FEATURE_ORDER = [
    'network_activity_z',
    'exchange_netflow_z',
    'realized_cap_growth_z',
    'developer_activity_z',
    'social_sentiment_z',
    'price_momentum_z',
    'macro_liquidity_z',
    'regulatory_risk_z'
  ];

  const FEATURE_LABELS = {
    network_activity_z: '网络活跃度',
    exchange_netflow_z: '交易所净流量',
    realized_cap_growth_z: '已实现市值增长',
    developer_activity_z: '开发活跃度',
    social_sentiment_z: '市场情绪',
    price_momentum_z: '价格动量',
    macro_liquidity_z: '宏观流动性',
    regulatory_risk_z: '监管风险'
  };

  const RISK_LABELS = {
    PAPER_ONLY_MODE: '仅允许 Paper 模式',
    EVIDENCE_FRESHNESS: '证据新鲜度',
    NO_FUTURE_EVIDENCE: '禁止未来数据',
    FEATURE_COVERAGE: '模型特征覆盖率',
    SOURCE_HEALTH: '公开来源完整性',
    REFERENCE_PRICE_BOUND: '参考价格证据绑定',
    MODEL_CONFIDENCE: '模型候选置信度',
    ORDER_NOTIONAL_LIMIT: '模拟订单名义金额',
    PAPER_POSITION_LIMIT: 'Paper 仓位上限',
    PAPER_SELL_INVENTORY: 'Paper 卖出库存',
    DAILY_PAPER_ORDER_LIMIT: '每日模拟订单上限'
  };

  const VERIFICATION_LABELS = {
    schema: 'Schema',
    hash_chain: '哈希链',
    decision_binding: '决策绑定',
    evidence_integrity: '证据完整性',
    deterministic_replay: '确定性重放',
    paper_only_policy: 'Paper-only',
    ed25519_signature: 'Ed25519'
  };

  const FALLBACK_SCENARIOS = [
    {
      id: 'public-btc-live',
      label: '真实公开数据（免 Key）',
      description: 'CoinLore、Coin Metrics、Alternative.me 与 GitHub 公开数据；每个来源保留独立 as-of。',
      source: 'publicLive'
    },
    {
      id: 'local-8790',
      label: '本地 8790 多源研究',
      description: '本地只读 BTC 多源研究快照，经确定性公开特征映射进入同一决策链。',
      source: 'local8790'
    },
    {
      id: 'offline-constructive',
      label: '离线建设性',
      description: '仓库固定合成证据，用于可复现模型、风控、签名与验签演示。'
    },
    {
      id: 'stale-evidence',
      label: '证据过期阻断',
      description: '建设性候选信号配合过期证据，由 EVIDENCE_FRESHNESS 确定性否决。'
    },
    {
      id: 'risk-limit',
      label: '超限阻断',
      description: '建设性候选信号配合超限 Paper 名义金额，由 ORDER_NOTIONAL_LIMIT 否决。'
    }
  ];

  const state = {
    scenarios: FALLBACK_SCENARIOS,
    report: null,
    envelope: null,
    verification: null,
    modelCard: null,
    busy: false,
    operation: null,
    toastTimer: null
  };

  const $ = (id) => document.getElementById(id);

  function getPath(value, path) {
    return path.split('.').reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      return current[key];
    }, value);
  }

  function pick(value, paths, fallback = undefined) {
    for (const path of paths) {
      const candidate = getPath(value, path);
      if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
    }
    return fallback;
  }

  function firstArray(value, paths) {
    for (const path of paths) {
      const candidate = getPath(value, path);
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  function asFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function asText(value, fallback = '--') {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return asText(value);
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }

  function formatCompactNumber(value, digits = 4) {
    const number = asFiniteNumber(value);
    if (number === null) return asText(value);
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(number);
  }

  function formatUsd(value) {
    const number = asFiniteNumber(value);
    if (number === null) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    }).format(number);
  }

  function probabilityPercent(value) {
    const number = asFiniteNumber(value);
    if (number === null) return null;
    return Math.max(0, Math.min(100, Math.abs(number) <= 1 ? number * 100 : number));
  }

  function formatPercent(value, digits = 2) {
    const number = asFiniteNumber(value);
    if (number === null) return '--';
    return `${number > 0 ? '+' : ''}${number.toFixed(digits)}%`;
  }

  function ageMinutes(asOf, observedAt) {
    const end = Date.parse(asOf);
    const start = Date.parse(observedAt);
    if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
    return Math.max(0, (end - start) / 60000);
  }

  function formatAge(minutes) {
    const value = asFiniteNumber(minutes);
    if (value === null) return '年龄未知';
    if (value < 1) return '< 1 分钟';
    if (value < 60) return `${Math.round(value)} 分钟`;
    if (value < 1440) return `${(value / 60).toFixed(1)} 小时`;
    return `${(value / 1440).toFixed(1)} 天`;
  }

  function toneFromStatus(value) {
    const status = String(value || '').toLowerCase();
    if (/(fail|failed|invalid|reject|rejected|block|blocked|deny|denied|error|expired|stale|tamper)/.test(status)) return 'fail';
    if (/(warn|partial|degraded|fallback|pending|aging|unknown|no_action|not_created)/.test(status)) return 'warn';
    if (/(pass|passed|ok|valid|verified|approved|allow|allowed|fresh|healthy|complete|recorded|signed|simulated)/.test(status)) return 'pass';
    return 'neutral';
  }

  function statusLabel(value) {
    const raw = String(value || '').trim();
    const labels = {
      ok: '正常',
      healthy: '健康',
      fresh: '新鲜',
      aging: '时效下降',
      unknown: '时效未知',
      pass: '通过',
      valid: '有效',
      verified: '已验证',
      stale: '已过期',
      expired: '已过期',
      block: '已阻断',
      blocked: '已阻断',
      error: '错误',
      partial: '部分可用',
      degraded: '降级',
      pending: '待检查',
      no_action: '无动作',
      not_created: '未创建',
      simulated_accepted: '模拟已接受'
    };
    return labels[raw.toLowerCase()] || raw || '已记录';
  }

  function setPill(element, label, tone) {
    element.textContent = label;
    element.className = `status-pill ${tone || 'neutral'}`;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeHttpUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const parsed = new URL(value);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function showToast(message, isError = false) {
    const toast = $('toast');
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.className = `toast${isError ? ' is-error' : ''}`;
    toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3000);
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 15000);
    try {
      const response = await fetch(path, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : await response.text();
      if (!response.ok) {
        const message = typeof payload === 'object' && payload ? payload.error || payload.message : payload;
        throw new Error(message || `请求失败（HTTP ${response.status}）`);
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('请求超时，请检查本地服务状态');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function setRuntimeStatus(status, message) {
    const container = $('runtimeStatus');
    container.className = `runtime-status${status === 'ready' ? ' is-ready' : status === 'error' ? ' is-error' : ''}`;
    $('runtimeStatusText').textContent = message;
  }

  function getStep(report, stage) {
    const steps = Array.isArray(report?.steps) ? report.steps : [];
    return steps.find((step) => String(step?.stage || '').toLowerCase() === stage);
  }

  function evidencePayload(report) {
    return getStep(report, 'evidence')?.payload || {};
  }

  function modelPayload(report) {
    return getStep(report, 'model')?.payload || {};
  }

  function riskPayload(report) {
    return getStep(report, 'risk')?.payload || {};
  }

  function orderPayload(report) {
    return getStep(report, 'order')?.payload || {};
  }

  function normalizeScenario(raw, index) {
    if (typeof raw === 'string') {
      return FALLBACK_SCENARIOS.find((item) => item.id === raw) || {
        id: raw,
        label: raw,
        description: '仓库内置可复现场景。'
      };
    }
    const id = pick(raw, ['id', 'scenarioId', 'scenario_id'], `scenario-${index + 1}`);
    const fallback = FALLBACK_SCENARIOS.find((item) => item.id === id);
    return {
      id,
      label: pick(raw, ['label', 'name', 'title'], fallback?.label || id),
      description: pick(raw, ['description', 'summary'], fallback?.description || '仓库内置可复现场景。'),
      source: pick(raw, ['source'], fallback?.source),
      sourceType: pick(raw, ['source_type', 'sourceType'])
    };
  }

  function renderScenarioOptions() {
    const select = $('scenarioSelect');
    const selected = select.value || 'public-btc-live';
    select.replaceChildren();
    for (const scenario of state.scenarios) {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = scenario.label;
      select.appendChild(option);
    }
    select.value = state.scenarios.some((item) => item.id === selected) ? selected : state.scenarios[0]?.id || '';
    updateScenarioDescription();
  }

  function updateScenarioDescription() {
    const scenario = state.scenarios.find((item) => item.id === $('scenarioSelect').value);
    $('scenarioDescription').textContent = scenario?.description || '仓库内置可复现场景。';
  }

  function normalizeSources(envelope, items) {
    let sources = firstArray(envelope, ['source_status', 'sourceStatus']);
    if (!sources.length) {
      const byKey = new Map();
      for (const item of items) {
        const source = item?.source || {};
        const key = source.url || source.name;
        if (!key || byKey.has(key)) continue;
        byKey.set(key, {
          id: key,
          name: source.name,
          category: source.type,
          status: 'recorded',
          freshness: 'recorded',
          url: source.url,
          asOf: item.observed_at,
          observedAt: item.observed_at
        });
      }
      sources = [...byKey.values()];
    }
    return sources.map((source, index) => {
      const statusTone = toneFromStatus(source?.status);
      const freshnessTone = toneFromStatus(source?.freshness);
      const tone = statusTone === 'fail' || freshnessTone === 'fail'
        ? 'fail'
        : statusTone === 'warn' || freshnessTone === 'warn'
          ? 'warn'
          : statusTone === 'pass' || freshnessTone === 'pass'
            ? 'pass'
            : 'neutral';
      return {
        id: pick(source, ['id'], `source-${index + 1}`),
        name: pick(source, ['name'], `来源 ${index + 1}`),
        category: pick(source, ['category', 'type', 'tier'], 'evidence'),
        status: pick(source, ['status'], 'recorded'),
        freshness: pick(source, ['freshness'], 'recorded'),
        url: safeHttpUrl(pick(source, ['url'])),
        retrievedAt: pick(source, ['retrievedAt', 'retrieved_at']),
        asOf: pick(source, ['asOf', 'as_of', 'observedAt', 'observed_at']),
        error: pick(source, ['error', 'message']),
        tone
      };
    });
  }

  function matchSource(item, sources) {
    const url = safeHttpUrl(item?.source?.url);
    const name = String(item?.source?.name || '').toLowerCase();
    return sources.find((source) => (url && source.url === url) || (name && source.name.toLowerCase() === name)) || null;
  }

  function sourceTransform(metric, normalized, unit) {
    const value = asFiniteNumber(normalized);
    const isNormalizedPublic = /normalized_(public|demo)_feature/i.test(String(unit || ''));
    if (value === null) return { raw: null, rawUnit: unit, expression: '--', reconstructed: false };
    if (!isNormalizedPublic) {
      return {
        raw: value,
        rawUnit: unit === 'z_score' ? 'z-score' : unit,
        expression: 'x → x（恒等映射）',
        reconstructed: false
      };
    }
    const transforms = {
      network_activity_z: {
        raw: value * 5,
        rawUnit: '% / 7d',
        expression: '活跃地址 7d 变化 ÷ 5'
      },
      price_momentum_z: {
        raw: value * 5,
        rawUnit: '% / 7d',
        expression: 'BTC 7d 涨跌幅 ÷ 5'
      },
      social_sentiment_z: {
        raw: value * 20 + 50,
        rawUnit: 'index / 100',
        expression: '(恐惧贪婪指数 − 50) ÷ 20'
      },
      developer_activity_z: {
        raw: 14 - value * 7,
        rawUnit: 'days since push',
        expression: '(14 − 距最近推送天数) ÷ 7'
      }
    };
    return transforms[metric]
      ? { ...transforms[metric], reconstructed: true }
      : { raw: value, rawUnit: unit, expression: '公开特征归一化值', reconstructed: false };
  }

  function rawValueText(raw, unit) {
    if (raw === null) return '--';
    if (String(unit).includes('%')) return `${formatCompactNumber(raw, 3)}%`;
    if (String(unit).includes('days')) return `${formatCompactNumber(raw, 2)} 天`;
    if (String(unit).includes('index')) return formatCompactNumber(raw, 2);
    return formatCompactNumber(raw, 6);
  }

  function setCellLabel(cell, label) {
    cell.dataset.label = label;
    return cell;
  }

  function renderSourceHealth(sources) {
    const container = $('sourceHealthList');
    container.replaceChildren();
    if (!sources.length) {
      container.appendChild(element('span', 'empty-inline', '报告未返回来源状态'));
      return;
    }
    for (const source of sources) {
      const item = element('span', `source-health-item ${source.tone}`);
      const freshness = statusLabel(source.freshness);
      item.textContent = `${source.name} · ${statusLabel(source.status)}${freshness === statusLabel(source.status) ? '' : ` / ${freshness}`}`;
      item.title = source.error || `${source.category} · ${formatDateTime(source.asOf)}`;
      container.appendChild(item);
    }
  }

  function renderEvidence(report, envelope) {
    const payload = evidencePayload(report);
    const items = Array.isArray(payload.evidence_items) ? payload.evidence_items : [];
    const sources = normalizeSources(envelope, items);
    const model = modelPayload(report);
    const featureVector = model.feature_vector || {};
    const tbody = $('evidenceTableBody');
    tbody.replaceChildren();

    if (!items.length) {
      const row = element('tr', 'empty-row');
      const cell = element('td', '', '报告未返回 evidence_items');
      cell.colSpan = 6;
      row.appendChild(cell);
      tbody.appendChild(row);
    } else {
      for (const item of items) {
        const metric = asText(item.metric);
        const source = matchSource(item, sources);
        const transform = sourceTransform(metric, item.value, item.unit);
        const modelInput = asFiniteNumber(featureVector[metric]);
        const row = document.createElement('tr');

        const evidenceCell = setCellLabel(document.createElement('td'), 'Evidence / 指标');
        evidenceCell.append(
          element('span', 'evidence-name', FEATURE_LABELS[metric] || metric),
          element('span', 'evidence-id mono', asText(item.evidence_id)),
          element('span', 'source-classification', asText(item.classification))
        );

        const rawCell = setCellLabel(document.createElement('td'), '原始值');
        rawCell.append(
          element('span', 'evidence-value-main', rawValueText(transform.raw, transform.rawUnit)),
          element('span', 'evidence-value-sub', asText(transform.rawUnit))
        );

        const transformCell = setCellLabel(document.createElement('td'), '确定性变换');
        transformCell.append(
          element('code', 'transform-expression', transform.expression),
          element('span', 'transform-note', transform.reconstructed ? '由签名标准化值可逆重建' : 'artifact 原值')
        );

        const normalizedCell = setCellLabel(document.createElement('td'), '标准化值');
        normalizedCell.append(
          element('span', 'evidence-value-main', formatCompactNumber(item.value, 6)),
          element('span', 'evidence-value-sub', modelInput === null ? asText(item.unit) : `模型输入 ${formatCompactNumber(modelInput, 6)}`)
        );

        const sourceCell = setCellLabel(document.createElement('td'), '来源');
        const sourceUrl = safeHttpUrl(item?.source?.url);
        if (sourceUrl) {
          const link = element('a', 'source-link', asText(item?.source?.name));
          link.href = sourceUrl;
          link.target = '_blank';
          link.rel = 'noreferrer';
          sourceCell.appendChild(link);
        } else {
          sourceCell.appendChild(element('span', 'evidence-name', asText(item?.source?.name)));
        }
        sourceCell.appendChild(element('span', 'source-classification', `${asText(item?.source?.type)} · ${source ? statusLabel(source.freshness) : '已绑定'}`));

        const signedObservedAt = item.observed_at;
        const dataAsOf = source?.asOf || signedObservedAt;
        const age = ageMinutes(report.as_of, dataAsOf);
        const asOfCell = setCellLabel(document.createElement('td'), 'As-of');
        asOfCell.append(
          element('span', 'asof-main', formatDateTime(dataAsOf)),
          element('span', 'asof-age', `${formatAge(age)} · 签名观测 ${formatDateTime(signedObservedAt)}`)
        );

        row.append(evidenceCell, rawCell, transformCell, normalizedCell, sourceCell, asOfCell);
        tbody.appendChild(row);
      }
    }

    const missing = Array.isArray(model.missing_features) ? model.missing_features : [];
    const featureCount = FEATURE_ORDER.length - missing.length;
    const usableSources = sources.filter((source) => source.tone !== 'fail').length;
    const publicCount = asFiniteNumber(payload?.evidence_summary?.public_item_count) || 0;

    $('evidenceCount').textContent = String(items.length);
    $('sourceCount').textContent = `${usableSources} / ${sources.length}`;
    $('dataHealthSummary').textContent = sources.length ? `${usableSources}/${sources.length} 可用` : '--';
    $('coverageSummary').textContent = `${featureCount} / ${FEATURE_ORDER.length} 个模型特征 · ${publicCount} Public`;
    $('coverageEvidence').textContent = `${items.length} 条`;
    $('coverageFeatures').textContent = `${featureCount} / ${FEATURE_ORDER.length}`;
    $('coverageSources').textContent = `${usableSources} / ${sources.length}`;
    $('coverageAge').textContent = formatAge(payload?.evidence_summary?.max_age_minutes);
    renderSourceHealth(sources);

    return { items, sources, featureCount, usableSources };
  }

  function classProbabilities(model) {
    const probabilities = model.class_probabilities || {};
    return ['BUY', 'HOLD', 'SELL'].map((label) => ({
      label,
      value: probabilityPercent(probabilities[label])
    }));
  }

  function renderClassProbabilities(model) {
    const container = $('classProbabilities');
    container.replaceChildren();
    for (const entry of classProbabilities(model)) {
      const row = document.createElement('div');
      const label = element('span', '', entry.label);
      const value = element('b', '', entry.value === null ? '--' : `${entry.value.toFixed(1)}%`);
      const track = document.createElement('i');
      const bar = document.createElement('em');
      bar.style.width = `${entry.value || 0}%`;
      track.appendChild(bar);
      row.append(label, value, track);
      container.appendChild(row);
    }
  }

  function renderFactors(model) {
    const candidate = asText(model.candidate_action, 'HOLD');
    const probabilities = model.class_probabilities || {};
    const contributionClass = candidate === 'HOLD'
      ? (Number(probabilities.BUY || 0) >= Number(probabilities.SELL || 0) ? 'BUY' : 'SELL')
      : candidate;
    const contributions = model.feature_contributions?.[contributionClass] || {};
    const featureVector = model.feature_vector || {};
    const missing = new Set(Array.isArray(model.missing_features) ? model.missing_features : []);
    const factors = FEATURE_ORDER.map((name) => ({
      name,
      input: asFiniteNumber(featureVector[name]) || 0,
      contribution: asFiniteNumber(contributions[name]) || 0,
      missing: missing.has(name)
    }));
    const maxAbsolute = Math.max(...factors.map((factor) => Math.abs(factor.contribution)), 0.000001);
    $('factorContext').textContent = candidate === 'HOLD'
      ? `${contributionClass} 方向的 logit 因子贡献 · HOLD 类系数为 0`
      : `${contributionClass} 候选动作的 logit 因子贡献`;
    const list = $('factorList');
    list.replaceChildren();
    for (const factor of factors) {
      const row = element('div', `factor-row${factor.missing ? ' is-missing' : ''}`);
      const name = element('span', 'factor-name', FEATURE_LABELS[factor.name] || factor.name);
      name.title = `${factor.name}${factor.missing ? ' · 缺失，按 0' : ''}`;
      const input = element('span', 'factor-input', factor.missing ? '缺失 → 0' : `x ${formatCompactNumber(factor.input, 4)}`);
      const track = element('span', 'factor-bar-track');
      const bar = element('i', `factor-bar${factor.contribution < 0 ? ' negative' : ''}`);
      bar.style.width = `${Math.min(50, Math.abs(factor.contribution) / maxAbsolute * 50)}%`;
      track.appendChild(bar);
      const value = element('span', `factor-value ${factor.contribution < 0 ? 'negative' : 'positive'}`, `${factor.contribution > 0 ? '+' : ''}${formatCompactNumber(factor.contribution, 5)}`);
      row.append(name, input, track, value);
      list.appendChild(row);
    }
  }

  function renderModel(report) {
    const model = modelPayload(report);
    const risk = riskPayload(report);
    const candidate = asText(model.candidate_action, '--');
    const probability = probabilityPercent(model.candidate_probability);
    const threshold = probabilityPercent(risk?.normalized_context?.limits?.min_candidate_probability);
    const missing = Array.isArray(model.missing_features) ? model.missing_features : [];
    const uncertainty = probability === null ? null : Math.max(0, 100 - probability);

    $('candidateAction').textContent = candidate;
    $('candidateAction').className = candidate === 'BUY' ? 'is-positive' : candidate === 'SELL' ? 'is-negative' : 'is-caution';
    $('modelProbability').textContent = probability === null ? '--' : `${probability.toFixed(1)}%`;
    $('probabilityBar').style.width = `${probability || 0}%`;
    $('thresholdMarker').style.left = `${threshold === null ? 50 : threshold}%`;
    $('thresholdLabel').textContent = threshold === null ? '风控阈值 --' : `风控阈值 ${threshold.toFixed(1)}%`;
    $('modelVersion').textContent = `模型 ${asText(model.model_version || report?.model?.model_version)}`;
    $('missingFeatures').textContent = `缺失 ${missing.length} / ${FEATURE_ORDER.length}`;
    $('modelUncertainty').textContent = uncertainty === null ? '未校准不确定性 --' : `未校准不确定性 ${uncertainty.toFixed(1)}%`;
    $('performanceClaim').textContent = `绩效声明：${asText(model.performance_claim || report?.model?.performance_claim, 'NONE')}`;
    $('uncertaintyStatement').textContent = uncertainty === null
      ? '概率未做生产级校准，不代表收益概率。'
      : `1 − 候选概率 = ${uncertainty.toFixed(1)}%；这是类别剩余概率，不是已测误差率。`;
    $('missingFeatureBoundary').textContent = missing.length
      ? `缺失 ${missing.length} 个特征按 0 处理：${missing.map((name) => FEATURE_LABELS[name] || name).join('、')}。`
      : '本次 8 个模型特征均有输入；仍不代表模型已生产校准。';

    renderClassProbabilities(model);
    renderFactors(model);
  }

  function riskValueText(rule) {
    const id = rule.rule_id;
    const observed = rule.observed;
    const limit = rule.limit;
    if (id === 'MODEL_CONFIDENCE' || id === 'PAPER_POSITION_LIMIT') {
      const observedPct = probabilityPercent(observed);
      const limitPct = probabilityPercent(limit);
      return `${observedPct === null ? asText(observed) : `${observedPct.toFixed(1)}%`} / ${limitPct === null ? asText(limit) : `${limitPct.toFixed(1)}%`}`;
    }
    if (id === 'ORDER_NOTIONAL_LIMIT') return `${formatUsd(observed)} / ${formatUsd(limit)}`;
    if (id === 'PAPER_SELL_INVENTORY') return `${formatUsd(observed)} / ${typeof limit === 'number' ? formatUsd(limit) : asText(limit)}`;
    if (id === 'EVIDENCE_FRESHNESS' && observed && typeof observed === 'object') {
      const items = Array.isArray(observed.items) ? observed.items : [];
      const staleCount = asFiniteNumber(observed.stale_item_count) || 0;
      const oldest = items.reduce((current, item) => {
        const age = asFiniteNumber(item?.age_minutes);
        return age !== null && (!current || age > current.age) ? { age, limit: item.limit_minutes } : current;
      }, null);
      const oldestText = oldest ? ` · 最旧 ${formatAge(oldest.age)} / 阈值 ${formatAge(oldest.limit)}` : '';
      return `${items.length - staleCount}/${items.length} 逐指标通过${oldestText}`;
    }
    if (id === 'FEATURE_COVERAGE' && observed && typeof observed === 'object') {
      const coverage = probabilityPercent(observed.coverage);
      const threshold = probabilityPercent(limit);
      return `${asText(observed.supplied_feature_count)}/${asText(observed.expected_feature_count)} · ${coverage?.toFixed(1) || '--'}% / 最低 ${threshold?.toFixed(1) || '--'}%`;
    }
    if (id === 'SOURCE_HEALTH') {
      return `${observed === 'HEALTHY' ? '健康' : asText(observed)} / 要求${limit === 'HEALTHY' ? '健康' : asText(limit)}`;
    }
    if (id === 'REFERENCE_PRICE_BOUND' && observed && typeof observed === 'object') {
      const matched = observed.context_evidence_id && observed.reference_item_count === 1;
      return `${formatUsd(observed.evidence_price_usd)} · ${matched ? 'Evidence ID 已绑定' : '绑定不完整'}`;
    }
    if (id === 'EVIDENCE_FRESHNESS') return `${formatAge(observed)} / ${formatAge(limit)}`;
    return `${asText(observed)} / ${asText(limit)}`;
  }

  function renderAuditMetrics(envelope) {
    const metrics = envelope?.audit_metrics || envelope?.auditMetrics || {};
    const totalMs = asFiniteNumber(metrics.total_ms ?? metrics.totalMs);
    const artifactBytes = asFiniteNumber(metrics.artifact_bytes ?? metrics.artifactBytes);
    $('auditLatency').textContent = totalMs === null ? '--' : `${formatCompactNumber(totalMs, 1)} ms`;
    $('auditSize').textContent = artifactBytes === null ? '--' : `${formatCompactNumber(artifactBytes / 1024, 1)} KB`;
  }

  function renderRisk(report) {
    const risk = riskPayload(report);
    const rules = Array.isArray(risk.rules) ? risk.rules : [];
    const status = asText(risk.status || report?.outcome?.risk_status, 'pending');
    const tone = status === 'BLOCK' ? 'fail' : status === 'PASS' ? 'pass' : 'warn';
    setPill($('riskSummary'), statusLabel(status), tone);

    const list = $('riskList');
    list.replaceChildren();
    if (!rules.length) {
      list.appendChild(element('li', 'empty-state', '报告未返回风控规则'));
      return;
    }
    for (const rule of rules) {
      const passed = rule.passed === true;
      const item = document.createElement('li');
      const mark = element('span', `risk-check-mark ${passed ? 'pass' : 'fail'}`, passed ? '✓' : '×');
      mark.setAttribute('aria-label', passed ? '通过' : '失败');
      const copy = element('div', 'risk-check-copy');
      copy.append(
        element('strong', '', RISK_LABELS[rule.rule_id] || asText(rule.rule_id)),
        element('span', '', passed ? '通过' : '触发确定性否决')
      );
      item.append(mark, copy, element('span', 'risk-check-value', riskValueText(rule)));
      list.appendChild(item);
    }
  }

  function renderOutcome(report) {
    const outcome = report?.outcome || {};
    const finalAction = asText(outcome.final_action, '--');
    const candidate = asText(outcome.candidate_action, '--');
    const blocked = outcome.risk_vetoed === true || String(outcome.risk_status).toUpperCase() === 'BLOCK';
    const held = finalAction === 'HOLD';
    $('decisionVerdict').textContent = finalAction;
    $('decisionVerdict').className = blocked ? 'is-negative' : held ? 'is-caution' : finalAction === '--' ? '' : 'is-positive';
    $('decisionReason').textContent = blocked
      ? `候选 ${candidate} 被确定性风控否决`
      : held
        ? `候选 ${candidate} · 未创建模拟订单`
        : `候选 ${candidate} · Paper 模拟决策`;
    $('orderStatus').textContent = statusLabel(outcome.order_status);
  }

  function renderMarket(envelope) {
    const summary = envelope?.input_summary || envelope?.inputSummary || {};
    const price = asFiniteNumber(pick(summary, ['market_price_usd', 'marketPriceUsd', 'price_usd', 'priceUsd']));
    const change24h = asFiniteNumber(pick(summary, ['market_change_24h_pct', 'marketChange24hPct', 'price_change_24h_pct']));
    const change7d = asFiniteNumber(pick(summary, ['market_change_7d_pct', 'marketChange7dPct', 'price_change_7d_pct']));
    $('btcPrice').textContent = price === null ? '--' : formatUsd(price);
    if (price === null) {
      $('marketChange').textContent = '此场景未返回公开即时报价';
      $('marketChange').className = '';
      return;
    }
    $('marketChange').textContent = `24h ${formatPercent(change24h)} · 7d ${formatPercent(change7d)}`;
    $('marketChange').className = change24h === null ? '' : change24h < 0 ? 'is-negative' : change24h > 0 ? 'is-positive' : '';
  }

  function verificationIsValid(verification) {
    const value = pick(verification, ['ok', 'valid', 'verified'], null);
    return typeof value === 'boolean' ? value : null;
  }

  function renderVerificationChecks(verification) {
    const container = $('verificationChecks');
    container.replaceChildren();
    const checks = verification?.checks;
    if (!checks || typeof checks !== 'object') {
      container.appendChild(element('span', 'empty-inline', '尚未执行完整性检查'));
      return;
    }
    for (const [key, value] of Object.entries(checks)) {
      container.appendChild(element('span', `verification-check ${value === true ? 'pass' : 'fail'}`, `${VERIFICATION_LABELS[key] || key} · ${value === true ? '通过' : '失败'}`));
    }
  }

  function renderSignature(report, verification) {
    const signature = report?.signature || {};
    const manifest = signature.manifest || {};
    $('signatureAlgorithm').textContent = asText(signature.algorithm, 'Ed25519');
    $('signatureTime').textContent = formatDateTime(manifest.signed_at);
    $('artifactHash').textContent = asText(manifest.artifact_hash);
    $('chainHead').textContent = asText(manifest.chain_head);
    $('signatureKeyId').textContent = asText(signature.key_fingerprint);
    $('signaturePublicKey').textContent = asText(signature.public_key_pem);
    $('signatureValue').textContent = asText(signature.signature_base64);

    const valid = verificationIsValid(verification);
    const checks = verification?.checks && typeof verification.checks === 'object' ? Object.values(verification.checks) : [];
    const passed = checks.filter((value) => value === true).length;
    if (valid === true) {
      setPill($('signatureStatus'), '验证通过', 'pass');
      $('verificationSummary').textContent = '有效';
      $('verificationSummary').className = 'is-positive';
      $('verificationSubline').textContent = `${passed}/${checks.length} 项检查通过`;
    } else if (valid === false) {
      setPill($('signatureStatus'), '验证失败', 'fail');
      $('verificationSummary').textContent = '无效';
      $('verificationSummary').className = 'is-negative';
      const firstError = Array.isArray(verification?.errors) ? verification.errors[0] : null;
      $('verificationSubline').textContent = asText(firstError?.code || firstError?.message, '完整性检查失败');
    } else {
      setPill($('signatureStatus'), '未验证', 'neutral');
      $('verificationSummary').textContent = '--';
      $('verificationSummary').className = '';
      $('verificationSubline').textContent = Object.keys(signature).length ? '签名已生成，等待验证' : '尚未生成签名';
    }
    renderVerificationChecks(verification);
  }

  function hashStepSummary(step) {
    if (step.stage === 'evidence') return `${step.payload?.evidence_summary?.item_count || 0} 条证据`;
    if (step.stage === 'model') return `${asText(step.payload?.candidate_action)} · ${(probabilityPercent(step.payload?.candidate_probability) || 0).toFixed(1)}%`;
    if (step.stage === 'risk') return asText(step.payload?.status);
    if (step.stage === 'order') return asText(step.payload?.status);
    return '已绑定';
  }

  function renderHashChain(report) {
    const steps = Array.isArray(report?.steps) ? report.steps : [];
    $('hashCount').textContent = `${steps.length} 步`;
    const list = $('hashChain');
    list.replaceChildren();
    if (!steps.length) {
      list.appendChild(element('li', 'empty-state', '报告未返回哈希链'));
      return;
    }
    for (const [index, step] of steps.entries()) {
      const item = element('li', 'hash-step');
      item.appendChild(element('span', 'hash-index', String(index + 1).padStart(2, '0')));
      const header = document.createElement('header');
      header.append(
        element('strong', '', asText(step.stage, `step-${index + 1}`)),
        element('small', '', `${hashStepSummary(step)} · ${index === 0 ? '链起点' : '绑定前序哈希'}`)
      );
      const hash = element('code', 'hash-value', asText(step.hash));
      hash.title = `${asText(step.hash)}\nprevious: ${asText(step.previous_hash)}`;
      item.append(header, hash);
      list.appendChild(item);
    }
  }

  function setPipelineNode(id, tone, detail) {
    const node = $(id);
    node.className = tone || '';
    const status = node.querySelector('i');
    if (status) status.textContent = detail;
  }

  function renderPipeline(report, envelope, coverage) {
    const model = modelPayload(report);
    const risk = riskPayload(report);
    const signature = report?.signature || {};
    const valid = verificationIsValid(state.verification);
    const mapping = asText(pick(envelope, ['input_summary.feature_mapping'], 'SIGNED_EVIDENCE_VALUES'));
    const sourceTone = coverage.sources.some((source) => source.tone === 'fail') ? 'warn' : 'pass';
    const riskTone = risk.status === 'BLOCK' ? 'fail' : risk.status === 'NO_ACTION' ? 'warn' : 'pass';
    setPipelineNode('pipelineCollect', sourceTone, `${coverage.items.length} evidence · ${coverage.usableSources}/${coverage.sources.length} source`);
    setPipelineNode('pipelineNormalize', 'pass', `${coverage.featureCount}/${FEATURE_ORDER.length} features · ${mapping.replace('DETERMINISTIC_', '')}`);
    setPipelineNode('pipelineModel', 'pass', `${asText(model.candidate_action)} · ${(probabilityPercent(model.candidate_probability) || 0).toFixed(1)}%`);
    setPipelineNode('pipelineRisk', riskTone, `${asText(risk.status)} · ${risk.failed_rule_ids?.length || 0} failed`);
    setPipelineNode('pipelineSign', signature.algorithm === 'Ed25519' ? 'pass' : 'fail', `${asText(signature.algorithm)} · ${asText(signature.key_scope)}`);
    setPipelineNode('pipelineVerify', valid === true ? 'pass' : valid === false ? 'fail' : 'warn', valid === true ? '7 checks passed' : valid === false ? 'verification failed' : 'pending');
    $('pipelineSummary').textContent = valid === true ? '六阶段已绑定并验证' : '已生成，完整性待确认';
  }

  function renderHeaderFacts(report) {
    const classification = asText(report.data_classification);
    $('assetSummary').textContent = `${asText(report.asset, 'BTC')} · ${classification === 'PUBLIC_DEMO' ? 'Public' : classification === 'SYNTHETIC_DEMO' ? 'Synthetic' : 'Mixed'}`;
    $('classificationSummary').textContent = `${classification} · ${asText(report.safety?.execution_capability, 'PAPER_SIMULATION_ONLY')}`;
    $('decisionId').textContent = asText(report.decision_id);
    $('decisionId').title = asText(report.decision_id);
    $('researchId').textContent = asText(report.research_id);
    $('researchId').title = asText(report.research_id);
    $('artifactAsOf').textContent = formatDateTime(report.as_of);
    $('copyDecisionButton').disabled = !report.decision_id;
  }

  function resetTamperResult() {
    const result = $('tamperResult');
    result.className = 'tamper-result neutral';
    result.textContent = '篡改副本尚未测试，原始 artifact 保持不变。';
  }

  function renderReport(envelope) {
    const report = envelope?.artifact || envelope?.report || envelope?.result || envelope;
    if (!report || typeof report !== 'object') throw new Error('服务未返回结构化 artifact');
    state.envelope = envelope;
    state.report = report;
    state.verification = envelope?.verification || report?.verification || null;

    renderHeaderFacts(report);
    renderOutcome(report);
    renderMarket(envelope);
    const coverage = renderEvidence(report, envelope);
    renderModel(report);
    renderRisk(report);
    renderHashChain(report);
    renderSignature(report, state.verification);
    renderPipeline(report, envelope, coverage);
    renderAuditMetrics(envelope);
    resetTamperResult();

    const signedAt = report.signature?.manifest?.signed_at;
    const metrics = envelope?.audit_metrics || {};
    const totalMs = asFiniteNumber(metrics.total_ms);
    const artifactBytes = asFiniteNumber(metrics.artifact_bytes);
    const runtimeSummary = totalMs === null || artifactBytes === null
      ? ''
      : ` · ${formatCompactNumber(totalMs, 1)} ms · ${formatCompactNumber(artifactBytes / 1024, 1)} KB`;
    $('reportTimestamp').textContent = `数据 as-of ${formatDateTime(report.as_of)} · 签名 ${formatDateTime(signedAt)}${runtimeSummary}`;
    $('rawReport').textContent = JSON.stringify(envelope, null, 2);
    syncControls();
  }

  function renderModelCard(payload) {
    const card = payload?.model_card || payload?.modelCard || payload?.model || payload || {};
    state.modelCard = card;
    const claim = pick(card, ['performance_claim', 'performanceClaim'], 'NONE');
    $('performanceClaim').textContent = `绩效声明：${asText(claim)}`;
  }

  function syncControls() {
    const hasReport = Boolean(state.report);
    const busy = state.busy;
    $('runButton').disabled = busy;
    $('scenarioSelect').disabled = busy;
    $('copyDecisionButton').disabled = busy || !state.report?.decision_id;
    $('verifyButton').disabled = busy || !hasReport;
    $('tamperButton').disabled = busy || !hasReport;
    $('toggleRawButton').disabled = busy || !hasReport;
    $('downloadButton').disabled = busy || !hasReport;
    $('runButton').lastChild.textContent = busy && state.operation === 'run' ? ' 正在运行' : ' 运行决策';
    $('verifyButton').textContent = busy && state.operation === 'verify' ? '正在验证' : '验证原件';
    $('tamperButton').textContent = busy && state.operation === 'tamper' ? '正在测试' : '篡改副本测试';
  }

  function setBusy(busy, operation = null) {
    state.busy = busy;
    state.operation = busy ? operation : null;
    syncControls();
  }

  async function runSelectedScenario() {
    if (state.busy) return;
    const selected = state.scenarios.find((item) => item.id === $('scenarioSelect').value) || { id: $('scenarioSelect').value };
    setBusy(true, 'run');
    try {
      const payload = await api('/api/run', {
        method: 'POST',
        body: JSON.stringify({ scenario: selected.id, ...(selected.source ? { source: selected.source } : {}) }),
        timeoutMs: selected.source ? 30000 : 15000
      });
      renderReport(payload);
      showToast(`决策 ${asText(state.report?.decision_id, '')} 已生成并完成服务端验签`);
    } catch (error) {
      showToast(error.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCurrentReport() {
    if (state.busy || !state.report) return;
    const report = state.report;
    const envelope = state.envelope;
    setBusy(true, 'verify');
    try {
      const payload = await api('/api/verify', {
        method: 'POST',
        body: JSON.stringify({ artifact: report })
      });
      if (state.report !== report) return;
      state.verification = payload?.verification || payload;
      renderSignature(report, state.verification);
      const evidence = renderEvidence(report, envelope);
      renderPipeline(report, envelope, evidence);
      const valid = verificationIsValid(state.verification);
      showToast(valid ? '原始 artifact 离线验证通过' : '原始 artifact 验证失败', valid === false);
    } catch (error) {
      showToast(error.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function verifyTamperedCopy() {
    if (state.busy || !state.report) return;
    const report = state.report;
    const result = $('tamperResult');
    setBusy(true, 'tamper');
    result.className = 'tamper-result neutral';
    result.textContent = '正在验证仅存在于内存中的篡改副本…';
    try {
      const tampered = typeof structuredClone === 'function'
        ? structuredClone(report)
        : JSON.parse(JSON.stringify(report));
      tampered.safety = { ...(tampered.safety || {}), external_order_route: 'TAMPERED_ENABLED' };
      const payload = await api('/api/verify', {
        method: 'POST',
        body: JSON.stringify({ artifact: tampered })
      });
      if (state.report !== report) return;
      const verification = payload?.verification || payload;
      const rejected = verificationIsValid(verification) === false;
      const errorCodes = Array.isArray(verification?.errors)
        ? verification.errors.map((error) => error?.code).filter(Boolean)
        : [];
      result.className = `tamper-result ${rejected ? 'pass' : 'fail'}`;
      result.textContent = rejected
        ? `篡改已检出：${errorCodes.slice(0, 3).join(' · ') || '完整性检查拒绝'}。原始 artifact 未修改。`
        : '警告：篡改副本意外通过验证。原始 artifact 未修改。';
      showToast(rejected ? '篡改副本已被验证器拒绝' : '篡改检测未生效', !rejected);
    } catch (error) {
      result.className = 'tamper-result fail';
      result.textContent = `篡改测试请求失败：${error.message || String(error)}`;
      showToast(error.message || String(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function copyDecisionId() {
    const value = state.report?.decision_id;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      showToast('decision_id 已复制');
    } catch {
      showToast('浏览器未允许访问剪贴板', true);
    }
  }

  function toggleRawReport() {
    const raw = $('rawReport');
    raw.hidden = !raw.hidden;
    $('toggleRawButton').textContent = raw.hidden ? '查看 JSON' : '收起 JSON';
  }

  function downloadReport() {
    if (!state.envelope) return;
    const decisionId = state.report?.decision_id || 'decision-report';
    const blob = new Blob([`${JSON.stringify(state.envelope, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${String(decisionId).replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function initialize() {
    $('scenarioSelect').addEventListener('change', updateScenarioDescription);
    $('runButton').addEventListener('click', runSelectedScenario);
    $('verifyButton').addEventListener('click', verifyCurrentReport);
    $('tamperButton').addEventListener('click', verifyTamperedCopy);
    $('copyDecisionButton').addEventListener('click', copyDecisionId);
    $('toggleRawButton').addEventListener('click', toggleRawReport);
    $('downloadButton').addEventListener('click', downloadReport);

    const [healthResult, scenariosResult, modelCardResult] = await Promise.allSettled([
      api('/api/health', { timeoutMs: 5000 }),
      api('/api/scenarios', { timeoutMs: 5000 }),
      api('/api/model-card', { timeoutMs: 5000 })
    ]);

    if (healthResult.status === 'fulfilled' && healthResult.value?.ok !== false) {
      setRuntimeStatus('ready', `核心就绪 · ${asText(healthResult.value.mode, 'PAPER_ONLY')}`);
    } else {
      const message = healthResult.status === 'rejected' ? healthResult.reason.message : healthResult.value?.error;
      setRuntimeStatus('error', message || '核心服务不可用');
    }

    if (scenariosResult.status === 'fulfilled') {
      const received = Array.isArray(scenariosResult.value) ? scenariosResult.value : scenariosResult.value?.scenarios;
      if (Array.isArray(received) && received.length) state.scenarios = received.map(normalizeScenario);
    }
    renderScenarioOptions();

    if (modelCardResult.status === 'fulfilled') renderModelCard(modelCardResult.value);
    else renderModelCard({});
  }

  initialize().catch((error) => {
    setRuntimeStatus('error', '控制台初始化失败');
    showToast(error.message || String(error), true);
  });
})();
