#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { getDemoScenario } from "../app/fixtures/scenarios.mjs";
import { runBtcDecision, verifyDecisionArtifact } from "../app/src/core/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROOT = path.join(ROOT, "app");
const EXAMPLES_ROOT = path.join(ROOT, "examples");
const REPETITIONS = 10;
const PUBLIC_ATTEMPTS = 3;
const PUBLIC_TIMEOUT_MS = 20_000;
const signedAt = new Date().toISOString();

function scenarioFor(name) {
  const scenario = getDemoScenario("positive-buy");
  if (name === "risk-limit") {
    scenario.scenarioId = "risk-limit";
    scenario.riskContext.requestedNotionalUsd =
      scenario.riskContext.limits.maxOrderNotionalUsd + 500;
    scenario.riskContext.paperPortfolio.currentBtc = 0;
  }
  return scenario;
}

function expectedFor(name) {
  return name === "risk-limit"
    ? {
        candidate_action: "BUY",
        final_action: "HOLD",
        risk_status: "BLOCK",
        order_status: "NOT_CREATED",
        failed_rule: "ORDER_NOTIONAL_LIMIT",
      }
    : {
        candidate_action: "BUY",
        final_action: "BUY",
        risk_status: "PASS",
        order_status: "SIMULATED_ACCEPTED",
      };
}

function assertOutcome(artifact, expected) {
  assert.equal(artifact.outcome.candidate_action, expected.candidate_action);
  assert.equal(artifact.outcome.final_action, expected.final_action);
  assert.equal(artifact.outcome.risk_status, expected.risk_status);
  assert.equal(artifact.outcome.order_status, expected.order_status);
  if (expected.failed_rule) {
    assert.ok(artifact.steps[2].payload.failed_rule_ids.includes(expected.failed_rule));
  }
}

function timings(values) {
  if (!values.length) return { avg_ms: null, max_ms: null };
  return {
    avg_ms: Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3),
    ),
    max_ms: Math.max(...values),
  };
}

function runBatch(name) {
  const expected = expectedFor(name);
  const values = [];
  const failures = [];
  for (let index = 0; index < REPETITIONS; index += 1) {
    const started = performance.now();
    try {
      const artifact = runBtcDecision(scenarioFor(name), { signedAt });
      assert.equal(verifyDecisionArtifact(artifact).ok, true);
      assertOutcome(artifact, expected);
      values.push(Number((performance.now() - started).toFixed(3)));
    } catch (error) {
      failures.push({ run: index + 1, reason: error.message || error.name });
    }
  }
  return {
    runs: REPETITIONS,
    success: REPETITIONS - failures.length,
    fail: failures.length,
    ...timings(values),
    human_intervention: "NONE",
    failure_reason: failures.length ? failures : null,
  };
}

function runTamperBatch() {
  const values = [];
  const failures = [];
  for (let index = 0; index < REPETITIONS; index += 1) {
    const started = performance.now();
    try {
      const artifact = runBtcDecision(scenarioFor("offline-constructive"), { signedAt });
      assert.equal(verifyDecisionArtifact(artifact).ok, true);
      const tampered = structuredClone(artifact);
      tampered.safety.external_order_route = "ENABLED";
      assert.equal(verifyDecisionArtifact(tampered).ok, false);
      values.push(Number((performance.now() - started).toFixed(3)));
    } catch (error) {
      failures.push({ run: index + 1, reason: error.message || error.name });
    }
  }
  return {
    runs: REPETITIONS,
    success: REPETITIONS - failures.length,
    fail: failures.length,
    ...timings(values),
    human_intervention: "NONE",
    failure_reason: failures.length ? failures : null,
  };
}

function artifactFor(name) {
  const artifact = runBtcDecision(scenarioFor(name), { signedAt });
  assertOutcome(artifact, expectedFor(name));
  assert.equal(verifyDecisionArtifact(artifact).ok, true);
  return artifact;
}

