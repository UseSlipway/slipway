#!/usr/bin/env python3
"""Verify SlipwayFeeRouter deployments against the local Foundry artifact."""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "out/SlipwayFeeRouter.sol/SlipwayFeeRouter.json"
CONFIGS = {
    "base-8453": {
        "rpc": "BASE_RPC_URL",
        "chain_id": 8453,
        "v3": "0x2626664c2603336e57b271c5c0b26f421741e481",
        "universal": "0x6ff5693b99212da76ad316178a184ab56d299b43",
        "permit2": "0x000000000022d473030f116ddee9f6b43ac78ba3",
        "wrapped": "0x4200000000000000000000000000000000000006",
        "pons_factory": "0x0000000000000000000000000000000000000000",
        "explorer_address": "https://basescan.org/address/",
        "explorer_tx": "https://basescan.org/tx/",
    },
    "robinhood-4663": {
        "rpc": "RHC_RPC_URL",
        "chain_id": 4663,
        "v3": "0xcaf681a66d020601342297493863e78c959e5cb2",
        "universal": "0x8876789976decbfcbbbe364623c63652db8c0904",
        "permit2": "0x000000000022d473030f116ddee9f6b43ac78ba3",
        "wrapped": "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
        "pons_factory": "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
        "explorer_address": "https://robinhoodchain.blockscout.com/address/",
        "explorer_tx": "https://robinhoodchain.blockscout.com/tx/",
    },
}
GETTERS = {
    "feeRecipient": "0x46904840",
    "uniswapV3SwapRouter": "0x00bc574b",
    "universalRouter": "0x35a9e4df",
    "permit2": "0x12261ee7",
    "wrappedNative": "0xeb6d3a11",
    "ponsFactory": "0x1e344ad1",
}


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        row = line.strip()
        if not row or row.startswith("#") or "=" not in row:
            continue
        key, value = row.split("=", 1)
        value = value.strip().strip("\"'")
        os.environ.setdefault(key.strip(), value)


