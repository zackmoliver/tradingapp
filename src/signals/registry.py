"""
Signal Registry Implementation - Options Trading Backtest Engine

This module provides the complete implementation of the signal registry system,
including the decorator, registry management, and signal execution capabilities.

BUSINESS LOGIC IMPLEMENTATION
"""

import inspect
import logging
import asyncio
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Callable, Union, Tuple, Any
from functools import wraps
import uuid

# Import contracts from signals layer
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from signals.registry import (
    SignalFunction, AsyncSignalFunction, SignalValidator, SignalFilter,
    SignalInput, SignalOutput, SignalMetadata, RegisteredSignal,
    SignalCategory, SignalType, SignalStrength, SignalValidationResult,
    SignalRegistry as SignalRegistryProtocol, SignalDecorator as SignalDecoratorProtocol,
    SignalError, RegistrationError, DuplicateSignalError, SignalNotFoundError,
    SignalExecutionError, ValidationError, InvalidSignatureError
)

logger = logging.getLogger(__name__)

# Global signal registry - the main storage for all registered signals
SIGNAL_REGISTRY: Dict[str, RegisteredSignal] = {}


class SignalRegistryImpl(SignalRegistryProtocol):
    """
    Complete implementation of the signal registry system.
    
    Manages registration, discovery, validation, and execution of signal functions
    with comprehensive error handling and performance tracking.
    """
    
    def __init__(self):
        self._registry = SIGNAL_REGISTRY
        self._execution_stats = {
            'total_executions': 0,
            'successful_executions': 0,
            'failed_executions': 0,
            'average_execution_time': 0.0
        }
    
    def register(
        self,
        name: str,
        function: Union[SignalFunction, AsyncSignalFunction],
        metadata: SignalMetadata,
        validator: Optional[SignalValidator] = None,
        filters: Optional[List[SignalFilter]] = None,
        overwrite: bool = False
    ) -> bool:
        """Register a signal function with metadata"""
        try:
            # Check for existing registration
            if name in self._registry and not overwrite:
                logger.error(f"Signal '{name}' already exists and overwrite=False")
                raise DuplicateSignalError(f"Signal '{name}' already exists. Use overwrite=True to replace.")
            
            # Validate function signature
            validation_errors = self.validate_signal_function(function)
            if validation_errors:
                error_msg = f"Invalid signal function signature: {', '.join(validation_errors)}"
                logger.error(error_msg)
                raise InvalidSignatureError(error_msg)
            
            # Create registered signal entry
            registered_signal = RegisteredSignal(
                function=function,
                metadata=metadata,
                validator=validator,
                filters=filters or [],
                is_active=True,
                registration_time=datetime.now(),
                last_used=None,
                usage_count=0,
                performance_metrics={}
            )
            
            # Store in registry
            self._registry[name] = registered_signal
            
            logger.info(f"Successfully registered signal: {name} (category: {metadata.category.value})")
            return True
            
        except Exception as e:
            logger.error(f"Failed to register signal '{name}': {e}")
            raise RegistrationError(f"Failed to register signal '{name}': {e}")
    
    def unregister(self, name: str) -> bool:
        """Unregister a signal function"""
        if name in self._registry:
            del self._registry[name]
            logger.info(f"Unregistered signal: {name}")
            return True
        
        logger.warning(f"Attempted to unregister non-existent signal: {name}")
        return False
    
    def get_signal(self, name: str) -> Optional[RegisteredSignal]:
        """Get registered signal by name"""
        return self._registry.get(name)
    
    def list_signals(
        self,
        category: Optional[SignalCategory] = None,
        tags: Optional[List[str]] = None,
        active_only: bool = True
    ) -> List[str]:
        """List available signal names with optional filtering"""
        signal_names = []
        
        for name, registered_signal in self._registry.items():
            # Filter by active status
            if active_only and not registered_signal.is_active:
                continue
            
            # Filter by category
            if category and registered_signal.metadata.category != category:
                continue
            
            # Filter by tags (must have all specified tags)
            if tags:
                signal_tags = set(registered_signal.metadata.tags)
                required_tags = set(tags)
                if not required_tags.issubset(signal_tags):
                    continue
            
            signal_names.append(name)
        
        return sorted(signal_names)
    
    def get_metadata(self, name: str) -> Optional[SignalMetadata]:
        """Get signal metadata by name"""
        registered_signal = self._registry.get(name)
        return registered_signal.metadata if registered_signal else None
    
    def validate_signal_function(
        self,
        function: Union[SignalFunction, AsyncSignalFunction]
    ) -> List[str]:
        """Validate signal function signature and requirements"""
        errors = []
        
        try:
            # Get function signature
            sig = inspect.signature(function)
            params = list(sig.parameters.values())
            
            # Check parameter count
            if len(params) != 1:
                errors.append(f"Function must have exactly 1 parameter, got {len(params)}")
                return errors
            
            # Check parameter type annotation
            param = params[0]
            if param.annotation != SignalInput and param.annotation != inspect.Parameter.empty:
                errors.append(f"Parameter must be annotated as SignalInput, got {param.annotation}")
            
            # Check return type annotation
            return_annotation = sig.return_annotation
            if return_annotation not in [SignalOutput, Tuple[SignalOutput, ...], inspect.Signature.empty]:
                if not (hasattr(return_annotation, '__origin__') and 
                       return_annotation.__origin__ in [tuple, Tuple]):
                    errors.append(f"Return type must be SignalOutput or Tuple[SignalOutput, ...], got {return_annotation}")
            
            # Check if function is callable
            if not callable(function):
                errors.append("Object is not callable")
            
        except Exception as e:
            errors.append(f"Failed to inspect function signature: {e}")
        
        return errors
    
    def execute_signal(
        self,
        name: str,
        input_data: SignalInput
    ) -> Optional[SignalOutput]:
        """Execute registered signal function"""
        start_time = datetime.now()
        
        try:
            # Get registered signal
            registered_signal = self._registry.get(name)
            if not registered_signal:
                raise SignalNotFoundError(f"Signal '{name}' not found in registry")
            
            if not registered_signal.is_active:
                raise SignalExecutionError(f"Signal '{name}' is not active")
            
            # Execute the signal function
            result = registered_signal.function(input_data)
            
            # Handle async functions
            if asyncio.iscoroutine(result):
                raise SignalExecutionError(f"Signal '{name}' is async, use execute_signal_async instead")
            
            # Validate output if validator is provided
            if registered_signal.validator:
                validation_result = registered_signal.validator(result)
                if not validation_result.is_valid:
                    error_msg = f"Signal output validation failed: {', '.join(validation_result.errors)}"
                    logger.error(error_msg)
                    raise ValidationError(error_msg)
                
                # Use normalized output if provided
                if validation_result.normalized_output:
                    result = validation_result.normalized_output
            
            # Apply filters
            for filter_func in registered_signal.filters:
                if not filter_func(result):
                    logger.info(f"Signal '{name}' output filtered out")
                    return None
            
            # Update usage statistics
            self._update_signal_stats(name, start_time, success=True)
            
            logger.debug(f"Successfully executed signal: {name}")
            return result
            
        except Exception as e:
            self._update_signal_stats(name, start_time, success=False)
            logger.error(f"Failed to execute signal '{name}': {e}")
            raise SignalExecutionError(f"Failed to execute signal '{name}': {e}")
    
    async def execute_signal_async(
        self,
        name: str,
        input_data: SignalInput
    ) -> Tuple[SignalOutput, ...]:
        """Execute registered async signal function"""
        start_time = datetime.now()
        
        try:
            # Get registered signal
            registered_signal = self._registry.get(name)
            if not registered_signal:
                raise SignalNotFoundError(f"Signal '{name}' not found in registry")
            
            if not registered_signal.is_active:
                raise SignalExecutionError(f"Signal '{name}' is not active")
            
            # Execute the signal function
            result = registered_signal.function(input_data)
            
            # Handle async functions
            if asyncio.iscoroutine(result):
                result = await result
            
            # Ensure result is a tuple
            if not isinstance(result, tuple):
                result = (result,) if result is not None else ()
            
            # Validate each output if validator is provided
            validated_results = []
            if registered_signal.validator:
                for output in result:
                    validation_result = registered_signal.validator(output)
                    if not validation_result.is_valid:
                        logger.warning(f"Signal output validation failed for '{name}': {', '.join(validation_result.errors)}")
                        continue
                    
                    # Use normalized output if provided
                    validated_output = validation_result.normalized_output or output
                    validated_results.append(validated_output)
                
                result = tuple(validated_results)
            
            # Apply filters to each output
            filtered_results = []
            for output in result:
                passes_all_filters = True
                for filter_func in registered_signal.filters:
                    if not filter_func(output):
                        passes_all_filters = False
                        break
                
                if passes_all_filters:
                    filtered_results.append(output)
            
            result = tuple(filtered_results)
            
            # Update usage statistics
            self._update_signal_stats(name, start_time, success=True)
            
            logger.debug(f"Successfully executed async signal: {name} (returned {len(result)} outputs)")
            return result
            
        except Exception as e:
            self._update_signal_stats(name, start_time, success=False)
            logger.error(f"Failed to execute async signal '{name}': {e}")
            raise SignalExecutionError(f"Failed to execute async signal '{name}': {e}")
    
    def get_registry_stats(self) -> Dict[str, Any]:
        """Get registry statistics and performance metrics"""
        total_signals = len(self._registry)
        active_signals = sum(1 for s in self._registry.values() if s.is_active)
        
        # Category breakdown
        category_counts = {}
        for registered_signal in self._registry.values():
            category = registered_signal.metadata.category.value
            category_counts[category] = category_counts.get(category, 0) + 1
        
        # Usage statistics
        total_usage = sum(s.usage_count for s in self._registry.values())
        most_used = max(self._registry.items(), key=lambda x: x[1].usage_count, default=(None, None))
        
        return {
            'total_signals': total_signals,
            'active_signals': active_signals,
            'inactive_signals': total_signals - active_signals,
            'category_breakdown': category_counts,
            'total_usage_count': total_usage,
            'most_used_signal': most_used[0] if most_used[0] else None,
            'execution_stats': self._execution_stats.copy(),
            'registry_size_bytes': self._estimate_registry_size()
        }
    
    def _update_signal_stats(self, name: str, start_time: datetime, success: bool):
        """Update signal usage and performance statistics"""
        if name in self._registry:
            registered_signal = self._registry[name]
            
            # Update usage count and last used time
            self._registry[name] = RegisteredSignal(
                function=registered_signal.function,
                metadata=registered_signal.metadata,
                validator=registered_signal.validator,
                filters=registered_signal.filters,
                is_active=registered_signal.is_active,
                registration_time=registered_signal.registration_time,
                last_used=datetime.now(),
                usage_count=registered_signal.usage_count + 1,
                performance_metrics=registered_signal.performance_metrics
            )
        
        # Update global execution stats
        execution_time = (datetime.now() - start_time).total_seconds()
        self._execution_stats['total_executions'] += 1
        
        if success:
            self._execution_stats['successful_executions'] += 1
        else:
            self._execution_stats['failed_executions'] += 1
        
        # Update average execution time
        total_execs = self._execution_stats['total_executions']
        current_avg = self._execution_stats['average_execution_time']
        self._execution_stats['average_execution_time'] = (
            (current_avg * (total_execs - 1) + execution_time) / total_execs
        )
    
    def _estimate_registry_size(self) -> int:
        """Estimate registry memory usage in bytes"""
        # Simple estimation - in production, you might use more sophisticated methods
        import sys
        total_size = 0
        
        for name, registered_signal in self._registry.items():
            total_size += sys.getsizeof(name)
            total_size += sys.getsizeof(registered_signal.metadata.name)
            total_size += sys.getsizeof(registered_signal.metadata.description)
            # Add more detailed size calculation as needed
        
        return total_size