async function writeExamples() {
  await mkdir(EXAMPLES_ROOT, { recursive: true });
  const files = [];
  for (const name of ["offline-constructive", "risk-limit"]) {
    const filename = name + ".json";
    const text = JSON.stringify(artifactFor(name), null, 2) + "\n";
    await writeFile(path.join(EXAMPLES_ROOT, filename), text, "utf8");
    files.push({ file: "examples/" + filename, bytes: Buffer.byteLength(text) });
  }
  return { written: true, signed_at: signedAt, files };
}

async function verifyExamples() {
  const files = [];
  for (const filename of ["offline-constructive.json", "risk-limit.json"]) {
    const artifact = JSON.parse(
      await readFile(path.join(EXAMPLES_ROOT, filename), "utf8"),
    );
    assert.equal(verifyDecisionArtifact(artifact).ok, true);
    files.push({
      file: "examples/" + filename,
      decision_id: artifact.decision_id,
      verification: "PASS",
    });
  }
  return { ok: true, files };
}

async function requestJson(url, init = {}, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let payload = null;
    try {
      payload = await response.json();
    } catch {}
    return { status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
}

function postJson(baseUrl, pathname, payload, timeoutMs = 5_000) {
  return requestJson(
    baseUrl + pathname,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(baseUrl + "/api/health", {}, 1_000);
      if (result.status === 200 && result.payload?.ok === true) return true;
    } catch {}
    await delay(100);
  }
  return false;
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve(true);
      }
    };
    child.once("exit", finish);
    try {
      child.kill("SIGTERM");
    } catch {
      finish();
      return;
    }
    setTimeout(() => {
      if (!done) {
        try {
          child.kill();
        } catch {}
        finish();
      }
    }, 2_000);
  });
}

async function publicAttempt(baseUrl, attempt, timeoutMs) {
  const started = performance.now();
  try {
    const result = await postJson(
      baseUrl,
      "/api/run",
      { scenario: "public-btc-live" },
      timeoutMs,
    );
    const sources = Array.isArray(result.payload?.source_status)
      ? result.payload.source_status
      : [];
    const verified = result.status === 200 && result.payload?.verification?.ok === true;
    const classification =
      result.status === 200
        ? verified
          ? "OBSERVED"
          : "VERIFICATION_FAILED"
        : result.status === 502 || result.status === 504
          ? "EXTERNAL_DEPENDENCY_UNAVAILABLE"
          : "HTTP_ERROR";
    return {
      attempt,
      status: result.status,
      ok: verified,
      classification,
      source_count: sources.length || null,
      source_ok_count: sources.length
        ? sources.filter((source) => source.status === "ok").length
        : null,
      candidate_action: result.payload?.artifact?.outcome?.candidate_action ?? null,
      final_action: result.payload?.artifact?.outcome?.final_action ?? null,
      risk_status: result.payload?.artifact?.outcome?.risk_status ?? null,
      elapsed_ms: Number((performance.now() - started).toFixed(3)),
    };
  } catch (error) {
    return {
      attempt,
      status: null,
      ok: false,
      classification: "EXTERNAL_DEPENDENCY_UNAVAILABLE",
      error_code: error.name === "AbortError" ? "TIMEOUT" : "FETCH_ERROR",
      elapsed_ms: Number((performance.now() - started).toFixed(3)),
    };
  }
}

