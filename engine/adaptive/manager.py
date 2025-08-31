from .bayes_optimizer import BayesianOptimizer
from .anomaly_detection import AnomalyDetector
from .rl_allocator import RLAllocator
import random

class AdaptiveManager:
    def __init__(self):
        self.bayes = BayesianOptimizer()
        self.anomaly = AnomalyDetector()
        self.rl = RLAllocator()

    def self_test(self):
        suggestion = self.bayes.suggest()
        self.bayes.update(suggestion, metric=random.uniform(-1, 1))
        return {
            "ok": True,
            "bayesian": {
                "suggestion": suggestion,
                "best": self.bayes.best
            },
            "anomaly": self.anomaly.score(volatility=random.uniform(0, 1)),
            "allocation": self.rl.allocate(market_state=random.choice(['BULL', 'BEAR', 'SIDEWAYS']))
        }

    def optimize_cycle(self):
        suggestion = self.bayes.suggest()
        self.bayes.update(suggestion, metric=random.uniform(-1, 1))
        return {
            "ok": True,
            "suggested_params": suggestion,
            "best_params": self.bayes.best
        }