class SignalDecoratorImpl(SignalDecoratorProtocol):
    """Implementation of the signal registration decorator"""
    
    def __init__(self, registry: SignalRegistryImpl):
        self.registry = registry
    
    def __call__(
        self,
        name: Optional[str] = None,
        description: Optional[str] = None,
        category: SignalCategory = SignalCategory.CUSTOM,
        version: str = "1.0.0",
        author: str = "unknown",
        parameters_schema: Optional[Dict[str, Any]] = None,
        required_data: Optional[List[str]] = None,
        lookback_periods: int = 1,
        tags: Optional[List[str]] = None,
        validator: Optional[SignalValidator] = None,
        filters: Optional[List[SignalFilter]] = None
    ) -> Callable[[Union[SignalFunction, AsyncSignalFunction]], Union[SignalFunction, AsyncSignalFunction]]:
        """Decorator for registering signal functions"""
        
        def decorator(func: Union[SignalFunction, AsyncSignalFunction]) -> Union[SignalFunction, AsyncSignalFunction]:
            # Use function name if no name provided
            signal_name = name or func.__name__
            
            # Create metadata
            metadata = SignalMetadata(
                name=signal_name,
                description=description or func.__doc__ or f"Signal function: {signal_name}",
                category=category,
                version=version,
                author=author,
                created_at=datetime.now(),
                parameters_schema=parameters_schema or {},
                required_data=required_data or [],
                lookback_periods=lookback_periods,
                output_type="SignalOutput",
                tags=tags or [],
                documentation_url=None,
                is_deprecated=False,
                deprecation_message=None
            )
            
            # Register the signal
            try:
                self.registry.register(
                    name=signal_name,
                    function=func,
                    metadata=metadata,
                    validator=validator,
                    filters=filters,
                    overwrite=False
                )
            except DuplicateSignalError:
                logger.warning(f"Signal '{signal_name}' already registered, skipping")
            
            return func
        
        return decorator


