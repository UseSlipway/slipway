// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IWrappedNative {
    function withdraw(uint256 amount) external;
    function deposit() external payable;
}

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

    struct VenueOptions {
        address permit2;
        address wrappedNative;
        bool unwrapInput;
        bool wrapOutput;
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
        return _executeExactIn(params, venueCall, VenueOptions(address(0), address(0), false, false));
    }

    /// @notice Executes a Uniswap v4 Universal Router call through Permit2.
    /// @dev A newly deployed router is required; the already deployed contract has no this selector.
    function executeExactInV4(ExactInParams calldata params, address permit2, bytes calldata venueCall)
        external
        returns (uint256 amountOut)
    {
        if (permit2 == address(0) || permit2.code.length == 0) revert InvalidAddress();
        return _executeExactIn(params, venueCall, VenueOptions(permit2, address(0), false, false));
    }

    function executeExactInV4Native(ExactInParams calldata params, address permit2, address wrappedNative, bool unwrapInput, bool wrapOutput, bytes calldata venueCall)
        external
        returns (uint256 amountOut)
    {
        if (permit2 == address(0) || permit2.code.length == 0 || wrappedNative == address(0) || wrappedNative.code.length == 0) revert InvalidAddress();
        if ((unwrapInput && params.tokenIn != wrappedNative) || (wrapOutput && params.tokenOut != wrappedNative)) revert InvalidAddress();
        return _executeExactIn(params, venueCall, VenueOptions(permit2, wrappedNative, unwrapInput, wrapOutput));
    }

    function _executeExactIn(ExactInParams calldata params, bytes calldata venueCall, VenueOptions memory options)
        private
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

        amountOut = _executeVenue(params, venueAmount, venueCall, options);
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

    function _executeVenue(ExactInParams calldata params, uint256 venueAmount, bytes calldata venueCall, VenueOptions memory options)
        private
        returns (uint256 amountOut)
    {
        uint256 outputBefore = _balanceOf(params.tokenOut, address(this));
        uint256 nativeBefore = address(this).balance;
        if (options.permit2 == address(0)) {
            _forceApprove(params.tokenIn, params.venue, venueAmount);
        } else if (!options.unwrapInput) {
            _grantPermit2(params.tokenIn, options.permit2, params.venue, venueAmount);
        }
        if (options.unwrapInput) IWrappedNative(options.wrappedNative).withdraw(venueAmount);
        (bool success, bytes memory result) = params.venue.call{value: options.unwrapInput ? venueAmount : 0}(venueCall);
        if (options.permit2 == address(0)) {
            _forceApprove(params.tokenIn, params.venue, 0);
        } else if (!options.unwrapInput) {
            _revokePermit2(params.tokenIn, options.permit2, params.venue);
            _forceApprove(params.tokenIn, options.permit2, 0);
        }
        if (!success) revert VenueCallFailed(result);
        if (options.wrapOutput) {
            uint256 nativeOutput = address(this).balance - nativeBefore + (options.unwrapInput ? venueAmount : 0);
            if (nativeOutput > 0) IWrappedNative(options.wrappedNative).deposit{value: nativeOutput}();
        }
        amountOut = _balanceOf(params.tokenOut, address(this)) - outputBefore;
    }

    function _grantPermit2(address token, address permit2, address spender, uint256 amount) private {
        if (amount > type(uint160).max) revert InvalidAmount();
        _forceApprove(token, permit2, amount);
        (bool success, bytes memory result) = permit2.call(
            abi.encodeCall(IPermit2AllowanceTransfer.approve, (token, spender, uint160(amount), uint48(block.timestamp + 120)))
        );
        if (!success || result.length != 0) revert TokenCallFailed(permit2, IPermit2AllowanceTransfer.approve.selector);
    }

    function _revokePermit2(address token, address permit2, address spender) private {
        (bool success, bytes memory result) = permit2.call(
            abi.encodeCall(IPermit2AllowanceTransfer.approve, (token, spender, uint160(0), uint48(0)))
        );
        if (!success || result.length != 0) revert TokenCallFailed(permit2, IPermit2AllowanceTransfer.approve.selector);
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

    receive() external payable {}
}
