class RLAllocator:
    def allocate(self, market_state='BULL'):
        base = {
            'PMCC': 0.4,
            'Wheel': 0.3,
            'Bull Put Spread': 0.3
        }
        if market_state == 'BEAR':
            base['Bull Put Spread'] += 0.1
            base['PMCC'] -= 0.1
        elif market_state == 'SIDEWAYS':
            base['Wheel'] += 0.1
            base['PMCC'] -= 0.1
        return {
            'market_state': market_state,
            'allocations': base
        }
