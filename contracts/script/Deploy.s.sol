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
        address uniswapV3SwapRouter;
        address universalRouter;
        address permit2 = address(bytes20(hex"000000000022d473030f116ddee9f6b43ac78ba3"));
        address wrappedNative;
        address ponsFactory;
        if (block.chainid == 8453) {
            uniswapV3SwapRouter = address(bytes20(hex"2626664c2603336e57b271c5c0b26f421741e481"));
            universalRouter = address(bytes20(hex"6ff5693b99212da76ad316178a184ab56d299b43"));
            wrappedNative = address(bytes20(hex"4200000000000000000000000000000000000006"));
        } else if (block.chainid == 4663) {
            uniswapV3SwapRouter = address(bytes20(hex"caf681a66d020601342297493863e78c959e5cb2"));
            universalRouter = address(bytes20(hex"8876789976decbfcbbbe364623c63652db8c0904"));
            wrappedNative = address(bytes20(hex"0bd7d308f8e1639fab988df18a8011f41eacad73"));
            ponsFactory = address(bytes20(hex"7ed598bcef8bd9edd8c97a195c6d13f40801ec7e"));
        } else {
            revert("Unsupported deployment chain");
        }
        vm.startBroadcast(deployerKey);
        router = new SlipwayFeeRouter(
            feeRecipient,
            uniswapV3SwapRouter,
            universalRouter,
            permit2,
            wrappedNative,
            ponsFactory
        );
        vm.stopBroadcast();
    }
}
