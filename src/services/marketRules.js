// Existing WFL screening thresholds, not statistically calibrated warnings.
// Shared by the alert evaluator and the Phase 2 registry; values are unchanged.
export const MARKET_RULES = [
  ["fao", "fao", "FAO 食品价格指数", "FAO Food Price Index", 5, 10, "#s1"],
  ["worldBank", "brent", "布伦特原油", "Brent crude", 10, 20, "#s4"],
  ["worldBank", "urea", "尿素", "Urea", 10, 20, "#s4"],
  ["worldBank", "dap", "磷酸二铵 DAP", "DAP", 10, 20, "#s4"],
  ["worldBank", "tsp", "重过磷酸钙 TSP", "TSP", 10, 20, "#s4"],
  ["worldBank", "potash", "氯化钾", "Potassium chloride", 10, 20, "#s4"],
];
