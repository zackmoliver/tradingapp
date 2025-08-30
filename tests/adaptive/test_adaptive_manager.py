"""
Unit Tests for Adaptive Manager

This module contains comprehensive unit tests for the Adaptive Manager
including position sizing integration and risk management hooks.

All tests use deterministic fixtures and mocked components.
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

from adaptive.manager import AdaptiveManager, create_adaptive_position_sizer_hook
from adaptive.types import AdaptiveVersion, MarketState, MarketRegime

try:
    from adaptive.pattern.autoencoder import AutoencoderAnomalyDetector
    AUTOENCODER_AVAILABLE = True
except ImportError:
    AutoencoderAnomalyDetector = None
    AUTOENCODER_AVAILABLE = False


@pytest.mark.unit
@pytest.mark.adaptive
class TestAdaptiveManager:
    """Test suite for AdaptiveManager class"""
    
    @pytest.fixture
    def mock_anomaly_detector(self):
        """Create mock anomaly detector"""
        detector = Mock()
        detector.is_trained = True
        detector.detect.return_value = {
            'anomalies_detected': False,
            'num_anomalies': 0,
            'max_anomaly_score': 0.5,
            'anomaly_threshold': 1.0,
            'rationale': {'severity_assessment': 'none'}
        }
        return detector
    
    @pytest.fixture
    def sample_market_data(self, seeded_random):
        """Generate sample market data"""
        dates = pd.date_range(start='2024-01-01', periods=50, freq='D')
        
        return pd.DataFrame({
            'date': dates,
            'close': 450 + np.cumsum(seeded_random.normal(0, 1, 50)),
            'volume': seeded_random.normal(1000000, 100000, 50),
            'rsi': seeded_random.normal(50, 10, 50),
            'vix': seeded_random.normal(20, 3, 50)
        })
    
    def test_manager_initialization(self, test_version):
        """Test AdaptiveManager initialization"""
        manager = AdaptiveManager(
            version=test_version,
            position_sizing_reduction_factor=0.6,
            anomaly_cooldown_minutes=45
        )
        
        assert manager.version == test_version
        assert manager.position_sizing_reduction_factor == 0.6
        assert manager.anomaly_cooldown_minutes == 45
        assert not manager.current_anomaly_state['is_anomalous']
        assert manager.current_anomaly_state['anomaly_score'] == 0.0
        assert len(manager.position_sizing_hooks) == 0
        assert len(manager.manager_logs) == 0
    
    def test_register_position_sizing_hook(self, test_version):
        """Test registering position sizing hooks"""
        manager = AdaptiveManager(version=test_version)
        
        def test_hook(base_size: float, context: dict) -> float:
            return base_size * 0.8
        
        manager.register_position_sizing_hook(test_hook)
        
        assert len(manager.position_sizing_hooks) == 1
        assert manager.position_sizing_hooks[0] == test_hook
    
    def test_analyze_market_conditions_normal(self, test_version, mock_anomaly_detector, sample_market_data, sample_market_state):
        """Test market analysis with normal conditions"""
        manager = AdaptiveManager(
            version=test_version,
            anomaly_detector=mock_anomaly_detector
        )
        
        results = manager.analyze_market_conditions(sample_market_data, sample_market_state)
        
        assert 'timestamp' in results
        assert results['market_state_id'] == sample_market_state.state_id
        assert results['anomaly_detection']['anomalies_detected'] is False
        assert results['position_sizing_recommendation'] == 1.0
        assert results['risk_level'] == 'normal'
        assert len(results['recommendations']) == 0
        assert not results['current_anomaly_state']['is_anomalous']
        
        # Check that detector was called
        mock_anomaly_detector.detect.assert_called_once_with(sample_market_data, sample_market_state)
    
    def test_analyze_market_conditions_anomalous(self, test_version, mock_anomaly_detector, sample_market_data, sample_market_state):
        """Test market analysis with anomalous conditions"""
        # Configure mock to return anomalies
        mock_anomaly_detector.detect.return_value = {
            'anomalies_detected': True,
            'num_anomalies': 3,
            'max_anomaly_score': 2.5,
            'anomaly_threshold': 1.0,
            'rationale': {'severity_assessment': 'high'}
        }
        
        manager = AdaptiveManager(
            version=test_version,
            anomaly_detector=mock_anomaly_detector,
            position_sizing_reduction_factor=0.4
        )
        
        results = manager.analyze_market_conditions(sample_market_data, sample_market_state)
        
        assert results['anomaly_detection']['anomalies_detected'] is True
        assert results['position_sizing_recommendation'] == 0.4
        assert results['risk_level'] == 'elevated'
        assert len(results['recommendations']) == 1
        assert 'Reduce position sizes by 60%' in results['recommendations'][0]
        assert results['current_anomaly_state']['is_anomalous']
        assert results['current_anomaly_state']['anomaly_score'] == 2.5
        assert results['current_anomaly_state']['severity'] == 'high'
    
    def test_analyze_market_conditions_no_detector(self, test_version, sample_market_data, sample_market_state):
        """Test market analysis without anomaly detector"""
        manager = AdaptiveManager(version=test_version)
        
        results = manager.analyze_market_conditions(sample_market_data, sample_market_state)
        
        assert results['anomaly_detection']['status'] == 'unavailable'
        assert 'not available or not trained' in results['anomaly_detection']['reason']
        assert results['position_sizing_recommendation'] == 1.0
        assert results['risk_level'] == 'normal'
    
    def test_get_position_sizing_multiplier_normal(self, test_version):
        """Test position sizing multiplier under normal conditions"""
        manager = AdaptiveManager(version=test_version)
        
        multiplier = manager.get_position_sizing_multiplier()
        
        assert multiplier == 1.0
    
    def test_get_position_sizing_multiplier_anomalous(self, test_version):
        """Test position sizing multiplier under anomalous conditions"""
        manager = AdaptiveManager(
            version=test_version,
            position_sizing_reduction_factor=0.3
        )
        
        # Simulate anomaly state
        manager.current_anomaly_state = {
            'is_anomalous': True,
            'anomaly_score': 2.0,
            'detected_at': datetime.now(),
            'severity': 'high',
            'rationale': {}
        }
        
        multiplier = manager.get_position_sizing_multiplier()
        
        assert multiplier == 0.3
    
    def test_get_position_sizing_multiplier_with_hooks(self, test_version):
        """Test position sizing multiplier with registered hooks"""
        manager = AdaptiveManager(version=test_version)
        
        # Register hooks that modify the multiplier
        def hook1(base_multiplier: float, context: dict) -> float:
            return base_multiplier * 0.9
        
        def hook2(base_multiplier: float, context: dict) -> float:
            return base_multiplier * 0.8
        
        manager.register_position_sizing_hook(hook1)
        manager.register_position_sizing_hook(hook2)
        
        multiplier = manager.get_position_sizing_multiplier()
        
        # Should be 1.0 * 0.9 * 0.8 = 0.72
        assert abs(multiplier - 0.72) < 0.001
    
    def test_create_position_sizer_hook(self, test_version):
        """Test creating position sizer hook"""
        manager = AdaptiveManager(
            version=test_version,
            position_sizing_reduction_factor=0.5
        )
        
        # Simulate anomaly state
        manager.current_anomaly_state['is_anomalous'] = True
        
        hook = manager.create_position_sizer_hook()
        
        # Test hook function
        base_size = 100.0
        context = {'strategy': 'iron_condor'}
        
        adjusted_size = hook(base_size, context)
        
        assert adjusted_size == 50.0  # 100 * 0.5
    
    def test_anomaly_cooldown(self, test_version):
        """Test anomaly cooldown functionality"""
        manager = AdaptiveManager(
            version=test_version,
            anomaly_cooldown_minutes=1  # 1 minute for testing
        )
        
        # Set anomaly state with old timestamp
        old_time = datetime.now() - timedelta(minutes=2)
        manager.current_anomaly_state = {
            'is_anomalous': True,
            'anomaly_score': 2.0,
            'detected_at': old_time,
            'severity': 'high',
            'rationale': {}
        }
        
        # Check cooldown
        manager._check_anomaly_cooldown()
        
        # Should be reset due to cooldown
        assert not manager.current_anomaly_state['is_anomalous']
        assert manager.current_anomaly_state['anomaly_score'] == 0.0
        assert manager.current_anomaly_state['detected_at'] is None
    
    def test_logging_functionality(self, test_version, mock_anomaly_detector, sample_market_data, sample_market_state):
        """Test logging functionality"""
        manager = AdaptiveManager(
            version=test_version,
            anomaly_detector=mock_anomaly_detector
        )
        
        # Perform analysis to generate logs
        manager.analyze_market_conditions(sample_market_data, sample_market_state)
        
        logs = manager.get_manager_logs()
        assert len(logs) == 1
        
        log = logs[0]
        assert 'timestamp' in log
        assert 'analysis_results' in log
        assert 'manager_config' in log
        assert 'version' in log
        
        # Test log clearing
        manager.clear_manager_logs()
        assert len(manager.get_manager_logs()) == 0
    
    def test_get_status(self, test_version, mock_anomaly_detector):
        """Test status reporting"""
        manager = AdaptiveManager(
            version=test_version,
            anomaly_detector=mock_anomaly_detector
        )
        
        status = manager.get_status()
        
        assert 'version' in status
        assert status['anomaly_detector_available'] is True
        assert status['anomaly_detector_trained'] is True
        assert 'current_anomaly_state' in status
        assert status['position_sizing_hooks'] == 0
        assert 'torch_available' in status
    
    def test_reset_anomaly_state(self, test_version):
        """Test manual anomaly state reset"""
        manager = AdaptiveManager(version=test_version)
        
        # Set anomaly state
        manager.current_anomaly_state = {
            'is_anomalous': True,
            'anomaly_score': 3.0,
            'detected_at': datetime.now(),
            'severity': 'critical',
            'rationale': {'test': 'data'}
        }
        
        # Reset state
        manager.reset_anomaly_state()
        
        assert not manager.current_anomaly_state['is_anomalous']
        assert manager.current_anomaly_state['anomaly_score'] == 0.0
        assert manager.current_anomaly_state['detected_at'] is None
        assert manager.current_anomaly_state['severity'] == 'none'
        assert manager.current_anomaly_state['rationale'] == {}


@pytest.mark.unit
@pytest.mark.adaptive
class TestPositionSizerHookCreation:
    """Test position sizer hook creation functionality"""
    
    def test_create_adaptive_position_sizer_hook(self, test_version):
        """Test creating adaptive position sizer hook"""
        hook = create_adaptive_position_sizer_hook(
            reduction_factor=0.7,
            version=test_version
        )
        
        assert callable(hook)
        
        # Test hook with normal conditions
        base_size = 1000.0
        context = {'strategy': 'wheel'}
        
        adjusted_size = hook(base_size, context)
        assert adjusted_size == 1000.0  # No anomaly, no reduction
    
    @pytest.mark.skipif(not AUTOENCODER_AVAILABLE, reason="AutoencoderAnomalyDetector not available")
    def test_create_hook_with_detector(self, test_version):
        """Test creating hook with actual detector"""
        # Create mock detector
        detector = Mock()
        detector.is_trained = True
        
        hook = create_adaptive_position_sizer_hook(
            anomaly_detector=detector,
            reduction_factor=0.6,
            version=test_version
        )
        
        assert callable(hook)
        
        # Test hook functionality
        base_size = 500.0
        context = {}
        
        adjusted_size = hook(base_size, context)
        assert adjusted_size == 500.0  # Normal conditions


@pytest.mark.integration
@pytest.mark.adaptive
class TestAdaptiveManagerIntegration:
    """Integration tests for AdaptiveManager"""
    
    def test_end_to_end_anomaly_response_workflow(self, test_version, seeded_random):
        """Test complete anomaly response workflow"""
        # Create mock detector that detects anomalies
        detector = Mock()
        detector.is_trained = True
        detector.detect.return_value = {
            'anomalies_detected': True,
            'num_anomalies': 2,
            'max_anomaly_score': 3.2,
            'anomaly_threshold': 1.0,
            'rationale': {
                'severity_assessment': 'high',
                'detection_method': 'autoencoder_reconstruction_error'
            }
        }
        
        # Create manager
        manager = AdaptiveManager(
            version=test_version,
            anomaly_detector=detector,
            position_sizing_reduction_factor=0.3,
            anomaly_cooldown_minutes=30
        )
        
        # Create sample market data
        market_data = pd.DataFrame({
            'close': [450, 460, 470, 520, 480],  # Price spike at index 3
            'volume': [1000000, 1100000, 1200000, 5000000, 1300000],  # Volume spike
            'rsi': [50, 55, 60, 95, 65],  # RSI spike
            'vix': [20, 22, 24, 45, 25]   # VIX spike
        })
        
        market_state = MarketState(
            version=test_version,
            underlying_price=480.0,
            regime=MarketRegime.SIDEWAYS
        )
        
        # Analyze market conditions
        results = manager.analyze_market_conditions(market_data, market_state)
        
        # Verify anomaly detection triggered position sizing reduction
        assert results['anomalies_detected'] is True
        assert results['position_sizing_recommendation'] == 0.3
        assert results['risk_level'] == 'elevated'
        assert manager.current_anomaly_state['is_anomalous']
        
        # Test position sizing hook
        hook = manager.create_position_sizer_hook()
        
        # Should reduce position size
        base_size = 1000.0
        adjusted_size = hook(base_size, {})
        assert adjusted_size == 300.0  # 1000 * 0.3
        
        # Verify logging
        logs = manager.get_manager_logs()
        assert len(logs) == 1
        assert logs[0]['analysis_results']['anomalies_detected'] is True
        
        # Test status reporting
        status = manager.get_status()
        assert status['anomaly_detector_available'] is True
        assert status['current_anomaly_state']['is_anomalous'] is True
        assert status['current_anomaly_state']['severity'] == 'high'
    
    def test_position_sizing_hook_error_handling(self, test_version):
        """Test error handling in position sizing hooks"""
        manager = AdaptiveManager(version=test_version)
        
        # Register a hook that raises an exception
        def failing_hook(base_size: float, context: dict) -> float:
            raise ValueError("Test error")
        
        def working_hook(base_size: float, context: dict) -> float:
            return base_size * 0.9
        
        manager.register_position_sizing_hook(failing_hook)
        manager.register_position_sizing_hook(working_hook)
        
        # Should handle error gracefully and continue with other hooks
        multiplier = manager.get_position_sizing_multiplier()
        
        # Should still apply the working hook (1.0 * 0.9 = 0.9)
        assert abs(multiplier - 0.9) < 0.001
