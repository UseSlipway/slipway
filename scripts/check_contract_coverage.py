#!/usr/bin/env python3
"""Enforce a line-coverage floor for a selected LCOV source record."""

from __future__ import annotations

import argparse
import pathlib
import sys


def read_record(path: pathlib.Path, suffix: str) -> tuple[int, int]:
    current_source = ""
    lines_found = lines_hit = None
    for line in path.read_text().splitlines():
        if line.startswith("SF:"):
            current_source = line[3:]
            lines_found = lines_hit = None
        elif line.startswith("LF:") and lines_found is None:
            lines_found = int(line[3:])
        elif line.startswith("LH:") and lines_hit is None:
            lines_hit = int(line[3:])
        elif line == "end_of_record" and current_source.endswith(suffix):
            if lines_found is None or lines_hit is None:
                raise ValueError(f"LCOV record for {suffix} is missing LF/LH totals")
            return lines_hit, lines_found
    raise ValueError(f"LCOV report has no record ending in {suffix}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=pathlib.Path)
    parser.add_argument("--source", required=True)
    parser.add_argument("--minimum", required=True, type=float)
    args = parser.parse_args()
    hit, found = read_record(args.report, args.source)
    percentage = 100 * hit / found if found else 100.0
    print(f"{args.source}: {hit}/{found} lines = {percentage:.2f}% (minimum {args.minimum:.2f}%)")
    if percentage < args.minimum:
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
