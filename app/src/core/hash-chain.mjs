import { canonicalJson, sha256Hex } from "./canonical-json.mjs";

export const CHAIN_DOMAIN = "flux-decision-chain-v1";
export const GENESIS_HASH = "GENESIS";

export function buildChainStep({ sequence, stage, decisionId, previousHash, payload }) {
  const body = {
    sequence,
    stage,
    decision_id: decisionId,
    previous_hash: previousHash,
    payload,
  };
  const canonical = canonicalJson(body);
  return {
    ...body,
    canonical_json: canonical,
    hash: sha256Hex(`${CHAIN_DOMAIN}\n${canonical}`),
  };
}

export function buildDecisionChain(decisionId, stagePayloads) {
  let previousHash = GENESIS_HASH;
  return stagePayloads.map(({ stage, payload }, index) => {
    const step = buildChainStep({
      sequence: index + 1,
      stage,
      decisionId,
      previousHash,
      payload,
    });
    previousHash = step.hash;
    return step;
  });
}
