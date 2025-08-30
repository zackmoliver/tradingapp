#!/usr/bin/env python3
"""
Adaptive Intelligence Module Test Runner

Specialized test runner for the adaptive intelligence module with
comprehensive test coverage and performance monitoring.

Usage:
    python tests/adaptive/run_adaptive_tests.py unit
    python tests/adaptive/run_adaptive_tests.py integration
    python tests/adaptive/run_adaptive_tests.py all
    python tests/adaptive/run_adaptive_tests.py performance
"""

import sys
import subprocess
import argparse
import time
from pathlib import Path


def run_command(cmd, description=""):
    """Run a command and handle the result"""
    print(f"\n{'='*60}")
    print(f"Running: {description or ' '.join(cmd)}")
    print(f"{'='*60}")
    
    start_time = time.time()
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=False)
        elapsed = time.time() - start_time
        print(f"✅ {description or 'Command'} completed successfully in {elapsed:.2f}s")
        return True
    except subprocess.CalledProcessError as e:
        elapsed = time.time() - start_time
        print(f"❌ {description or 'Command'} failed with exit code {e.returncode} after {elapsed:.2f}s")
        return False
    except FileNotFoundError:
        print(f"❌ Command not found: {cmd[0]}")
        return False


def run_adaptive_unit_tests():
    """Run adaptive module unit tests"""
    cmd = [
        "python", "-m", "pytest", 
        "tests/adaptive/test_types.py",
        "-m", "unit and adaptive",
        "-v", "--tb=short",
        "--cov=adaptive",
        "--cov-report=term-missing"
    ]
    return run_command(cmd, "Adaptive Unit Tests")


def run_adaptive_integration_tests():
    """Run adaptive module integration tests"""
    cmd = [
        "python", "-m", "pytest", 
        "tests/adaptive/test_integration.py",
        "-m", "integration and adaptive",
        "-v", "--tb=short",
        "--cov=adaptive",
        "--cov-report=term-missing"
    ]
    return run_command(cmd, "Adaptive Integration Tests")