def rpc(url: str, method: str, params: list[object]) -> object:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(
        url,
        body,
        {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SlipwayDeploymentVerifier/1.0 (+https://tryslipway.com)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"RPC {method} failed: {error}") from error
    if "error" in payload:
        raise RuntimeError(f"RPC {method} failed: {payload['error']}")
    return payload["result"]


def normalize_address(value: str) -> str:
    return "0x" + value.lower().removeprefix("0x").rjust(40, "0")[-40:]


def expected_runtime(template: str, refs: dict[str, list[dict[str, int]]]) -> str:
    runtime = bytearray.fromhex(template.removeprefix("0x"))
    runtime = strip_solidity_metadata(runtime)
    for positions in refs.values():
        for reference in positions:
            start = reference["start"]
            length = reference["length"]
            runtime[start : start + length] = b"\x00" * length
    return runtime.hex()


def actual_runtime(code: str, refs: dict[str, list[dict[str, int]]]) -> str:
    runtime = bytearray.fromhex(code.removeprefix("0x"))
    runtime = strip_solidity_metadata(runtime)
    for positions in refs.values():
        for reference in positions:
            start = reference["start"]
            length = reference["length"]
            runtime[start : start + length] = b"\x00" * length
    return runtime.hex()


def strip_solidity_metadata(runtime: bytearray) -> bytearray:
    if len(runtime) < 2:
        return runtime
    metadata_length = int.from_bytes(runtime[-2:], "big")
    if metadata_length + 2 > len(runtime):
        raise RuntimeError("Runtime bytecode has an invalid Solidity metadata trailer")
    return runtime[: -(metadata_length + 2)]


def main() -> int:
    load_env()
    if not ARTIFACT.is_file():
        raise RuntimeError("Foundry artifact missing; run forge build first")
    artifact_bytes = ARTIFACT.read_bytes()
    artifact = json.loads(artifact_bytes)
    deployed = artifact["deployedBytecode"]
    metadata = json.dumps(artifact["metadata"], sort_keys=True, separators=(",", ":")).encode()
    build_hash = "sha256:" + hashlib.sha256(metadata).hexdigest()
    template = expected_runtime(deployed["object"], deployed["immutableReferences"])
    failures: list[str] = []

    for name, config in CONFIGS.items():
        record_path = ROOT / "deployments" / f"{name}.json"
        record = json.loads(record_path.read_text())
        deployment = record.get("restrictedFeeRouter")
        if not deployment:
            raise RuntimeError(f"{record_path} has no restrictedFeeRouter record")
        if (
            not deployment.get("deployedSourceCommit")
            or not deployment.get("deployedBuildHash")
            or not deployment.get("publicBuildOfRecordCommit")
            or not deployment.get("publicBuildOfRecordTag")
        ):
            raise RuntimeError(f"{record_path} must record the deployed build and its public source reference")
        url = os.environ.get(config["rpc"], "").strip()
        if not url:
            raise RuntimeError(f"{config['rpc']} is required (or add it to contracts/.env)")
        address = deployment["address"]
        chain_id = int(str(rpc(url, "eth_chainId", [])), 16)
        if chain_id != config["chain_id"]:
            raise RuntimeError(f"{name}: RPC chain ID {chain_id} does not match {config['chain_id']}")
        receipt = rpc(url, "eth_getTransactionReceipt", [deployment["transactionHash"]])
        if not receipt or int(receipt["status"], 16) != 1:
            raise RuntimeError(f"{name}: deployment transaction is missing or reverted")
        if normalize_address(receipt.get("contractAddress") or "") != normalize_address(address):
            raise RuntimeError(f"{name}: deployment transaction created a different address")
        if int(receipt["blockNumber"], 16) != int(deployment["blockNumber"]):
            raise RuntimeError(f"{name}: recorded deployment block does not match receipt")

        code = str(rpc(url, "eth_getCode", [address, "latest"]))
        if code == "0x" or actual_runtime(code, deployed["immutableReferences"]) != template:
            raise RuntimeError(f"{name}: on-chain runtime does not match the compiled artifact")

        expected = {
            "feeRecipient": record["feeRecipient"],
            "uniswapV3SwapRouter": config["v3"],
            "universalRouter": config["universal"],
            "permit2": config["permit2"],
            "wrappedNative": config["wrapped"],
            "ponsFactory": config["pons_factory"],
        }
        for getter, wanted in expected.items():
            result = str(rpc(url, "eth_call", [{"to": address, "data": GETTERS[getter]}, "latest"]))
            actual = normalize_address(result[-40:])
            if actual != normalize_address(wanted):
                failures.append(f"{name}: {getter} is {actual}, expected {normalize_address(wanted)}")
        if failures:
            continue

        block = int(str(rpc(url, "eth_blockNumber", [])), 16)
        deployment["verificationArtifactHash"] = build_hash
        deployment.pop("buildHash", None)
        deployment["runtimeBytecodeHash"] = "sha256:" + hashlib.sha256(bytes.fromhex(actual_runtime(code, deployed["immutableReferences"]))).hexdigest()
        deployment["onChainRuntimeVerified"] = True
        deployment["checkedAtBlock"] = block
        deployment["verifiedConfiguration"] = expected
        deployment["buildSettings"] = {
            "compiler": artifact["metadata"]["compiler"]["version"],
            "evmVersion": artifact["metadata"]["settings"]["evmVersion"],
            "optimizerRuns": artifact["metadata"]["settings"]["optimizer"]["runs"],
            "bytecodeHash": artifact["metadata"]["settings"]["metadata"]["bytecodeHash"],
        }
        deployment["explorerAddressUrl"] = config["explorer_address"] + address
        deployment["explorerTransactionUrl"] = config["explorer_tx"] + deployment["transactionHash"]
        record_path.write_text(json.dumps(record, indent=2) + "\n")
        print(f"PASS {name} chain={chain_id} address={address} deployBlock={deployment['blockNumber']} checkedAt={block}")
        print(f"     tx={deployment['transactionHash']}")
        print(f"     deployedBuild={deployment['deployedBuildHash']} verificationArtifact={build_hash}")
        print(f"     maskedRuntime={deployment['runtimeBytecodeHash']}")

    if failures:
        raise RuntimeError("\n".join(failures))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # redact RPC URLs if a provider includes them in errors
        message = str(error)
        for value in os.environ.values():
            if value.startswith(("https://", "http://")):
                message = message.replace(value, "[RPC URL]")
        print(f"ERROR: {message}", file=sys.stderr)
        raise SystemExit(1)
