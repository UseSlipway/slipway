// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SlipwayFeeRouter} from "../src/SlipwayFeeRouter.sol";

interface Vm {
    function envUint(string calldata key) external returns (uint256);
    function envAddress(string calldata key) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract Deploy {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (SlipwayFeeRouter router) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        vm.startBroadcast(deployerKey);
        router = new SlipwayFeeRouter(feeRecipient);
        vm.stopBroadcast();
    }
}
