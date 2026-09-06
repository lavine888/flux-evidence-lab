(async function bootstrap() {
  'use strict';

  // Keep the captured Node server compatible with Vercel's CommonJS build
  // while retaining dynamic imports for the project's ESM runtime modules.
  const { createServer } = require('node:http');
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');

  const SCRIPT_DIR = typeof __dirname === 'string'
    ? __dirname
    : path.dirname(path.resolve(process.argv[1] || '.'));
  const PUBLIC_DIR = path.join(SCRIPT_DIR, 'public');
  const PORT = parsePort(process.env.FLUX_AGENT_PORT || process.env.PORT, 8810);
  const HOST = process.env.HOST || '127.0.0.1';
  const JSON_BODY_LIMIT = 1_000_000;
  const LOCAL_RESEARCH_RESPONSE_LIMIT = 2_000_000;
  const REPORT_LIMIT = 128;
  const reports = new Map();

  const SCENARIOS = Object.freeze([
    {
      id: 'offline-constructive',
      label: '离线建设性',
      description: '固定公开/合成证据快照；模型产生候选信号，确定性风控决定 Paper 结果。',
      fixture: 'positive-buy'
    },
    {
      id: 'stale-evidence',
      label: '证据过期阻断',
      description: '建设性信号配合过期证据，验证 EVIDENCE_FRESHNESS 的最终否决。',
      fixture: 'stale-veto'
    },
    {
      id: 'risk-limit',
      label: '超限阻断',
      description: '建设性信号配合超限 Paper 名义金额，验证 ORDER_NOTIONAL_LIMIT。',
      fixture: 'positive-buy'
    },
    {
      id: 'public-btc-live',
      label: '真实公开数据（免 Key）',
      description: '直接读取 CoinLore、Coin Metrics、Alternative.me 与 GitHub 的 BTC 公开数据；行情按请求抓取，日线与开发指标保留各自时间戳。',
      source: 'publicLive'
    },
    {
      id: 'local-8790',
      label: '本地 8790 多源研究',
      description: '只读读取本机 BTC 多源研究快照；因来源变换不可由本项目独立重放，仅作为 review-only 输入。',
      source: 'local8790'
    }
  ]);

  const MIME_TYPES = Object.freeze({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  });

  let runtimePromise;
  let runtimeSigner;

  function parsePort(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new RangeError('FLUX_AGENT_PORT/PORT must be an integer between 1 and 65535');
    }
    return parsed;
  }

  function loadRuntime() {
    if (!runtimePromise) {
      runtimePromise = Promise.all([
        import(pathToFileURL(path.join(SCRIPT_DIR, 'src', 'core', 'index.mjs')).href),
        import(pathToFileURL(path.join(SCRIPT_DIR, 'fixtures', 'scenarios.mjs')).href),
        import(pathToFileURL(path.join(SCRIPT_DIR, 'src', 'adapters', 'public-btc.mjs')).href)
      ]).then(([core, fixtures, publicBtc]) => {
        for (const name of ['runBtcDecision', 'verifyDecisionArtifact', 'createRuntimeSigner']) {
          if (typeof core[name] !== 'function') throw new Error(`Core export ${name} is unavailable`);
        }
        if (typeof fixtures.getDemoScenario !== 'function') {
          throw new Error('Fixture export getDemoScenario is unavailable');
        }
        if (typeof publicBtc.fetchPublicBtcScenario !== 'function') {
          throw new Error('Public BTC adapter is unavailable');
        }
        runtimeSigner = runtimeSigner || core.createRuntimeSigner();
        return { core, fixtures, publicBtc };
      });
    }
    return runtimePromise;
  }

  function setSecurityHeaders(response, api = false) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'"
    );
    if (api) response.setHeader('Cache-Control', 'no-store');
  }

  function sendJson(response, statusCode, payload, extraHeaders = {}) {
    const body = `${JSON.stringify(payload)}\n`;
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Length', Buffer.byteLength(body));
    for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
    setSecurityHeaders(response, true);
    response.end(body);
  }

  function sendMethodNotAllowed(response, allowed) {
    sendJson(response, 405, { ok: false, error: 'Method not allowed' }, { Allow: allowed.join(', ') });
  }

  async function readJsonBody(request) {
    const mediaType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      const error = new Error('Content-Type must be application/json');
      error.statusCode = 415;
      throw error;
    }
    const declaredLength = Number(request.headers['content-length'] || 0);
    if (declaredLength > JSON_BODY_LIMIT) {
      const error = new Error('JSON request body exceeds 1 MB');
      error.statusCode = 413;
      throw error;
    }

    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > JSON_BODY_LIMIT) {
        const error = new Error('JSON request body exceeds 1 MB');
        error.statusCode = 413;
        throw error;
      }
      chunks.push(chunk);
    }
    if (!chunks.length) {
      const error = new Error('A JSON object request body is required');
      error.statusCode = 400;
      throw error;
    }

    let value;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      const error = new Error('Malformed JSON request body');
      error.statusCode = 400;
      throw error;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      const error = new Error('A single JSON object is required');
      error.statusCode = 400;
      throw error;
    }
    return value;
  }

  function rememberReport(artifact) {
    reports.delete(artifact.decision_id);
    reports.set(artifact.decision_id, artifact);
    while (reports.size > REPORT_LIMIT) {
      reports.delete(reports.keys().next().value);
    }
  }

  function elapsedMilliseconds(startedAt) {
    return Number(((process.hrtime.bigint() - startedAt) / 1_000n)) / 1_000;
  }

  function clamp(value, min = -3, max = 3) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validIso(value, fallback) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return fallback;
  }

  function safePublicUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const parsed = new URL(value);
      return new Set(['http:', 'https:']).has(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function findResearchEvidence(snapshot, dimension) {
    return Array.isArray(snapshot.evidence)
      ? snapshot.evidence.find((item) => item && item.dimension === dimension)
      : null;
  }

  function publicFeature({ snapshot, asOf, metric, value, dimension, fallbackName, fallbackUrl }) {
    const sourceEvidence = findResearchEvidence(snapshot, dimension) || {};
    const source = sourceEvidence.source || {};
    const observedAt = validIso(sourceEvidence.observedAt || sourceEvidence.asOf, asOf);
    return {
      evidenceId: `local8790_${metric}`,
      metric,
      value: Number(clamp(value).toFixed(6)),
      unit: 'normalized_demo_feature',
      observedAt: Date.parse(observedAt) > Date.parse(asOf) ? asOf : observedAt,
      classification: 'PUBLIC_DEMO',
      source: {
        name: String(source.name || fallbackName),
        type: 'PUBLIC',
        url: safePublicUrl(source.url) || fallbackUrl
      }
    };
  }

  function researchToScenario(snapshot) {
    if (!snapshot || snapshot.ok !== true || String(snapshot.asset?.symbol || '').toUpperCase() !== 'BTC') {
      const error = new Error('Local 8790 did not return a usable BTC research snapshot');
      error.statusCode = 502;
      throw error;
    }
    const asOf = validIso(snapshot.generatedAt, new Date().toISOString());
    const evidence = [];

    const networkChange = finite(snapshot.network?.activeAddresses7dChangePct);
    if (networkChange !== null) {
      evidence.push(publicFeature({
        snapshot,
        asOf,
        metric: 'network_activity_z',
        value: networkChange / 5,
        dimension: 'network',
        fallbackName: 'Coin Metrics Community',
        fallbackUrl: 'https://coinmetrics.io/community-network-data/'
      }));
    }

    const daysSinceCommit = finite(snapshot.development?.daysSinceCommit);
    if (daysSinceCommit !== null) {
      evidence.push(publicFeature({
        snapshot,
        asOf,
        metric: 'developer_activity_z',
        value: (14 - daysSinceCommit) / 7,
        dimension: 'developer',
        fallbackName: 'GitHub',
        fallbackUrl: 'https://github.com/bitcoin/bitcoin'
      }));
    }

    const fearGreed = finite(snapshot.sentiment?.fearGreedValue);
    if (fearGreed !== null) {
      evidence.push(publicFeature({
        snapshot,
        asOf,
        metric: 'social_sentiment_z',
        value: (fearGreed - 50) / 20,
        dimension: 'context',
        fallbackName: 'Alternative.me',
        fallbackUrl: 'https://alternative.me/crypto/fear-and-greed-index/'
      }));
    }

    const momentum = finite(snapshot.market?.priceChange7dPct);
    if (momentum !== null) {
      evidence.push(publicFeature({
        snapshot,
        asOf,
        metric: 'price_momentum_z',
        value: momentum / 5,
        dimension: 'market',
        fallbackName: 'CoinLore',
        fallbackUrl: 'https://www.coinlore.com/cryptocurrency-data-api'
      }));
    }

    if (!evidence.length) {
      const error = new Error('Local 8790 snapshot lacks supported numeric features');
      error.statusCode = 422;
      throw error;
    }

    const referencePriceUsd = finite(snapshot.market?.priceUsd);
    return {
      scenarioId: 'local-8790',
      asset: 'BTC',
      asOf,
      dataClassification: 'PUBLIC_DEMO',
      evidence,
      riskContext: {
        requestedExecutionMode: 'LOCAL_REVIEW_ONLY',
        requestedNotionalUsd: 500,
        referencePriceUsd: referencePriceUsd && referencePriceUsd > 0 ? referencePriceUsd : 60_000,
        paperPortfolio: {
          equityUsd: 100_000,
          currentBtc: 0.02,
          dailyPaperOrders: 1
        },
        limits: {
          maxEvidenceAgeMinutes: 1_440,
          minCandidateProbability: 0.58,
          maxOrderNotionalUsd: 1_000,
          maxPositionPctEquity: 0.02,
          maxDailyPaperOrders: 12
        }
      }
    };
  }

  async function fetchLocalResearch() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('http://localhost:8790/api/research?asset=bitcoin', {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > LOCAL_RESEARCH_RESPONSE_LIMIT) {
        const error = new Error('Local 8790 response exceeds the 2 MB safety limit');
        error.statusCode = 502;
        throw error;
      }
      const responseText = await response.text();
      if (Buffer.byteLength(responseText) > LOCAL_RESEARCH_RESPONSE_LIMIT) {
        const error = new Error('Local 8790 response exceeds the 2 MB safety limit');
        error.statusCode = 502;
        throw error;
      }
      let payload = null;
      try { payload = JSON.parse(responseText); } catch {}
      if (!response.ok) {
        const error = new Error(payload?.error || `Local 8790 returned HTTP ${response.status}`);
        error.statusCode = 502;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Local 8790 research request timed out');
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      if (!error.statusCode) {
        error.message = `Local 8790 research service is unavailable: ${error.message}`;
        error.statusCode = 502;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function prepareScenario(runtime, requestedScenario, source) {
    const selection = SCENARIOS.find((item) => item.id === requestedScenario);
    if (!selection) {
      const error = new Error(`Unknown scenario: ${requestedScenario}`);
      error.statusCode = 400;
      throw error;
    }

    const useLocal = selection.source === 'local8790' || source === 'local8790';
    const usePublicLive = selection.source === 'publicLive' || source === 'publicLive';
    if (source && !new Set(['local8790', 'publicLive']).has(source)) {
      const error = new Error('source must be local8790 or publicLive when provided');
      error.statusCode = 400;
      throw error;
    }
    if (usePublicLive) return runtime.publicBtc.fetchPublicBtcScenario();
    if (useLocal) {
      const snapshot = await fetchLocalResearch();
      return {
        scenario: researchToScenario(snapshot),
        sourceStatus: Array.isArray(snapshot.sourceHealth) ? snapshot.sourceHealth : [],
        inputSummary: {
          source: 'local8790',
          research_status: snapshot.status,
          research_generated_at: snapshot.generatedAt,
          feature_mapping: 'DETERMINISTIC_PUBLIC_DEMO_NORMALIZATION'
        }
      };
    }

    const scenario = runtime.fixtures.getDemoScenario(selection.fixture);
    scenario.scenarioId = selection.id;
    if (selection.id === 'risk-limit') {
      const configuredLimit = Number(scenario.riskContext?.limits?.maxOrderNotionalUsd || 1_000);
      scenario.riskContext.requestedNotionalUsd = configuredLimit + 500;
      scenario.riskContext.paperPortfolio.currentBtc = 0;
    }
    return {
      scenario,
      sourceStatus: [],
      inputSummary: {
        source: 'repository_fixture',
        fixture: selection.fixture,
        data_classification: scenario.dataClassification
      }
    };
  }

  async function handleHealth(response) {
    try {
      const runtime = await loadRuntime();
      sendJson(response, 200, {
        ok: true,
        service: 'flux-verifiable-btc-agent',
        status: 'ready',
        mode: 'PAPER_ONLY',
        core: typeof runtime.core.runBtcDecision === 'function' ? 'loaded' : 'unavailable',
        verification: typeof runtime.core.verifyDecisionArtifact === 'function' ? 'available' : 'unavailable',
        reports_in_memory: reports.size
      });
    } catch (error) {
      sendJson(response, 503, { ok: false, status: 'unavailable', mode: 'PAPER_ONLY', error: error.message });
    }
  }

  async function handleModelCard(response) {
    const { core } = await loadRuntime();
    const model = core.BTC_MULTINOMIAL_LOGIT_V1 || {};
    sendJson(response, 200, {
      ok: true,
      model_card: {
        name: model.model_family,
        version: model.model_version,
        feature_order: model.feature_order,
        feature_bounds: model.feature_bounds,
        intended_use: model.model_card?.intended_use,
        output: Array.isArray(model.classes) ? `${model.classes.join(' / ')} candidate probability` : undefined,
        data_boundary: model.model_card?.data_scope,
        risk_boundary: 'Deterministic paper-only risk veto remains final',
        execution_mode: 'PAPER_ONLY',
        limitations: model.model_card?.limitations,
        performance_claim: model.model_card?.performance_claim
      }
    });
  }

  async function handleRun(request, response) {
    const requestStartedAt = process.hrtime.bigint();
    const body = await readJsonBody(request);
    if (typeof body.scenario !== 'string' || body.scenario.trim() === '') {
      const error = new Error('scenario must be a non-empty string');
      error.statusCode = 400;
      throw error;
    }
    const runtime = await loadRuntime();
    const collectionStartedAt = process.hrtime.bigint();
    const prepared = await prepareScenario(runtime, body.scenario.trim(), body.source);
    const collectionMs = elapsedMilliseconds(collectionStartedAt);
    const decisionStartedAt = process.hrtime.bigint();
    const artifact = runtime.core.runBtcDecision(prepared.scenario, { signer: runtimeSigner });
    const decisionPipelineMs = elapsedMilliseconds(decisionStartedAt);
    const verificationStartedAt = process.hrtime.bigint();
    const verification = runtime.core.verifyDecisionArtifact(artifact);
    const verificationMs = elapsedMilliseconds(verificationStartedAt);
    rememberReport(artifact);
    sendJson(response, 200, {
      ok: true,
      artifact,
      verification,
      source_status: prepared.sourceStatus,
      input_summary: prepared.inputSummary,
      audit_metrics: {
        measured_at: new Date().toISOString(),
        collection_ms: collectionMs,
        decision_pipeline_ms: decisionPipelineMs,
        verification_ms: verificationMs,
        total_ms: elapsedMilliseconds(requestStartedAt),
        artifact_bytes: Buffer.byteLength(JSON.stringify(artifact)),
        proof_scheme: 'SHA-256_HASH_CHAIN_AND_ED25519',
        integrity_scope: 'ARTIFACT_SIGNED_RUNTIME_METRICS_UNSIGNED'
      }
    });
  }

  async function handleVerify(request, response) {
    const body = await readJsonBody(request);
    const id = body.id || body.decision_id || body.decisionId;
    const artifact = body.artifact || (typeof id === 'string' ? reports.get(id) : null);
    if (!artifact) {
      const error = new Error(id ? `Decision report not found: ${id}` : 'artifact or report id is required');
      error.statusCode = id ? 404 : 400;
      throw error;
    }
    const { core } = await loadRuntime();
    const verification = core.verifyDecisionArtifact(artifact);
    sendJson(response, 200, {
      ok: verification.ok,
      decision_id: artifact.decision_id,
      verification
    });
  }

  async function serveStatic(request, response, pathname) {
    if (!new Set(['GET', 'HEAD']).has(request.method)) {
      sendMethodNotAllowed(response, ['GET', 'HEAD']);
      return;
    }
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      sendJson(response, 400, { ok: false, error: 'Malformed URL path' });
      return;
    }
    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, relativePath);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
      sendJson(response, 403, { ok: false, error: 'Forbidden path' });
      return;
    }

    let body;
    try {
      body = await fs.readFile(filePath);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
        sendJson(response, 404, { ok: false, error: 'Not found' });
        return;
      }
      throw error;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.setHeader('Content-Length', body.length);
    response.setHeader('Cache-Control', path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=300');
    setSecurityHeaders(response, false);
    response.end(request.method === 'HEAD' ? undefined : body);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const pathname = url.pathname;

      if (pathname === '/api/health') {
        if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET']);
        await handleHealth(response);
        return;
      }
      if (pathname === '/api/scenarios') {
        if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET']);
        await loadRuntime();
        sendJson(response, 200, {
          ok: true,
          scenarios: SCENARIOS.map(({ fixture, ...scenario }) => ({
            ...scenario,
            source_type: scenario.source === 'local8790'
              ? 'LOCAL_READ_ONLY'
              : scenario.source === 'publicLive'
                ? 'PUBLIC_HTTPS_READ_ONLY'
                : 'REPOSITORY_FIXTURE'
          }))
        });
        return;
      }
      if (pathname === '/api/model-card') {
        if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET']);
        await handleModelCard(response);
        return;
      }
      if (pathname === '/api/run') {
        if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST']);
        await handleRun(request, response);
        return;
      }
      if (pathname === '/api/verify') {
        if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST']);
        await handleVerify(request, response);
        return;
      }
      if (pathname.startsWith('/api/reports/')) {
        if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET']);
        const id = decodeURIComponent(pathname.slice('/api/reports/'.length));
        const artifact = reports.get(id);
        if (!artifact) {
          sendJson(response, 404, { ok: false, error: `Decision report not found: ${id}` });
          return;
        }
        sendJson(response, 200, { ok: true, artifact });
        return;
      }
      if (pathname.startsWith('/api/')) {
        sendJson(response, 404, { ok: false, error: 'API endpoint not found' });
        return;
      }
      await serveStatic(request, response, pathname);
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      const publicMessage = statusCode >= 500 && !error.statusCode ? 'Internal server error' : error.message;
      if (!response.headersSent) sendJson(response, statusCode, { ok: false, error: publicMessage });
      else response.destroy();
      if (statusCode >= 500) console.error(error);
    }
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Flux verifier could not start: port ${PORT} is already in use.`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });

  server.listen(PORT, HOST, () => {
    console.log(`Flux verifiable BTC agent: http://${HOST}:${PORT}`);
    console.log('Paper-only competition console; no live order route is present.');
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