async function runHttpSmoke() {
  const port = 19_000 + (process.pid % 1_000);
  const baseUrl = "http://127.0.0.1:" + port;
  let child = null;
  let result;
  try {
    child = spawn(process.execPath, ["server.js"], {
      cwd: APP_ROOT,
      env: { ...process.env, FLUX_AGENT_PORT: String(port) },
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });
    if (!(await waitForServer(baseUrl))) throw new Error("LOCAL_SERVER_NOT_READY");
    const health = await requestJson(baseUrl + "/api/health");
    const catalog = await requestJson(baseUrl + "/api/scenarios");
    const page = await requestJson(baseUrl + "/");
    const constructive = await postJson(
      baseUrl,
      "/api/run",
      { scenario: "offline-constructive" },
    );
    const riskLimit = await postJson(baseUrl, "/api/run", { scenario: "risk-limit" });
    const tampered = structuredClone(constructive.payload?.artifact);
    if (tampered) tampered.safety.external_order_route = "ENABLED";
    const tamper = tampered
      ? await postJson(baseUrl, "/api/verify", { artifact: tampered })
      : { status: null, payload: null };
    const attempts = numberOr(process.env.FLUX_PUBLIC_ATTEMPTS, PUBLIC_ATTEMPTS);
    const timeoutMs = numberOr(process.env.FLUX_PUBLIC_TIMEOUT_MS, PUBLIC_TIMEOUT_MS);
    const publicResults = await Promise.all(
      Array.from({ length: attempts }, (_value, index) =>
        publicAttempt(baseUrl, index + 1, timeoutMs),
      ),
    );
    const publicUnexpected = publicResults.some(
      (item) =>
        item.classification === "HTTP_ERROR" ||
        item.classification === "VERIFICATION_FAILED",
    );
    const offlineOk =
      constructive.status === 200 &&
      constructive.payload?.verification?.ok === true &&
      constructive.payload?.artifact?.outcome?.final_action === "BUY" &&
      riskLimit.status === 200 &&
      riskLimit.payload?.verification?.ok === true &&
      riskLimit.payload?.artifact?.outcome?.risk_status === "BLOCK" &&
      riskLimit.payload?.artifact?.outcome?.final_action === "HOLD";
    result = {
      ok:
        health.status === 200 &&
        health.payload?.mode === "PAPER_ONLY" &&
        catalog.status === 200 &&
        Array.isArray(catalog.payload?.scenarios) &&
        page.status === 200 &&
        offlineOk &&
        tamper.status === 200 &&
        tamper.payload?.ok === false &&
        !publicUnexpected,
      health: { status: health.status, mode: health.payload?.mode ?? null },
      catalog: { status: catalog.status, count: catalog.payload?.scenarios?.length ?? null },
      static_console: { status: page.status },
      offline: {
        constructive_status: constructive.status,
        constructive_verification: constructive.payload?.verification?.ok === true,
        risk_limit_status: riskLimit.status,
        risk_limit_verification: riskLimit.payload?.verification?.ok === true,
        risk_limit_final_action: riskLimit.payload?.artifact?.outcome?.final_action ?? null,
      },
      tamper: { status: tamper.status, rejected: tamper.payload?.ok === false },
      public_live: {
        attempts: publicResults.length,
        observed: publicResults.filter((item) => item.classification === "OBSERVED").length,
        externally_unavailable: publicResults.filter(
          (item) => item.classification === "EXTERNAL_DEPENDENCY_UNAVAILABLE",
        ).length,
        results: publicResults,
      },
    };
  } catch (error) {
    result = {
      ok: false,
      port,
      failure_reason: error.message === "LOCAL_SERVER_NOT_READY"
        ? error.message
        : "HTTP_SMOKE_EXCEPTION",
      error_code: error.name,
    };
  } finally {
    result = result || { ok: false, port, failure_reason: "HTTP_SMOKE_EXCEPTION" };
    result.server_stopped = await stopChild(child);
  }
  return result;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  if (process.argv.includes("--verify-examples")) {
    console.log(JSON.stringify(await verifyExamples(), null, 2));
    return;
  }
  const constructive = runBatch("offline-constructive");
  const riskLimit = runBatch("risk-limit");
  const tamperDetection = runTamperBatch();
  const examples = await writeExamples();
  const exampleVerification = await verifyExamples();
  const http = await runHttpSmoke();
  const failures = [];
  if (constructive.fail || riskLimit.fail || tamperDetection.fail) {
    failures.push("OFFLINE_OR_TAMPER_BATCH");
  }
  if (!http.ok) failures.push("HTTP_SMOKE");
  console.log(
    JSON.stringify(
      {
        generated_at: signedAt,
        repetitions: REPETITIONS,
        offline: { constructive, risk_limit: riskLimit },
        tamper_detection: tamperDetection,
        examples,
        example_verification: exampleVerification,
        http,
        failures,
        public_live_is_external: true,
        raw_public_responses_persisted: false,
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, failure_reason: error.message || error.name }, null, 2),
  );
  process.exitCode = 1;
});
