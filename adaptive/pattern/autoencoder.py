"""
Autoencoder-based Anomaly Detection for Market Patterns

This module implements an autoencoder neural network for detecting anomalous
market conditions by learning normal market patterns and flagging deviations
that exceed the 99th percentile threshold.

Features:
- Deep autoencoder architecture for pattern learning
- 99th percentile threshold for anomaly detection
- Comprehensive logging with rationale and version tracking
- Integration with risk management for position sizing
- Robust handling of market data windows
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Union
import logging
import json
from dataclasses import asdict
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore', category=UserWarning)

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader, TensorDataset
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import roc_auc_score
    TORCH_AVAILABLE = True
except ImportError:
    # Create dummy classes for when PyTorch is not available
    torch = None
    nn = None
    optim = None
    DataLoader = None
    TensorDataset = None
    StandardScaler = None
    TORCH_AVAILABLE = False

from ..types import AdaptiveVersion, MarketState
from . import PatternRecognizer


class AutoencoderAnomalyDetector(PatternRecognizer):
    """
    Autoencoder-based anomaly detector for market patterns.
    
    This detector learns normal market behavior patterns using an autoencoder
    neural network and flags anomalies when reconstruction error exceeds
    the 99th percentile threshold.
    """
    
    def __init__(self, 
                 version: Optional[AdaptiveVersion] = None,
                 window_size: int = 20,
                 encoding_dim: int = 8,
                 hidden_dims: List[int] = None,
                 anomaly_threshold_percentile: float = 99.0,
                 learning_rate: float = 0.001,
                 batch_size: int = 32,
                 epochs: int = 100,
                 random_seed: int = 42):
        """
        Initialize Autoencoder Anomaly Detector.
        
        Args:
            version: Version tracking information
            window_size: Size of market data windows for training
            encoding_dim: Dimension of encoded representation
            hidden_dims: Hidden layer dimensions (default: [16, 12])
            anomaly_threshold_percentile: Percentile threshold for anomalies
            learning_rate: Learning rate for training
            batch_size: Batch size for training
            epochs: Number of training epochs
            random_seed: Random seed for reproducibility
        """
        super().__init__(version)
        
        if not TORCH_AVAILABLE:
            raise ImportError(
                "PyTorch is required for AutoencoderAnomalyDetector. "
                "Install with: pip install torch scikit-learn"
            )
        
        self.window_size = window_size
        self.encoding_dim = encoding_dim
        self.hidden_dims = hidden_dims or [16, 12]
        self.anomaly_threshold_percentile = anomaly_threshold_percentile
        self.learning_rate = learning_rate
        self.batch_size = batch_size
        self.epochs = epochs
        self.random_seed = random_seed
        
        # Set random seeds for reproducibility
        torch.manual_seed(random_seed)
        np.random.seed(random_seed)
        
        # Initialize components
        self.autoencoder = None
        self.scaler = StandardScaler()
        self.anomaly_threshold = None
        self.training_errors = []
        self.feature_names = []
        
        # Logging setup
        self.logger = logging.getLogger(__name__)
        self.anomaly_logs = []
        
        # Create output directory
        self.output_dir = Path("adaptive/output/anomalies")
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def fit(self, 
            market_data: pd.DataFrame,
            feature_columns: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Train autoencoder on normal market windows.
        
        Args:
            market_data: Historical market data
            feature_columns: Columns to use as features (default: numeric columns)
            
        Returns:
            Training results and metrics
        """
        self.logger.info("Training autoencoder on normal market windows")
        
        # Prepare training data
        X_train, feature_names = self._prepare_training_data(market_data, feature_columns)
        
        if len(X_train) == 0:
            raise ValueError("No valid training data found")
        
        self.feature_names = feature_names
        input_dim = X_train.shape[1]
        
        # Create autoencoder model
        self.autoencoder = self._create_autoencoder(input_dim)
        
        # Train the model
        training_results = self._train_autoencoder(X_train)
        
        # Calculate anomaly threshold (99th percentile)
        self._calculate_anomaly_threshold(X_train)
        
        # Mark as trained
        self.is_trained = True
        
        self.logger.info(f"Autoencoder training completed. Threshold: {self.anomaly_threshold:.6f}")
        
        return training_results
    
    def detect(self, 
               market_data: pd.DataFrame,
               market_state: Optional[MarketState] = None) -> Dict[str, Any]:
        """
        Detect anomalies in market data.
        
        Args:
            market_data: Market data to analyze
            market_state: Current market state (optional)
            
        Returns:
            Anomaly detection results with scores and rationale
        """
        if not self.is_trained:
            raise ValueError("Detector must be trained before detecting anomalies")
        
        self.logger.info("Detecting anomalies in market data")
        
        # Prepare detection data
        X_detect = self._prepare_detection_data(market_data)
        
        if len(X_detect) == 0:
            return {'anomalies_detected': False, 'reason': 'No valid data for detection'}
        
        # Calculate reconstruction errors
        reconstruction_errors = self._calculate_reconstruction_errors(X_detect)
        
        # Detect anomalies
        anomalies = reconstruction_errors > self.anomaly_threshold
        anomaly_scores = reconstruction_errors / self.anomaly_threshold
        
        # Create detection results
        results = {
            'anomalies_detected': bool(np.any(anomalies)),
            'num_anomalies': int(np.sum(anomalies)),
            'total_windows': len(reconstruction_errors),
            'anomaly_rate': float(np.mean(anomalies)),
            'max_anomaly_score': float(np.max(anomaly_scores)),
            'mean_anomaly_score': float(np.mean(anomaly_scores)),
            'anomaly_threshold': float(self.anomaly_threshold),
            'reconstruction_errors': reconstruction_errors.tolist(),
            'anomaly_scores': anomaly_scores.tolist(),
            'anomaly_indices': np.where(anomalies)[0].tolist(),
            'timestamp': datetime.now().isoformat(),
            'version': self.version.to_dict() if self.version else None
        }
        
        # Add rationale for anomalies
        if results['anomalies_detected']:
            results['rationale'] = self._generate_anomaly_rationale(
                reconstruction_errors, anomalies, market_data, market_state
            )
        
        # Log anomaly detection
        self._log_anomaly_detection(results, market_state)
        
        return results
    
    def _create_autoencoder(self, input_dim: int):
        """Create autoencoder neural network"""
        
        class Autoencoder(nn.Module):
            def __init__(self, input_dim, encoding_dim, hidden_dims):
                super(Autoencoder, self).__init__()
                
                # Encoder layers
                encoder_layers = []
                prev_dim = input_dim
                
                for hidden_dim in hidden_dims:
                    encoder_layers.extend([
                        nn.Linear(prev_dim, hidden_dim),
                        nn.ReLU(),
                        nn.Dropout(0.1)
                    ])
                    prev_dim = hidden_dim
                
                # Bottleneck layer
                encoder_layers.append(nn.Linear(prev_dim, encoding_dim))
                self.encoder = nn.Sequential(*encoder_layers)
                
                # Decoder layers
                decoder_layers = []
                prev_dim = encoding_dim
                
                for hidden_dim in reversed(hidden_dims):
                    decoder_layers.extend([
                        nn.Linear(prev_dim, hidden_dim),
                        nn.ReLU(),
                        nn.Dropout(0.1)
                    ])
                    prev_dim = hidden_dim
                
                # Output layer
                decoder_layers.append(nn.Linear(prev_dim, input_dim))
                self.decoder = nn.Sequential(*decoder_layers)
            
            def forward(self, x):
                encoded = self.encoder(x)
                decoded = self.decoder(encoded)
                return decoded
            
            def encode(self, x):
                return self.encoder(x)
        
        return Autoencoder(input_dim, self.encoding_dim, self.hidden_dims)
    
    def _prepare_training_data(self, 
                              market_data: pd.DataFrame, 
                              feature_columns: Optional[List[str]] = None) -> Tuple[np.ndarray, List[str]]:
        """Prepare training data from market data"""
        
        # Select feature columns
        if feature_columns is None:
            # Use numeric columns
            numeric_columns = market_data.select_dtypes(include=[np.number]).columns.tolist()
            # Remove date-like columns
            feature_columns = [col for col in numeric_columns 
                             if not any(date_word in col.lower() 
                                      for date_word in ['date', 'time', 'timestamp'])]
        
        if not feature_columns:
            raise ValueError("No valid feature columns found")
        
        # Extract features
        features = market_data[feature_columns].copy()
        
        # Handle missing values
        features = features.fillna(method='ffill').fillna(method='bfill')
        
        # Create sliding windows
        windows = []
        for i in range(len(features) - self.window_size + 1):
            window = features.iloc[i:i + self.window_size].values.flatten()
            windows.append(window)
        
        if not windows:
            return np.array([]), feature_columns
        
        X = np.array(windows)
        
        # Normalize features
        X_normalized = self.scaler.fit_transform(X)
        
        return X_normalized, feature_columns
    
    def _prepare_detection_data(self, market_data: pd.DataFrame) -> np.ndarray:
        """Prepare data for anomaly detection"""
        
        # Use same feature columns as training
        if not self.feature_names:
            raise ValueError("No feature names available. Model must be trained first.")
        
        # Extract features
        features = market_data[self.feature_names].copy()
        
        # Handle missing values
        features = features.fillna(method='ffill').fillna(method='bfill')
        
        # Create sliding windows
        windows = []
        for i in range(len(features) - self.window_size + 1):
            window = features.iloc[i:i + self.window_size].values.flatten()
            windows.append(window)
        
        if not windows:
            return np.array([])
        
        X = np.array(windows)
        
        # Normalize using training scaler
        X_normalized = self.scaler.transform(X)
        
        return X_normalized
    
    def _train_autoencoder(self, X_train: np.ndarray) -> Dict[str, Any]:
        """Train the autoencoder model"""
        
        # Convert to PyTorch tensors
        X_tensor = torch.FloatTensor(X_train)
        dataset = TensorDataset(X_tensor, X_tensor)  # Input = target for autoencoder
        dataloader = DataLoader(dataset, batch_size=self.batch_size, shuffle=True)
        
        # Setup optimizer and loss
        optimizer = optim.Adam(self.autoencoder.parameters(), lr=self.learning_rate)
        criterion = nn.MSELoss()
        
        # Training loop
        training_losses = []
        
        self.autoencoder.train()
        for epoch in range(self.epochs):
            epoch_loss = 0.0
            
            for batch_data, batch_target in dataloader:
                optimizer.zero_grad()
                
                # Forward pass
                reconstructed = self.autoencoder(batch_data)
                loss = criterion(reconstructed, batch_target)
                
                # Backward pass
                loss.backward()
                optimizer.step()
                
                epoch_loss += loss.item()
            
            avg_loss = epoch_loss / len(dataloader)
            training_losses.append(avg_loss)
            
            if epoch % 20 == 0:
                self.logger.info(f"Epoch {epoch}/{self.epochs}, Loss: {avg_loss:.6f}")
        
        self.autoencoder.eval()
        
        return {
            'training_losses': training_losses,
            'final_loss': training_losses[-1],
            'epochs_trained': self.epochs,
            'training_samples': len(X_train)
        }

    def _calculate_reconstruction_errors(self, X: np.ndarray) -> np.ndarray:
        """Calculate reconstruction errors for input data"""

        self.autoencoder.eval()

        with torch.no_grad():
            X_tensor = torch.FloatTensor(X)
            reconstructed = self.autoencoder(X_tensor)

            # Calculate MSE for each sample
            mse_errors = torch.mean((X_tensor - reconstructed) ** 2, dim=1)

        return mse_errors.numpy()

    def _calculate_anomaly_threshold(self, X_train: np.ndarray) -> None:
        """Calculate 99th percentile threshold from training data"""

        # Calculate reconstruction errors on training data
        training_errors = self._calculate_reconstruction_errors(X_train)

        # Set threshold at specified percentile
        self.anomaly_threshold = np.percentile(training_errors, self.anomaly_threshold_percentile)
        self.training_errors = training_errors.tolist()

        self.logger.info(
            f"Anomaly threshold set at {self.anomaly_threshold_percentile}th percentile: "
            f"{self.anomaly_threshold:.6f}"
        )

    def _generate_anomaly_rationale(self,
                                  reconstruction_errors: np.ndarray,
                                  anomalies: np.ndarray,
                                  market_data: pd.DataFrame,
                                  market_state: Optional[MarketState] = None) -> Dict[str, Any]:
        """Generate rationale for detected anomalies"""

        anomaly_indices = np.where(anomalies)[0]
        max_error_idx = np.argmax(reconstruction_errors)

        rationale = {
            'detection_method': 'autoencoder_reconstruction_error',
            'threshold_percentile': self.anomaly_threshold_percentile,
            'threshold_value': float(self.anomaly_threshold),
            'max_reconstruction_error': float(reconstruction_errors[max_error_idx]),
            'max_error_ratio': float(reconstruction_errors[max_error_idx] / self.anomaly_threshold),
            'anomaly_windows': anomaly_indices.tolist(),
            'total_anomalous_windows': len(anomaly_indices),
            'severity_assessment': self._assess_anomaly_severity(reconstruction_errors, anomalies)
        }

        # Add market context if available
        if market_state:
            rationale['market_context'] = {
                'regime': market_state.regime.value,
                'volatility_environment': market_state.volatility_environment.value,
                'underlying_price': market_state.underlying_price,
                'vix_level': market_state.vix_level,
                'implied_volatility': market_state.implied_volatility
            }

        # Add feature analysis
        if len(self.feature_names) > 0 and not market_data.empty:
            rationale['feature_analysis'] = self._analyze_anomalous_features(
                market_data, anomaly_indices
            )

        return rationale

    def _assess_anomaly_severity(self,
                                reconstruction_errors: np.ndarray,
                                anomalies: np.ndarray) -> str:
        """Assess severity of detected anomalies"""

        if not np.any(anomalies):
            return "none"

        max_ratio = np.max(reconstruction_errors) / self.anomaly_threshold
        anomaly_rate = np.mean(anomalies)

        if max_ratio > 5.0 or anomaly_rate > 0.1:
            return "critical"
        elif max_ratio > 3.0 or anomaly_rate > 0.05:
            return "high"
        elif max_ratio > 2.0 or anomaly_rate > 0.02:
            return "medium"
        else:
            return "low"

    def _analyze_anomalous_features(self,
                                   market_data: pd.DataFrame,
                                   anomaly_indices: np.ndarray) -> Dict[str, Any]:
        """Analyze which features contribute most to anomalies"""

        if len(anomaly_indices) == 0 or len(self.feature_names) == 0:
            return {}

        # Get data for anomalous windows
        anomalous_data = []
        normal_data = []

        for i in range(len(market_data) - self.window_size + 1):
            window_data = market_data[self.feature_names].iloc[i:i + self.window_size]

            if i in anomaly_indices:
                anomalous_data.append(window_data.values.flatten())
            else:
                normal_data.append(window_data.values.flatten())

        if not anomalous_data or not normal_data:
            return {}

        anomalous_data = np.array(anomalous_data)
        normal_data = np.array(normal_data)

        # Calculate feature importance based on difference in means
        anomalous_means = np.mean(anomalous_data, axis=0)
        normal_means = np.mean(normal_data, axis=0)

        # Avoid division by zero
        normal_stds = np.std(normal_data, axis=0)
        normal_stds[normal_stds == 0] = 1.0

        # Calculate z-scores
        z_scores = np.abs(anomalous_means - normal_means) / normal_stds

        # Get top contributing features
        top_indices = np.argsort(z_scores)[-5:]  # Top 5 features

        feature_analysis = {
            'top_anomalous_features': [],
            'feature_z_scores': z_scores.tolist()
        }

        for idx in reversed(top_indices):
            feature_idx = idx % len(self.feature_names)
            window_position = idx // len(self.feature_names)

            feature_analysis['top_anomalous_features'].append({
                'feature': self.feature_names[feature_idx],
                'window_position': int(window_position),
                'z_score': float(z_scores[idx]),
                'anomalous_mean': float(anomalous_means[idx]),
                'normal_mean': float(normal_means[idx])
            })

        return feature_analysis

    def _log_anomaly_detection(self,
                              results: Dict[str, Any],
                              market_state: Optional[MarketState] = None) -> None:
        """Log anomaly detection results"""

        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'detection_results': results,
            'model_info': {
                'window_size': self.window_size,
                'encoding_dim': self.encoding_dim,
                'hidden_dims': self.hidden_dims,
                'anomaly_threshold': float(self.anomaly_threshold) if self.anomaly_threshold else None,
                'threshold_percentile': self.anomaly_threshold_percentile
            },
            'version': self.version.to_dict() if self.version else None
        }

        if market_state:
            log_entry['market_state_id'] = market_state.state_id

        self.anomaly_logs.append(log_entry)

        if results['anomalies_detected']:
            self.logger.warning(
                f"Anomalies detected: {results['num_anomalies']}/{results['total_windows']} windows, "
                f"max score: {results['max_anomaly_score']:.3f}"
            )
        else:
            self.logger.info("No anomalies detected in market data")

    def get_anomaly_logs(self) -> List[Dict[str, Any]]:
        """Get anomaly detection logs"""
        return self.anomaly_logs.copy()

    def clear_anomaly_logs(self) -> None:
        """Clear anomaly detection logs"""
        self.anomaly_logs.clear()

    def save_model(self, filepath: str) -> None:
        """Save trained model to file"""
        if not self.is_trained:
            raise ValueError("Model must be trained before saving")

        model_data = {
            'model_state_dict': self.autoencoder.state_dict(),
            'scaler_params': {
                'mean_': self.scaler.mean_.tolist() if hasattr(self.scaler, 'mean_') else None,
                'scale_': self.scaler.scale_.tolist() if hasattr(self.scaler, 'scale_') else None
            },
            'config': {
                'window_size': self.window_size,
                'encoding_dim': self.encoding_dim,
                'hidden_dims': self.hidden_dims,
                'anomaly_threshold': float(self.anomaly_threshold) if self.anomaly_threshold else None,
                'threshold_percentile': self.anomaly_threshold_percentile,
                'feature_names': self.feature_names
            },
            'training_errors': self.training_errors,
            'version': self.version.to_dict() if self.version else None,
            'saved_at': datetime.now().isoformat()
        }

        torch.save(model_data, filepath)
        self.logger.info(f"Model saved to {filepath}")

    def load_model(self, filepath: str) -> None:
        """Load trained model from file"""
        model_data = torch.load(filepath, map_location='cpu')

        # Restore configuration
        config = model_data['config']
        self.window_size = config['window_size']
        self.encoding_dim = config['encoding_dim']
        self.hidden_dims = config['hidden_dims']
        self.anomaly_threshold = config['anomaly_threshold']
        self.threshold_percentile = config['threshold_percentile']
        self.feature_names = config['feature_names']
        self.training_errors = model_data.get('training_errors', [])

        # Recreate and load model
        input_dim = len(self.feature_names) * self.window_size
        self.autoencoder = self._create_autoencoder(input_dim)
        self.autoencoder.load_state_dict(model_data['model_state_dict'])
        self.autoencoder.eval()

        # Restore scaler
        scaler_params = model_data['scaler_params']
        if scaler_params['mean_'] is not None:
            self.scaler.mean_ = np.array(scaler_params['mean_'])
            self.scaler.scale_ = np.array(scaler_params['scale_'])

        self.is_trained = True
        self.logger.info(f"Model loaded from {filepath}")

    def get_pattern_strength(self, pattern_name: str, data: pd.DataFrame) -> float:
        """Get strength of anomaly pattern (implements PatternRecognizer interface)"""
        if pattern_name != "anomaly" or not self.is_trained:
            return 0.0

        try:
            results = self.detect(data)
            return results.get('max_anomaly_score', 0.0)
        except Exception:
            return 0.0
