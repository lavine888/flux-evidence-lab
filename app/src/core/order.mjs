import { canonicalHash } from "./canonical-json.mjs";

export function buildPaperOrderPayload(decisionId, riskPayload) {
  const approved = riskPayload.status === "PASS" && !riskPayload.vetoed;
  const proposal = riskPayload.proposed_paper_order;

  if (!approved || proposal === null) {
    return {
      execution_mode: "PAPER_SIMULATION_ONLY",
      external_route: "DISABLED",
      real_funds: false,
      status: "NOT_CREATED",
      reason: riskPayload.status === "NO_ACTION" ? "MODEL_HOLD" : "RISK_VETO",
      paper_order: null,
    };
  }

  const paperOrderId = `paper_${canonicalHash(
    { decision_id: decisionId, proposal },
    "flux-paper-order-id-v1",
  ).slice(0, 20)}`;
  return {
    execution_mode: "PAPER_SIMULATION_ONLY",
    external_route: "DISABLED",
    real_funds: false,
    status: "SIMULATED_ACCEPTED",
    reason: "RISK_APPROVED_PAPER_SIMULATION",
    paper_order: {
      paper_order_id: paperOrderId,
      decision_id: decisionId,
      symbol: proposal.symbol,
      side: proposal.side,
      order_type: "MARKET_SIMULATION",
      notional_usd: proposal.notional_usd,
      quantity_btc: proposal.quantity_btc,
      simulated_fill_price_usd: proposal.reference_price_usd,
      persistence: "LOCAL_DEMO_ONLY",
    },
  };
}
