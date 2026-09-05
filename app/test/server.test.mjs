import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, describe, test } from "node:test";

const port = 18_000 + (process.pid % 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;
let serverOutput = "";

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not become ready. Output: ${serverOutput}`);
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await response.json();
  return { response, payload };
}

async function postJson(pathname, payload) {
  return requestJson(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("local judge API", () => {
  before(async () => {
    serverProcess = spawn(process.execPath, ["server.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, FLUX_AGENT_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    serverProcess.stdout.on("data", (chunk) => { serverOutput += chunk; });
    serverProcess.stderr.on("data", (chunk) => { serverOutput += chunk; });
    await waitForServer();
  });

  after(async () => {
    if (!serverProcess || serverProcess.exitCode !== null) return;
    serverProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => serverProcess.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  });

  test("health and scenario catalog expose a paper-only local runtime", async () => {
    const health = await requestJson("/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.mode, "PAPER_ONLY");
    assert.equal(health.payload.verification, "available");

    const catalog = await requestJson("/api/scenarios");
    assert.equal(catalog.response.status, 200);
    assert.deepEqual(
      catalog.payload.scenarios.map((scenario) => scenario.id),
      ["offline-constructive", "stale-evidence", "risk-limit", "public-btc-live", "local-8790"],
    );
    assert.equal(
      catalog.payload.scenarios.find((scenario) => scenario.id === "public-btc-live").source_type,
      "PUBLIC_HTTPS_READ_ONLY",
    );
  });

  test("constructive and risk-limit paths return verified, decision-bound artifacts", async () => {
    const constructive = await postJson("/api/run", { scenario: "offline-constructive" });
    assert.equal(constructive.response.status, 200);
    assert.equal(constructive.payload.verification.ok, true);
    assert.equal(constructive.payload.artifact.outcome.candidate_action, "BUY");
    assert.equal(constructive.payload.artifact.outcome.risk_status, "PASS");
    assert.equal(
      constructive.payload.artifact.research_id,
      constructive.payload.artifact.steps[0].payload.research_id,
    );
    assert.equal(constructive.payload.audit_metrics.proof_scheme, "SHA-256_HASH_CHAIN_AND_ED25519");
    assert.equal(
      constructive.payload.audit_metrics.integrity_scope,
      "ARTIFACT_SIGNED_RUNTIME_METRICS_UNSIGNED",
    );
    assert.equal(Number.isFinite(constructive.payload.audit_metrics.total_ms), true);
    assert.equal(constructive.payload.audit_metrics.artifact_bytes > 0, true);

    const blocked = await postJson("/api/run", { scenario: "risk-limit" });
    assert.equal(blocked.response.status, 200);
    assert.equal(blocked.payload.artifact.outcome.risk_status, "BLOCK");
    assert.equal(blocked.payload.artifact.outcome.final_action, "HOLD");
    assert.equal(blocked.payload.artifact.outcome.order_status, "NOT_CREATED");
  });

  test("verification endpoint rejects a modified top-level safety claim", async () => {
    const run = await postJson("/api/run", { scenario: "offline-constructive" });
    const tampered = structuredClone(run.payload.artifact);
    tampered.safety.external_order_route = "ENABLED";
    const checked = await postJson("/api/verify", { artifact: tampered });
    assert.equal(checked.response.status, 200);
    assert.equal(checked.payload.ok, false);
    assert.equal(checked.payload.verification.checks.ed25519_signature, false);
  });

  test("API rejects unsupported media types and unknown scenarios", async () => {
    const media = await requestJson("/api/run", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ scenario: "offline-constructive" }),
    });
    assert.equal(media.response.status, 415);

    const unknown = await postJson("/api/run", { scenario: "not-a-scenario" });
    assert.equal(unknown.response.status, 400);
    assert.match(unknown.payload.error, /Unknown scenario/);
  });
});
