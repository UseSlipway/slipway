// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Executes an exact-input EVM venue call and splits disclosed input fees.
/// @dev Venue adapters must encode the venue's output recipient as this router.
///      The router forwards the measured output to the wallet that called it.
contract SlipwayFeeRouter {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 20;
    uint16 public constant MAX_INTEGRATOR_FEE_BPS = 100;

    address public immutable feeRecipient;
    uint256 private entered = 1;

    struct ExactInParams {
        address tokenIn;
        address tokenOut;
        address venue;
        uint256 amountIn;
        uint256 amountOutMin;
        uint16 protocolFeeBps;
        uint16 integratorFeeBps;
        address integratorRecipient;
    }

    error InvalidFeeRecipient();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFee();
    error InvalidIntegratorRecipient();
    error InvalidTokenTransfer();
    error TokenCallFailed(address token, bytes4 selector);
    error VenueCallFailed(bytes reason);
    error InsufficientOutput(uint256 received, uint256 minimum);
    error ReentrantCall();

    event TradeExecuted(
        address indexed trader,
        address indexed venue,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 protocolFee,
        uint256 integratorFee,
        address integratorRecipient
    );

    constructor(address feeRecipient_) {
        if (feeRecipient_ == address(0)) revert InvalidFeeRecipient();
        feeRecipient = feeRecipient_;
    }

    /// @notice Runs a venue's exact-input call, takes configured fees in tokenIn,
    ///         and forwards all measured tokenOut to the calling wallet.
    /// @param venueCall Calldata from a chain-specific adapter. It must direct
    ///        tokenOut to this router and spend no more than amountIn minus fees.
    function executeExactIn(ExactInParams calldata params, bytes calldata venueCall)
        external
        returns (uint256 amountOut)
    {
        if (entered != 1) revert ReentrantCall();
        entered = 2;

        if (
            params.tokenIn == address(0) || params.tokenOut == address(0) || params.venue == address(0)
                || params.venue == address(this) || params.tokenIn == params.tokenOut || params.venue.code.length == 0
        ) {
            revert InvalidAddress();
        }
        if (params.amountIn == 0) revert InvalidAmount();
        if (params.protocolFeeBps > MAX_PROTOCOL_FEE_BPS || params.integratorFeeBps > MAX_INTEGRATOR_FEE_BPS) {
            revert InvalidFee();
        }
        if (
            params.integratorFeeBps > 0
                && (params.integratorRecipient == address(0) || params.integratorRecipient == address(this))
        ) {
            revert InvalidIntegratorRecipient();
        }

        uint256 inputBefore = _balanceOf(params.tokenIn, address(this));
        uint256 protocolFee = params.amountIn * params.protocolFeeBps / BPS_DENOMINATOR;
        uint256 integratorFee = params.amountIn * params.integratorFeeBps / BPS_DENOMINATOR;
        uint256 venueAmount = params.amountIn - protocolFee - integratorFee;
        _safeTransferFrom(params.tokenIn, msg.sender, address(this), params.amountIn);
        if (_balanceOf(params.tokenIn, address(this)) != inputBefore + params.amountIn) revert InvalidTokenTransfer();
        if (protocolFee > 0) _safeTransfer(params.tokenIn, feeRecipient, protocolFee);
        if (integratorFee > 0) _safeTransfer(params.tokenIn, params.integratorRecipient, integratorFee);

        amountOut = _executeVenue(params, venueAmount, venueCall);
        uint256 inputAfter = _balanceOf(params.tokenIn, address(this));
        if (inputAfter < inputBefore) revert InvalidTokenTransfer();
        if (inputAfter > inputBefore) _safeTransfer(params.tokenIn, msg.sender, inputAfter - inputBefore);
        if (amountOut < params.amountOutMin) revert InsufficientOutput(amountOut, params.amountOutMin);
        _safeTransfer(params.tokenOut, msg.sender, amountOut);

        _emitTrade(params, amountOut, protocolFee, integratorFee);
        entered = 1;
    }

    function _emitTrade(ExactInParams calldata params, uint256 amountOut, uint256 protocolFee, uint256 integratorFee)
        private
    {
        emit TradeExecuted(
            msg.sender,
            params.venue,
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            amountOut,
            protocolFee,
            integratorFee,
            params.integratorRecipient
        );
    }

    function _executeVenue(ExactInParams calldata params, uint256 venueAmount, bytes calldata venueCall)
        private
        returns (uint256 amountOut)
    {
        uint256 outputBefore = _balanceOf(params.tokenOut, address(this));
        _forceApprove(params.tokenIn, params.venue, venueAmount);
        (bool success, bytes memory result) = params.venue.call(venueCall);
        _forceApprove(params.tokenIn, params.venue, 0);
        if (!success) revert VenueCallFailed(result);
        amountOut = _balanceOf(params.tokenOut, address(this)) - outputBefore;
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenCallFailed(token, 0x23b872dd);
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenCallFailed(token, 0xa9059cbb);
        }
    }

    function _forceApprove(address token, address spender, uint256 amount) private {
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, 0));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenCallFailed(token, 0x095ea7b3);
        }
        (success, result) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, amount));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenCallFailed(token, 0x095ea7b3);
        }
    }

    function _balanceOf(address token, address account) private view returns (uint256) {
        (bool success, bytes memory result) = token.staticcall(abi.encodeWithSelector(0x70a08231, account));
        if (!success || result.length < 32) revert TokenCallFailed(token, 0x70a08231);
        return abi.decode(result, (uint256));
    }
}
