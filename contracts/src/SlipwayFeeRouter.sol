// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Initial placeholder for Slipway's immutable EVM fee router.
/// @dev Production routing and fee invariants are specified in technical-docs/Slipway_Overview.md.
contract SlipwayFeeRouter {
    address public immutable feeRecipient;

    error InvalidFeeRecipient();

    constructor(address feeRecipient_) {
        if (feeRecipient_ == address(0)) revert InvalidFeeRecipient();
        feeRecipient = feeRecipient_;
    }
}
