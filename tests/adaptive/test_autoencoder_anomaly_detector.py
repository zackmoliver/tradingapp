"""
Unit Tests for Autoencoder Anomaly Detector

This module contains comprehensive unit tests for the autoencoder-based
anomaly detector with synthetic anomaly vs normal windows testing.

All tests use deterministic fixtures and seeded tensors for reproducibility.
"""

import pytest
import numpy as np
import pandas as pd
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
from datetime import datetime, timedelta

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

from adaptive.pattern.autoencoder import AutoencoderAnomalyDetector, TORCH_AVAILABLE as MODULE_TORCH_AVAILABLE
from adaptive.types import AdaptiveVersion, MarketState, MarketRegime


@pytest.mark.unit
@pytest.mark.adaptive
@pytest.mark.pattern
class TestAutoencoderAnomalyDetector:
    """Test suite for AutoencoderAnomalyDetector class"""
    
    @pytest.fixture
    def normal_market_data(self, seeded_random):
        """Generate normal market data for training"""
        np.random.seed(42)
        dates = pd.date_range(start='2024-01-01', periods=100, freq='D')
        
        # Generate normal market patterns
        base_price = 450.0
        price_trend = np.cumsum(seeded_random.normal(0, 0.01, 100))
        prices = base_price + price_trend
        
        data = pd.DataFrame({
            'date': dates,
            'close': prices,
            'volume': seeded_random.normal(1000000, 100000, 100).clip(500000, 2000000),
            'rsi': seeded_random.normal(50, 10, 100).clip(20, 80),
            'macd': seeded_random.normal(0, 1, 100),
            'vix': seeded_random.normal(20, 3, 100).clip(10, 40),
            'put_call_ratio': seeded_random.normal(1.0, 0.1, 100).clip(0.7, 1.3)
        })
        
        return data
    
    @pytest.fixture
    def anomalous_market_data(self, normal_market_data, seeded_random):
        """Generate market data with synthetic anomalies"""
        np.random.seed(42)
        anomalous_data = normal_market_data.copy()
        
        # Inject synthetic anomalies (spikes)
        anomaly_indices = [20, 45, 70]  # Fixed indices for reproducibility
        
        for idx in anomaly_indices:
            # Price spike
            anomalous_data.loc[idx, 'close'] *= 1.1  # 10% spike
            
            # Volume spike
            anomalous_data.loc[idx, 'volume'] *= 3.0  # 3x volume
            
            # VIX spike
            anomalous_data.loc[idx, 'vix'] *= 2.0  # 2x VIX
            
            # RSI extreme
            anomalous_data.loc[idx, 'rsi'] = 95.0  # Extreme overbought
        
        return anomalous_data
    
    def test_detector_initialization(self, test_version):
        """Test AutoencoderAnomalyDetector initialization"""
        if not MODULE_TORCH_AVAILABLE:
            with pytest.raises(ImportError, match="PyTorch is required"):
                AutoencoderAnomalyDetector(version=test_version)
            return
        
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            window_size=10,
            encoding_dim=4,
            hidden_dims=[8, 6],
            anomaly_threshold_percentile=99.0,
            random_seed=42
        )
        
        assert detector.version == test_version
        assert detector.window_size == 10
        assert detector.encoding_dim == 4
        assert detector.hidden_dims == [8, 6]
        assert detector.anomaly_threshold_percentile == 99.0
        assert detector.random_seed == 42
        assert not detector.is_trained
        assert detector.autoencoder is None
        assert detector.anomaly_threshold is None
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_prepare_training_data(self, test_version, normal_market_data):
        """Test training data preparation"""
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            window_size=5,
            random_seed=42
        )
        
        feature_columns = ['close', 'volume', 'rsi', 'vix']
        X_train, feature_names = detector._prepare_training_data(normal_market_data, feature_columns)
        
        assert len(feature_names) == 4
        assert feature_names == feature_columns
        assert X_train.shape[0] == len(normal_market_data) - detector.window_size + 1
        assert X_train.shape[1] == len(feature_columns) * detector.window_size
        
        # Check normalization (should have mean ~0, std ~1)
        assert abs(np.mean(X_train)) < 0.1
        assert abs(np.std(X_train) - 1.0) < 0.1
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_autoencoder_creation(self, test_version):
        """Test autoencoder neural network creation"""
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            encoding_dim=4,
            hidden_dims=[8, 6],
            random_seed=42
        )
        
        input_dim = 20  # 4 features * 5 window size
        autoencoder = detector._create_autoencoder(input_dim)
        
        assert autoencoder is not None
        
        # Test forward pass
        test_input = torch.randn(1, input_dim)
        output = autoencoder(test_input)
        
        assert output.shape == (1, input_dim)
        
        # Test encoding
        encoded = autoencoder.encode(test_input)
        assert encoded.shape == (1, 4)  # encoding_dim
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_fit_normal_data(self, test_version, normal_market_data):
        """Test training on normal market data"""
        # Set seeds for reproducibility
        torch.manual_seed(42)
        np.random.seed(42)
        
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            window_size=5,
            encoding_dim=3,
            hidden_dims=[6, 4],
            epochs=10,  # Reduced for faster testing
            batch_size=8,
            random_seed=42
        )
        
        feature_columns = ['close', 'rsi', 'vix']
        training_results = detector.fit(normal_market_data, feature_columns)
        
        assert detector.is_trained
        assert detector.autoencoder is not None
        assert detector.anomaly_threshold is not None
        assert detector.anomaly_threshold > 0
        
        # Check training results
        assert 'training_losses' in training_results
        assert 'final_loss' in training_results
        assert 'epochs_trained' in training_results
        assert training_results['epochs_trained'] == 10
        
        # Training loss should decrease
        losses = training_results['training_losses']
        assert len(losses) == 10
        assert losses[-1] < losses[0]  # Loss should decrease
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_detect_normal_vs_anomalous(self, test_version, normal_market_data, anomalous_market_data):
        """Test anomaly detection on normal vs anomalous data"""
        # Set seeds for reproducibility
        torch.manual_seed(42)
        np.random.seed(42)
        
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            window_size=5,
            encoding_dim=3,
            epochs=20,  # More epochs for better learning
            batch_size=8,
            anomaly_threshold_percentile=95.0,  # Lower threshold for testing
            random_seed=42
        )
        
        # Train on normal data
        feature_columns = ['close', 'rsi', 'vix', 'volume']
        detector.fit(normal_market_data, feature_columns)
        
        # Test on normal data (should have few/no anomalies)
        normal_results = detector.detect(normal_market_data)
        
        assert 'anomalies_detected' in normal_results
        assert 'num_anomalies' in normal_results
        assert 'max_anomaly_score' in normal_results
        assert 'anomaly_threshold' in normal_results
        
        # Test on anomalous data (should detect anomalies)
        anomalous_results = detector.detect(anomalous_market_data)
        
        assert anomalous_results['anomalies_detected'] is True
        assert anomalous_results['num_anomalies'] > 0
        assert anomalous_results['max_anomaly_score'] > 1.0  # Above threshold
        
        # Anomalous data should have higher anomaly scores than normal data
        assert anomalous_results['max_anomaly_score'] > normal_results['max_anomaly_score']
        
        print(f"Normal data anomalies: {normal_results['num_anomalies']}/{normal_results['total_windows']}")
        print(f"Anomalous data anomalies: {anomalous_results['num_anomalies']}/{anomalous_results['total_windows']}")
        print(f"Max anomaly scores - Normal: {normal_results['max_anomaly_score']:.3f}, Anomalous: {anomalous_results['max_anomaly_score']:.3f}")
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_anomaly_rationale_generation(self, test_version, normal_market_data, anomalous_market_data):
        """Test anomaly rationale generation"""
        torch.manual_seed(42)
        np.random.seed(42)
        
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            window_size=5,
            epochs=15,
            random_seed=42
        )
        
        # Train and detect
        detector.fit(normal_market_data, ['close', 'rsi', 'vix'])
        results = detector.detect(anomalous_market_data)
        
        if results['anomalies_detected']:
            rationale = results['rationale']
            
            assert 'detection_method' in rationale
            assert rationale['detection_method'] == 'autoencoder_reconstruction_error'
            assert 'threshold_percentile' in rationale
            assert 'severity_assessment' in rationale
            assert 'anomaly_windows' in rationale
            
            # Check severity assessment
            severity = rationale['severity_assessment']
            assert severity in ['none', 'low', 'medium', 'high', 'critical']
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_model_save_load(self, test_version, normal_market_data, tmp_path):
        """Test model saving and loading"""
        torch.manual_seed(42)
        np.random.seed(42)
        
        # Train original detector
        detector1 = AutoencoderAnomalyDetector(
            version=test_version,
            window_size=5,
            encoding_dim=3,
            epochs=10,
            random_seed=42
        )
        
        detector1.fit(normal_market_data, ['close', 'rsi'])
        original_threshold = detector1.anomaly_threshold
        
        # Save model
        model_path = tmp_path / "test_model.pth"
        detector1.save_model(str(model_path))
        
        assert model_path.exists()
        
        # Load model into new detector
        detector2 = AutoencoderAnomalyDetector(version=test_version, random_seed=42)
        detector2.load_model(str(model_path))
        
        assert detector2.is_trained
        assert detector2.anomaly_threshold == original_threshold
        assert detector2.window_size == detector1.window_size
        assert detector2.encoding_dim == detector1.encoding_dim
        assert detector2.feature_names == detector1.feature_names
        
        # Test that loaded model produces same results
        results1 = detector1.detect(normal_market_data)
        results2 = detector2.detect(normal_market_data)
        
        np.testing.assert_array_almost_equal(
            results1['reconstruction_errors'], 
            results2['reconstruction_errors'],
            decimal=5
        )
    
    @pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
    def test_logging_and_version_tracking(self, test_version, normal_market_data):
        """Test logging and version tracking"""
        torch.manual_seed(42)
        
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            epochs=5,
            random_seed=42
        )
        
        # Train and detect
        detector.fit(normal_market_data, ['close', 'rsi'])
        results = detector.detect(normal_market_data)
        
        # Check version tracking in results
        assert 'version' in results
        assert results['version']['code_version'] == test_version.code_version
        
        # Check anomaly logs
        logs = detector.get_anomaly_logs()
        assert len(logs) == 1
        
        log = logs[0]
        assert 'timestamp' in log
        assert 'detection_results' in log
        assert 'model_info' in log
        assert 'version' in log
        
        # Test log clearing
        detector.clear_anomaly_logs()
        assert len(detector.get_anomaly_logs()) == 0
    
    def test_detector_without_pytorch(self, test_version):
        """Test detector behavior when PyTorch is not available"""
        if MODULE_TORCH_AVAILABLE:
            # Mock PyTorch as unavailable
            with patch('adaptive.pattern.autoencoder.TORCH_AVAILABLE', False):
                with pytest.raises(ImportError, match="PyTorch is required"):
                    AutoencoderAnomalyDetector(version=test_version)
        else:
            # PyTorch actually not available
            with pytest.raises(ImportError, match="PyTorch is required"):
                AutoencoderAnomalyDetector(version=test_version)


