import subprocess
import sys


def run_command(command: list[str]) -> int:
    result = subprocess.run(command, check=False)
    return result.returncode


def main() -> None:
    checks: list[list[str]] = [
        ["deptry", "."],
        ["ruff", "check", "pipeline.py", "pipelines", "test", "--fix"],
        ["vulture", "pipeline.py", "pipelines", "test", "--min-confidence", "80"],
    ]

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
