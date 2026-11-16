#!/usr/bin/env python3
"""Publish sanitized main history to the public-origin main branch."""

from __future__ import annotations

import os
import re
import subprocess
import sys

SOURCE_BRANCH = "main"
PUBLIC_BRANCH = "public-main"
PUBLIC_REMOTE = "public-origin"
PUBLIC_NAME = "UseSlipway"
PUBLIC_EMAIL = "slipway@atomicmail.io"
PRIVATE_PATHS = (b"technical-docs", b".env", b"backend/.env", b"contracts/.env")


def run(*args: str, input_data: bytes | None = None, allow_failure: bool = False) -> bytes:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    result = subprocess.run(args, input=input_data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if result.returncode and not allow_failure:
        sys.stderr.buffer.write(result.stderr)
        raise SystemExit(result.returncode)
    return result.stdout


def rewrite_identity(line: bytes) -> bytes:
    match = re.match(rb"^(author|committer|tagger) .*? ([-]?\d+ [+-]\d{4})\n$", line)
    if not match:
        return line
    return match.group(1) + b" " + PUBLIC_NAME.encode() + b" <" + PUBLIC_EMAIL.encode() + b"> " + match.group(2) + b"\n"


def rewrite_export(stream: bytes) -> bytes:
    out = bytearray()
    cursor = 0
    record = None
    while cursor < len(stream):
        end = stream.find(b"\n", cursor)
        if end < 0:
            out.extend(stream[cursor:])
            break
        line = stream[cursor:end + 1]
        cursor = end + 1
        if line.startswith((b"M ", b"D ", b"R ", b"C ")):
            paths = line.strip().split()[1:]
            if any(path in PRIVATE_PATHS or any(path.startswith(prefix + b"/") for prefix in PRIVATE_PATHS) for path in paths):
                continue
        if line == b"blob\n":
            record = b"blob"
        elif line.startswith(b"commit "):
            record = b"commit"
        elif line.startswith(b"tag "):
            record = b"tag"
        if line.startswith(b"data "):
            size = int(line[5:-1])
            payload = stream[cursor:cursor + size]
            cursor += size
            if record in (b"commit", b"tag"):
                payload = re.sub(rb"(?im)^co-authored-by:[^\r\n]*(?:\r?\n|$)", b"", payload)
                out.extend(f"data {len(payload)}\n".encode())
            else:
                out.extend(line)
            out.extend(payload)
            if stream[cursor:cursor + 1] == b"\n":
                out.extend(b"\n")
                cursor += 1
            continue
        if line in (b"commit refs/heads/main\n", b"reset refs/heads/main\n"):
            line = line.replace(b"refs/heads/main", b"refs/heads/public-main")
        out.extend(rewrite_identity(line))
    return bytes(out)


def main() -> None:
    run("git", "rev-parse", "--verify", SOURCE_BRANCH)
    exported = run("git", "fast-export", "--show-original-ids", SOURCE_BRANCH)
    run("git", "fast-import", "--force", input_data=rewrite_export(exported))
    public_commit = run("git", "rev-parse", "refs/heads/public-main").decode().strip()
    remote = run("git", "ls-remote", "--heads", PUBLIC_REMOTE, "refs/heads/main").decode().splitlines()
    remote_tip = remote[0].split()[0] if remote else None
    local_history = run("git", "rev-list", "--first-parent", "public-main").decode().splitlines()
    if remote_tip in local_history:
        if remote_tip != public_commit:
            run("git", "push", PUBLIC_REMOTE, f"{public_commit}:refs/heads/main")
    elif remote_tip:
        raise SystemExit("Public main has unrelated history; refusing to overwrite it.")
    else:
        run("git", "push", PUBLIC_REMOTE, f"{public_commit}:refs/heads/main")
    print("Published sanitized public history to public-origin/main.")


if __name__ == "__main__":
    main()
