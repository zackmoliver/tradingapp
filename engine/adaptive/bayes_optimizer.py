class BayesianOptimizer:
    def __init__(self):
        self.space = {
            'threshold': (0.1, 0.9),
            'lookback': (10, 100)
        }
        self.best = {}

    def suggest(self):
        return {
            'threshold': round(sum(self.space['threshold']) / 2, 2),
            'lookback': int(sum(self.space['lookback']) / 2)
        }

    def update(self, params, metric):
        if not self.best or metric > self.best.get('metric', float('-inf')):
            self.best = {**params, 'metric': metric}
