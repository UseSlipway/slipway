// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SlipwayFeeRouter} from "../src/SlipwayFeeRouter.sol";

interface Vm {
    function envAddress(string calldata key) external returns (address);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonBytes32(string calldata json, string calldata key) external pure returns (bytes32);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract Deploy {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (SlipwayFeeRouter router) {
        string memory wallet = vm.readFile("wallet.json");
        uint256 deployerKey = uint256(vm.parseJsonBytes32(wallet, ".private_key"));
        address expectedDeployer = vm.parseJsonAddress(wallet, ".address");
        require(deployerKey != 0 && vm.addr(deployerKey) == expectedDeployer, "wallet.json key/address mismatch");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        vm.startBroadcast(deployerKey);
        router = new SlipwayFeeRouter(feeRecipient);
        vm.stopBroadcast();
    }
}
