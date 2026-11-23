#!/usr/bin/env python3
"""Fail Slither CI on new high/medium findings; require review of stale baseline entries."""

from __future__ import annotations

import json
import pathlib
import re
import sys


def signature(finding: dict) -> tuple[str, str, str, str]:
    elements = finding.get("elements", [])
    contract = next((e.get("name") for e in elements if e.get("type") == "contract"), "")
    function = next((e.get("name") for e in elements if e.get("type") == "function"), "")
    match = re.search(r"([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(", finding.get("description", ""))
    if match:
        contract = contract or match.group(1)
        function = function or match.group(2)
    if not contract:
        filename = elements[0].get("source_mapping", {}).get("filename_relative", "") if elements else ""
        contract = pathlib.Path(filename).stem
    return (finding.get("check", ""), finding.get("impact", ""), contract, function)


def main() -> int:
    report = json.loads(pathlib.Path(sys.argv[1]).read_text())
    baseline = json.loads(pathlib.Path(sys.argv[2]).read_text())
    allowed = {
        (item["check"], item["impact"], item["contract"], item["function"]): item["rationale"]
        for item in baseline
    }
    observed = [signature(item) for item in report.get("results", {}).get("detectors", [])]
    observed_set = set(observed)
    blocked = sorted(
        item for item in observed_set
        if item[1] in {"High", "Medium"} and item not in allowed
    )
    stale = sorted(item for item in allowed if item not in observed_set)
    for item in sorted(observed_set & set(allowed)):
        print(f"REVIEWED {item[1]} {item[0]} {item[2]}.{item[3]}")
    if blocked:
        for item in blocked:
            print(f"NEW {item[1]} {item[0]} {item[2]}.{item[3]}", file=sys.stderr)
    if stale:
        for item in stale:
            print(f"STALE BASELINE {item[1]} {item[0]} {item[2]}.{item[3]}: remove or re-review", file=sys.stderr)
    if blocked or stale:
        return 1
    print("PASS: no unreviewed high/medium Slither findings")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: check_slither_baseline.py REPORT.json BASELINE.json")
    raise SystemExit(main())
