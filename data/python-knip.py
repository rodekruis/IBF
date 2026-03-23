import argparse
import subprocess
import sys


def run_command(command: list[str]) -> int:
    result = subprocess.run(command, check=False)
    return result.returncode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fix", action="store_true")
    return parser.parse_args()


PYTHON_SOURCES = ["pipelines", "data_management", "shared", "python-knip.py"]


def build_checks(fix: bool) -> list[list[str]]:
    ruff_command = ["ruff", "check", *PYTHON_SOURCES]
    if fix:
        ruff_command.append("--fix")

    return [
        ["deptry", "."],
        ruff_command,
        ["vulture", *PYTHON_SOURCES, "--min-confidence", "80"],
    ]


def main() -> None:
    args = parse_args()
    checks = build_checks(args.fix)
    failed = False

    for command in checks:
        print(f"\n> {' '.join(command)}")
        exit_code = run_command(command)
        if exit_code != 0:
            failed = True

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
