from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class MarketState:
    timestamp: str # MM/DD/YYYY HH:MM:SS
    volatility_regime: str # LOW/MEDIUM/HIGH
    trend_regime: str # BULL/BEAR/SIDEWAYS
    vix_level: float
    sector_strength: float


@dataclass
class OptimizedStrategyParameters:
    strategy_id: str
    parameters: Dict[str, float]
    confidence: float
    generated_by: str # e.g., "bayes_v1"
    code_version: str # git SHA
    data_snapshot: str # run_id or tag
    valid_until: str # MM/DD/YYYY


@dataclass
class StrategyAllocation:
    regime: MarketState
    strategy_weights: Dict[str, float] # {"BullPutSpread":0.65, ...}
    rationale: str # human‑readable explanation
    code_version: str
    data_snapshot: str