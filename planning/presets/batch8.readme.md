# How to run Batch 8 (Adaptive Intelligence)


**Order & Independence**
- You can run Phase 1 alone for immediate value.
- Phase 2 and 3 can follow in any order, but Phase 3 benefits from Phase 2 features.


**Shared Inputs**
- Backtest artifacts: runs/*/summary.json (Batch 4) and structured logs.
- Indicator profiles (Batch 6) and strategy presets (Batch 5).


**Outputs**
- Versioned params and allocations under adaptive/output/.


**CI**
- Unit tests for each phase; deterministic fixtures; no live keys.


---


## planning/presets/batch8.phase1.optimizer.json
```json
{
"title": "Batch 8 — Phase 1: Bayesian Optimizer for Strategy Params",
"depends_on": [
"Batch 4 — Backtest Runner, Metrics & Diagnostics",
"Batch 5 — GUI Wiring: Position Builder, Payoff, Trade Finder, Presets"
],
"instructions": [
"Implement adaptive/optimizer/bayesian_optimizer.py with Gaussian Process and Expected Improvement acquisition.",
"Read historical performance from runs/**/summary.json; map (params -> objective) where objective defaults to Sharpe but can be configured.",
"Expose API: suggest_parameters(strategy_id) and update(new_result).",
"Write outputs to adaptive/output/params/<strategy_id>/<timestamp>.json with fields: strategy_id, parameters, confidence, generated_by, code_version, data_snapshot, valid_until.",
"Add unit tests with deterministic fixtures; include explainability logs: acquisition scores per candidate.",
"Safe‑mode: if insufficient data, return the current strategy preset unchanged with rationale."
],
"acceptance": [
"pytest green with fixed seeds.",
"Artifacts written with code_version and data_snapshot tags.",
"Explainability logs produced; safe‑mode path covered by tests."
]
}