# Global registry instance
_global_registry = SignalRegistryImpl()

# Global decorator instance
signal = SignalDecoratorImpl(_global_registry)


# Convenience functions for global registry access
def get_signal(name: str) -> Optional[RegisteredSignal]:
    """Get a registered signal by name from the global registry"""
    return _global_registry.get_signal(name)


def list_signals(
    category: Optional[SignalCategory] = None,
    tags: Optional[List[str]] = None,
    active_only: bool = True
) -> List[str]:
    """List available signals from the global registry"""
    return _global_registry.list_signals(category, tags, active_only)


def execute_signal(name: str, input_data: SignalInput) -> Optional[SignalOutput]:
    """Execute a signal from the global registry"""
    return _global_registry.execute_signal(name, input_data)


async def execute_signal_async(name: str, input_data: SignalInput) -> Tuple[SignalOutput, ...]:
    """Execute an async signal from the global registry"""
    return await _global_registry.execute_signal_async(name, input_data)


def get_registry_stats() -> Dict[str, Any]:
    """Get statistics about the global registry"""
    return _global_registry.get_registry_stats()


def clear_registry() -> int:
    """Clear all signals from the global registry (useful for testing)"""
    count = len(SIGNAL_REGISTRY)
    SIGNAL_REGISTRY.clear()
    logger.info(f"Cleared {count} signals from registry")
    return count


def get_registry() -> SignalRegistryImpl:
    """Get the global registry instance"""
    return _global_registry