@pytest.mark.integration
@pytest.mark.adaptive
@pytest.mark.pattern
@pytest.mark.skipif(not MODULE_TORCH_AVAILABLE, reason="PyTorch not available")
class TestAutoencoderIntegration:
    """Integration tests for AutoencoderAnomalyDetector"""
    
    def test_end_to_end_anomaly_detection_workflow(self, test_version, seeded_random):
        """Test complete anomaly detection workflow"""
        torch.manual_seed(42)
        np.random.seed(42)
        
        # Create realistic market data with known anomalies
        dates = pd.date_range(start='2024-01-01', periods=200, freq='D')
        
        # Normal market data
        normal_data = pd.DataFrame({
            'date': dates,
            'close': 450 + np.cumsum(seeded_random.normal(0, 0.5, 200)),
            'volume': seeded_random.normal(1000000, 100000, 200),
            'rsi': seeded_random.normal(50, 8, 200).clip(20, 80),
            'vix': seeded_random.normal(18, 2, 200).clip(10, 30)
        })
        
        # Inject specific anomalies
        anomaly_dates = [50, 100, 150]
        for idx in anomaly_dates:
            normal_data.loc[idx, 'close'] *= 1.15  # 15% price jump
            normal_data.loc[idx, 'volume'] *= 4.0   # 4x volume
            normal_data.loc[idx, 'vix'] *= 2.5      # 2.5x VIX
        
        # Split data for training and testing
        train_data = normal_data.iloc[:150].copy()  # First 150 days for training
        test_data = normal_data.iloc[140:].copy()   # Last 60 days for testing (with overlap)
        
        # Remove anomalies from training data
        train_data = train_data.drop(train_data.index[50])  # Remove anomaly at index 50
        train_data = train_data.drop(train_data.index[99])  # Remove anomaly at index 100 (now 99)
        
        # Initialize and train detector
        detector = AutoencoderAnomalyDetector(
            version=test_version,
            window_size=10,
            encoding_dim=4,
            hidden_dims=[8, 6],
            epochs=30,
            batch_size=16,
            anomaly_threshold_percentile=95.0,
            random_seed=42
        )
        
        # Train on clean data
        training_results = detector.fit(train_data, ['close', 'volume', 'rsi', 'vix'])
        
        assert detector.is_trained
        assert training_results['final_loss'] < training_results['training_losses'][0]
        
        # Test on data with anomalies
        detection_results = detector.detect(test_data)
        
        assert detection_results['anomalies_detected'] is True
        assert detection_results['num_anomalies'] > 0
        
        # Verify that anomalies were detected near the injected anomaly dates
        anomaly_indices = detection_results['anomaly_indices']
        print(f"Detected anomalies at indices: {anomaly_indices}")
        print(f"Expected anomalies around indices: {[idx-140 for idx in anomaly_dates if idx >= 140]}")
        
        # Should detect at least one anomaly
        assert len(anomaly_indices) > 0
        
        # Check rationale
        if 'rationale' in detection_results:
            rationale = detection_results['rationale']
            assert rationale['severity_assessment'] in ['low', 'medium', 'high', 'critical']
            assert rationale['total_anomalous_windows'] == detection_results['num_anomalies']