def run_adaptive_performance_tests():
    """Run adaptive module performance tests"""
    cmd = [
        "python", "-m", "pytest", 
        "tests/adaptive/",
        "-m", "performance and adaptive",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Adaptive Performance Tests")


def run_all_adaptive_tests():
    """Run all adaptive module tests with coverage"""
    cmd = [
        "python", "-m", "pytest",
        "tests/adaptive/",
        "-m", "adaptive",
        "--cov=adaptive",
        "--cov-report=term-missing",
        "--cov-report=html:htmlcov/adaptive",
        "--cov-fail-under=80",
        "-v"
    ]
    return run_command(cmd, "All Adaptive Tests with Coverage")


def run_fast_adaptive_tests():
    """Run fast adaptive tests only (exclude slow tests)"""
    cmd = [
        "python", "-m", "pytest",
        "tests/adaptive/",
        "-m", "adaptive and not slow",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Fast Adaptive Tests")


def run_adaptive_pattern_tests():
    """Run pattern recognition specific tests"""
    cmd = [
        "python", "-m", "pytest",
        "tests/adaptive/",
        "-m", "pattern",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Pattern Recognition Tests")


def run_adaptive_optimizer_tests():
    """Run optimizer specific tests"""
    cmd = [
        "python", "-m", "pytest",
        "tests/adaptive/",
        "-m", "optimizer",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Optimizer Tests")


def run_adaptive_rl_tests():
    """Run reinforcement learning specific tests"""
    cmd = [
        "python", "-m", "pytest",
        "tests/adaptive/",
        "-m", "rl",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Reinforcement Learning Tests")


def run_adaptive_coverage_report():
    """Generate detailed coverage report for adaptive module"""
    cmd = [
        "python", "-m", "pytest",
        "tests/adaptive/",
        "-m", "adaptive",
        "--cov=adaptive",
        "--cov-report=html:htmlcov/adaptive",
        "--cov-report=xml:coverage_adaptive.xml",
        "--cov-report=term-missing",
        "--cov-fail-under=80",
        "-q"
    ]
    return run_command(cmd, "Adaptive Coverage Report")


def run_adaptive_ci_pipeline():
    """Run full CI pipeline for adaptive module"""
    print("\n🚀 Running Adaptive Intelligence CI Pipeline")
    print("="*60)
    
    steps = [
        ("Fast Tests", run_fast_adaptive_tests),
        ("Unit Tests", run_adaptive_unit_tests),
        ("Integration Tests", run_adaptive_integration_tests),
        ("Performance Tests", run_adaptive_performance_tests),
        ("Coverage Report", run_adaptive_coverage_report)
    ]
    
    failed_steps = []
    total_start_time = time.time()
    
    for step_name, step_func in steps:
        print(f"\n📋 Step: {step_name}")
        if not step_func():
            failed_steps.append(step_name)
    
    total_elapsed = time.time() - total_start_time
    
    print(f"\n{'='*60}")
    print("🏁 Adaptive CI Pipeline Results")
    print(f"{'='*60}")
    print(f"Total time: {total_elapsed:.2f}s")
    
    if failed_steps:
        print(f"❌ Failed steps: {', '.join(failed_steps)}")
        return False
    else:
        print("✅ All steps passed!")
        print("\n📊 Coverage Report:")
        print("   HTML: htmlcov/adaptive/index.html")
        print("   XML: coverage_adaptive.xml")
        return True


def validate_environment():
    """Validate test environment"""
    print("🔍 Validating test environment...")
    
    # Check if we're in the right directory
    if not Path("adaptive").exists():
        print("❌ Error: adaptive/ directory not found")
        print("   Please run this script from the project root directory")
        return False
    
    # Check if tests directory exists
    if not Path("tests/adaptive").exists():
        print("❌ Error: tests/adaptive/ directory not found")
        return False
    
    # Check if pytest is available
    try:
        subprocess.run(["python", "-m", "pytest", "--version"], 
                      check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Error: pytest not available")
        print("   Please install pytest: pip install pytest pytest-cov")
        return False
    
    # Check if adaptive module can be imported
    try:
        subprocess.run(["python", "-c", "import adaptive"], 
                      check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print("❌ Error: Cannot import adaptive module")
        print("   Please ensure adaptive module is in Python path")
        return False
    
    print("✅ Environment validation passed")
    return True


def main():
    """Main test runner function"""
    parser = argparse.ArgumentParser(
        description="Test runner for Adaptive Intelligence Module"
    )
    
    parser.add_argument(
        "command",
        choices=[
            "unit", "integration", "performance", "all", "fast", 
            "pattern", "optimizer", "rl", "coverage", "ci"
        ],
        help="Test suite to run"
    )
    
    parser.add_argument(
        "--no-validation",
        action="store_true",
        help="Skip environment validation"
    )
    
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    
    args = parser.parse_args()
    
    # Validate environment unless skipped
    if not args.no_validation and not validate_environment():
        sys.exit(1)
    
    # Map commands to functions
    command_map = {
        "unit": run_adaptive_unit_tests,
        "integration": run_adaptive_integration_tests,
        "performance": run_adaptive_performance_tests,
        "all": run_all_adaptive_tests,
        "fast": run_fast_adaptive_tests,
        "pattern": run_adaptive_pattern_tests,
        "optimizer": run_adaptive_optimizer_tests,
        "rl": run_adaptive_rl_tests,
        "coverage": run_adaptive_coverage_report,
        "ci": run_adaptive_ci_pipeline
    }
    
    # Run the selected command
    success = command_map[args.command]()
    
    if success:
        print(f"\n🎉 {args.command.title()} tests completed successfully!")
        sys.exit(0)
    else:
        print(f"\n💥 {args.command.title()} tests failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
