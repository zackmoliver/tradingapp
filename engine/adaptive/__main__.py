import argparse, json
from .manager import AdaptiveManager

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Adaptive Intelligence CLI')
    parser.add_argument('--test', action='store_true', help='Run self-test and return JSON')
    parser.add_argument('--optimize', action='store_true', help='Run optimization cycle')
    args = parser.parse_args()

    mgr = AdaptiveManager()

    if args.test:
        output = mgr.self_test()
    elif args.optimize:
        output = mgr.optimize_cycle()
    else:
        output = {"ok": False, "error": "No command provided"}

    print(json.dumps(output, indent=2))
