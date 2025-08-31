class AnomalyDetector:
    def score(self, volatility):
        level = 'NORMAL'
        if volatility > 0.7:
            level = 'HIGH'
        elif volatility > 0.4:
            level = 'ELEVATED'
        return {
            'volatility': round(volatility, 3),
            'level': level
        }
