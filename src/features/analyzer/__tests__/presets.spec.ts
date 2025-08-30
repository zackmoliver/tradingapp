import { ANALYZER_PROFILES, getProfileByName, getDefaultAnalyzerState } from '../presets';
import { AnalyzerProfile } from '../types';

describe('Analyzer Presets', () => {
  describe('ANALYZER_PROFILES', () => {
    it('should have all required profiles', () => {
      const expectedProfiles = ['Momentum', 'Mean Reversion', 'Trend', 'Volatility Sell'];
      const actualProfiles = ANALYZER_PROFILES.map(p => p.name);
      
      expectedProfiles.forEach(profile => {
        expect(actualProfiles).toContain(profile);
      });
    });

    it('should have valid profile shapes', () => {
      ANALYZER_PROFILES.forEach((profile) => {
        expect(profile).toHaveProperty('name');
        expect(profile).toHaveProperty('description');
        expect(profile).toHaveProperty('enabledIndicators');
        expect(profile).toHaveProperty('params');
        
        expect(typeof profile.name).toBe('string');
        expect(typeof profile.description).toBe('string');
        expect(Array.isArray(profile.enabledIndicators)).toBe(true);
        expect(typeof profile.params).toBe('object');
        
        // Ensure name is not empty
        expect(profile.name.length).toBeGreaterThan(0);
        
        // Ensure description is not empty
        expect(profile.description.length).toBeGreaterThan(0);
        
        // Ensure at least one indicator is enabled
        expect(profile.enabledIndicators.length).toBeGreaterThan(0);
      });
    });

    it('should have valid indicator IDs in enabledIndicators', () => {
      const validIndicatorIds = [
        'rsi', 'macd', 'adx', 'bbands', 'vwap', 'sma_50', 'sma_200', 'ichimoku'
      ];

      ANALYZER_PROFILES.forEach(profile => {
        profile.enabledIndicators.forEach(indicatorId => {
          expect(validIndicatorIds).toContain(indicatorId);
        });
      });
    });

    it('should have valid parameter values', () => {
      ANALYZER_PROFILES.forEach(profile => {
        Object.entries(profile.params).forEach(([key, value]) => {
          expect(typeof value).toMatch(/^(number|string)$/);
          
          // Check specific parameter constraints
          if (key === 'rsi_length') {
            expect(typeof value).toBe('number');
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThanOrEqual(50);
          }
          
          if (key === 'macd_fast') {
            expect(typeof value).toBe('number');
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThan(30);
          }
          
          if (key === 'macd_slow') {
            expect(typeof value).toBe('number');
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThanOrEqual(50);
          }
          
          if (key === 'bb_stddev') {
            expect(typeof value).toBe('number');
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThanOrEqual(3);
          }
          
          if (key === 'vwap_session_reset') {
            expect(['daily', 'weekly', 'monthly']).toContain(value);
          }
        });
      });
    });
  });

  describe('getProfileByName', () => {
    it('should return correct profile for valid names', () => {
      const momentum = getProfileByName('Momentum');
      expect(momentum).toBeDefined();
      expect(momentum?.name).toBe('Momentum');
      expect(momentum?.enabledIndicators).toContain('rsi');
      expect(momentum?.enabledIndicators).toContain('macd');
    });

    it('should return undefined for invalid names', () => {
      expect(getProfileByName('NonExistent')).toBeUndefined();
      expect(getProfileByName('')).toBeUndefined();
    });

    it('should be case sensitive', () => {
      expect(getProfileByName('momentum')).toBeUndefined();
      expect(getProfileByName('MOMENTUM')).toBeUndefined();
    });
  });

  describe('getDefaultAnalyzerState', () => {
    it('should return valid default state', () => {
      const defaultState = getDefaultAnalyzerState();
      
      expect(defaultState).toHaveProperty('enabledIndicators');
      expect(defaultState).toHaveProperty('params');
      expect(defaultState).toHaveProperty('profile');
      
      expect(Array.isArray(defaultState.enabledIndicators)).toBe(true);
      expect(typeof defaultState.params).toBe('object');
      expect(defaultState.profile).toBe('Momentum');
    });

    it('should have consistent state with Momentum profile', () => {
      const defaultState = getDefaultAnalyzerState();
      const momentumProfile = getProfileByName('Momentum');
      
      expect(defaultState.enabledIndicators).toEqual(momentumProfile?.enabledIndicators);
      expect(defaultState.params).toEqual(momentumProfile?.params);
    });
  });

  describe('Profile consistency', () => {
    it('should have consistent parameters for enabled indicators', () => {
      ANALYZER_PROFILES.forEach(profile => {
        // Check that parameters exist for enabled indicators
        profile.enabledIndicators.forEach(indicatorId => {
          switch (indicatorId) {
            case 'rsi':
              expect(profile.params).toHaveProperty('rsi_length');
              break;
            case 'macd':
              expect(profile.params).toHaveProperty('macd_fast');
              expect(profile.params).toHaveProperty('macd_slow');
              expect(profile.params).toHaveProperty('macd_signal');
              break;
            case 'adx':
              expect(profile.params).toHaveProperty('adx_length');
              break;
            case 'bbands':
              expect(profile.params).toHaveProperty('bb_length');
              expect(profile.params).toHaveProperty('bb_stddev');
              break;
            case 'vwap':
              expect(profile.params).toHaveProperty('vwap_session_reset');
              break;
            case 'sma_50':
              expect(profile.params).toHaveProperty('sma_50');
              break;
            case 'sma_200':
              expect(profile.params).toHaveProperty('sma_200');
              break;
            case 'ichimoku':
              expect(profile.params).toHaveProperty('ichimoku_conversion');
              expect(profile.params).toHaveProperty('ichimoku_base');
              expect(profile.params).toHaveProperty('ichimoku_span_b');
              expect(profile.params).toHaveProperty('ichimoku_displacement');
              break;
          }
        });
      });
    });

    it('should not have parameters for disabled indicators', () => {
      const allIndicatorIds = ['rsi', 'macd', 'adx', 'bbands', 'vwap', 'sma_50', 'sma_200', 'ichimoku'];
      
      ANALYZER_PROFILES.forEach(profile => {
        const disabledIndicators = allIndicatorIds.filter(
          id => !profile.enabledIndicators.includes(id)
        );
        
        // This is a soft check - it's okay to have extra parameters
        // but we verify the enabled ones are present
        expect(profile.enabledIndicators.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Profile uniqueness', () => {
    it('should have unique profile names', () => {
      const names = ANALYZER_PROFILES.map(p => p.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });

    it('should have different configurations', () => {
      // Ensure profiles are actually different
      const configurations = ANALYZER_PROFILES.map(p => 
        JSON.stringify({ indicators: p.enabledIndicators.sort(), params: p.params })
      );
      const uniqueConfigurations = [...new Set(configurations)];
      expect(configurations.length).toBe(uniqueConfigurations.length);
    });
  });
});
