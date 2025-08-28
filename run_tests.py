#!/usr/bin/env python3
"""
Test Runner Script - Options Trading Backtest Engine

Convenient script for running different test suites with various configurations.
"""

import sys
import subprocess
import argparse
from pathlib import Path


def run_command(cmd, description=""):
    """Run a command and handle the result"""
    print(f"\n{'='*60}")
    print(f"Running: {description or ' '.join(cmd)}")
    print(f"{'='*60}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=False)
        print(f"✅ {description or 'Command'} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description or 'Command'} failed with exit code {e.returncode}")
        return False
    except FileNotFoundError:
        print(f"❌ Command not found: {cmd[0]}")
        return False


def run_repository_tests():
    """Run repository-specific tests"""
    cmd = [
        "python", "-m", "pytest", 
        "tests/test_sqlite_repository.py",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Repository Tests")


def run_unit_tests():
    """Run all unit tests"""
    cmd = [
        "python", "-m", "pytest", 
        "-m", "unit",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Unit Tests")


def run_integration_tests():
    """Run integration tests"""
    cmd = [
        "python", "-m", "pytest", 
        "-m", "integration",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Integration Tests")


def run_all_tests():
    """Run all tests with coverage"""
    cmd = [
        "python", "-m", "pytest",
        "--cov=src",
        "--cov-report=term-missing",
        "--cov-report=html:htmlcov",
        "-v"
    ]
    return run_command(cmd, "All Tests with Coverage")


def run_fast_tests():
    """Run fast tests only (exclude slow tests)"""
    cmd = [
        "python", "-m", "pytest",
        "-m", "not slow",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Fast Tests")


def run_performance_tests():
    """Run performance tests"""
    cmd = [
        "python", "-m", "pytest",
        "-m", "performance",
        "-v", "--tb=short"
    ]
    return run_command(cmd, "Performance Tests")


def run_linting():
    """Run code linting"""
    commands = [
        (["python", "-m", "ruff", "check", "src", "tests"], "Ruff Linting"),
        (["python", "-m", "black", "--check", "src", "tests"], "Black Formatting Check"),
        (["python", "-m", "mypy", "src"], "MyPy Type Checking")
    ]
    
    all_passed = True
    for cmd, description in commands:
        if not run_command(cmd, description):
            all_passed = False
    
    return all_passed


def run_type_checking():
    """Run type checking"""
    cmd = ["python", "-m", "mypy", "src", "--strict"]
    return run_command(cmd, "Type Checking")


def run_security_check():
    """Run security checks"""
    cmd = ["python", "-m", "bandit", "-r", "src"]
    return run_command(cmd, "Security Check")


def run_ci_pipeline():
    """Run full CI pipeline"""
    print("\n🚀 Running Full CI Pipeline")
    print("="*60)
    
    steps = [
        ("Linting", run_linting),
        ("Type Checking", run_type_checking),
        ("Fast Tests", run_fast_tests),
        ("Integration Tests", run_integration_tests),
        ("All Tests with Coverage", run_all_tests)
    ]
    
    failed_steps = []
    
    for step_name, step_func in steps:
        print(f"\n📋 Step: {step_name}")
        if not step_func():
            failed_steps.append(step_name)
    
    print(f"\n{'='*60}")
    print("🏁 CI Pipeline Results")
    print(f"{'='*60}")
    
    if failed_steps:
        print(f"❌ Failed steps: {', '.join(failed_steps)}")
        return False
    else:
        print("✅ All steps passed!")
        return True


def main():
    """Main test runner function"""
    parser = argparse.ArgumentParser(
        description="Test runner for Options Trading Backtest Engine"
    )
    
    parser.add_argument(
        "command",
        choices=[
            "repository", "unit", "integration", "all", "fast", 
            "performance", "lint", "type", "security", "ci"
        ],
        help="Test suite to run"
    )
    
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    
    parser.add_argument(
        "--coverage", "-c",
        action="store_true", 
        help="Include coverage report"
    )
    
    parser.add_argument(
        "--parallel", "-p",
        action="store_true",
        help="Run tests in parallel"
    )
    
    args = parser.parse_args()
    
    # Map commands to functions
    command_map = {
        "repository": run_repository_tests,
        "unit": run_unit_tests,
        "integration": run_integration_tests,
        "all": run_all_tests,
        "fast": run_fast_tests,
        "performance": run_performance_tests,
        "lint": run_linting,
        "type": run_type_checking,
        "security": run_security_check,
        "ci": run_ci_pipeline
    }
    
    # Check if we're in the right directory
    if not Path("src").exists() or not Path("tests").exists():
        print("❌ Error: Please run this script from the project root directory")
        print("   Expected directories: src/, tests/")
        sys.exit(1)
    
    # Run the selected command
    success = command_map[args.command]()
    
    if success:
        print(f"\n✅ {args.command.title()} completed successfully!")
        sys.exit(0)
    else:
        print(f"\n❌ {args.command.title()} failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
