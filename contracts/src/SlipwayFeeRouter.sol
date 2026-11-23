// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IWrappedNative {
    function withdraw(uint256 amount) external;
    function deposit() external payable;
}

interface IPonsFactoryLookup {
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
}

/// @notice Executes swaps only through immutable, chain-configured venues.
/// @dev Replacing the old unrestricted router is necessary because deployed routers are immutable.
///      Venue adapters must encode this contract as the venue output recipient.
contract SlipwayFeeRouter {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 20;
    uint16 public constant MAX_INTEGRATOR_FEE_BPS = 100;

    address public immutable feeRecipient;
    address public immutable uniswapV3SwapRouter;
    address public immutable universalRouter;
    address public immutable permit2;
    address public immutable wrappedNative;
    address public immutable ponsFactory;
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
        bool usePermit2;
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
    error InvalidVenue();
    error InvalidPonsCurve();
    error NativeRefundFailed();
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

    /// @notice Configures the immutable chain-specific venues and fee recipient.
    /// @dev The deployment script supplies verified addresses for the selected chain.
    constructor(
        address feeRecipient_,
        address uniswapV3SwapRouter_,
        address universalRouter_,
        address permit2_,
        address wrappedNative_,
        address ponsFactory_
    ) {
        if (feeRecipient_ == address(0)) revert InvalidFeeRecipient();
        if (
            uniswapV3SwapRouter_ == address(0) || uniswapV3SwapRouter_.code.length == 0
                || universalRouter_ == address(0) || universalRouter_.code.length == 0
                || permit2_ == address(0) || permit2_.code.length == 0
                || wrappedNative_ == address(0) || wrappedNative_.code.length == 0
        ) revert InvalidAddress();
        if (ponsFactory_ != address(0) && ponsFactory_.code.length == 0) revert InvalidAddress();
        feeRecipient = feeRecipient_;
        uniswapV3SwapRouter = uniswapV3SwapRouter_;
        universalRouter = universalRouter_;
        permit2 = permit2_;
        wrappedNative = wrappedNative_;
        ponsFactory = ponsFactory_;
    }

    /// @notice Executes a Uniswap v3 exact-input call.
    function executeExactIn(ExactInParams calldata params, bytes calldata venueCall)
        external
        returns (uint256 amountOut)
    {
        if (params.venue != uniswapV3SwapRouter) revert InvalidVenue();
        return _executeExactIn(params, venueCall, VenueOptions(false, false, false));
    }

    /// @notice Executes a Uniswap v4 Universal Router call using this router's fixed Permit2.
    function executeExactInV4(ExactInParams calldata params, bytes calldata venueCall)
        external
        returns (uint256 amountOut)
    {
        if (params.venue != universalRouter) revert InvalidVenue();
        return _executeExactIn(params, venueCall, VenueOptions(true, false, false));
    }

    /// @notice Executes a native-asset Uniswap v4 call using fixed chain contracts.
    function executeExactInV4Native(
        ExactInParams calldata params,
        bool unwrapInput,
        bool wrapOutput,
        bytes calldata venueCall
    ) external returns (uint256 amountOut) {
        if (params.venue != universalRouter) revert InvalidVenue();
        if ((unwrapInput && params.tokenIn != wrappedNative) || (wrapOutput && params.tokenOut != wrappedNative)) {
            revert InvalidAddress();
        }
        return _executeExactIn(params, venueCall, VenueOptions(true, unwrapInput, wrapOutput));
    }

    /// @notice Executes a Pons bonding-curve buy for the exact token registered by its factory.
    function executeExactInPonsNative(ExactInParams calldata params, bytes calldata venueCall)
        external
        returns (uint256 amountOut)
    {
        if (
            ponsFactory == address(0) || params.tokenIn != wrappedNative || params.tokenOut == address(0)
                || params.venue == address(0)
        ) revert InvalidPonsCurve();
        IPonsFactoryLookup.LaunchedToken memory launched;
        try IPonsFactoryLookup(ponsFactory).getLaunchedToken(params.tokenOut) returns (
            IPonsFactoryLookup.LaunchedToken memory result
        ) {
            launched = result;
        } catch {
            revert InvalidPonsCurve();
        }
        if (!launched.exists || launched.token != params.tokenOut || launched.curve != params.venue || launched.phase != 0) {
            revert InvalidPonsCurve();
        }
        return _executeExactIn(params, venueCall, VenueOptions(false, true, false));
    }

    function _executeExactIn(ExactInParams calldata params, bytes calldata venueCall, VenueOptions memory options)
        private
        returns (uint256 amountOut)
    {
        if (entered != 1) revert ReentrantCall();
        entered = 2;

        if (
            params.tokenIn == address(0) || params.tokenOut == address(0) || params.venue == address(0)
                || params.venue == address(this) || params.venue.code.length == 0 || params.tokenIn == params.tokenOut
        ) revert InvalidAddress();
        if (params.amountIn == 0) revert InvalidAmount();
        if (params.protocolFeeBps > MAX_PROTOCOL_FEE_BPS || params.integratorFeeBps > MAX_INTEGRATOR_FEE_BPS) {
            revert InvalidFee();
        }
        if (
            params.integratorFeeBps > 0
                && (params.integratorRecipient == address(0) || params.integratorRecipient == address(this))
        ) revert InvalidIntegratorRecipient();

        uint256 inputBefore = _balanceOf(params.tokenIn, address(this));
        uint256 nativeBefore = address(this).balance;
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

        uint256 nativeRefund = address(this).balance - nativeBefore;
        if (nativeRefund > 0) {
            (bool refunded,) = msg.sender.call{value: nativeRefund}("");
            if (!refunded) revert NativeRefundFailed();
        }
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
        if (options.unwrapInput) {
            IWrappedNative(wrappedNative).withdraw(venueAmount);
        } else if (options.usePermit2) {
            _grantPermit2(params.tokenIn, params.venue, venueAmount);
        } else if (!options.usePermit2) {
            _forceApprove(params.tokenIn, params.venue, venueAmount);
        }
        (bool success, bytes memory result) = params.venue.call{value: options.unwrapInput ? venueAmount : 0}(venueCall);
        if (!options.unwrapInput && options.usePermit2) {
            _revokePermit2(params.tokenIn, params.venue);
            _forceApprove(params.tokenIn, permit2, 0);
        } else if (!options.unwrapInput && !options.usePermit2) {
            _forceApprove(params.tokenIn, params.venue, 0);
        }
        if (!success) revert VenueCallFailed(result);
        if (options.wrapOutput) {
            uint256 nativeOutput = address(this).balance - nativeBefore;
            if (nativeOutput > 0) IWrappedNative(wrappedNative).deposit{value: nativeOutput}();
        }
        amountOut = _balanceOf(params.tokenOut, address(this)) - outputBefore;
    }

    function _grantPermit2(address token, address spender, uint256 amount) private {
        if (amount > type(uint160).max) revert InvalidAmount();
        _forceApprove(token, permit2, amount);
        (bool success, bytes memory result) = permit2.call(
            abi.encodeCall(IPermit2AllowanceTransfer.approve, (token, spender, uint160(amount), uint48(block.timestamp + 120)))
        );
        if (!success || result.length != 0) revert TokenCallFailed(permit2, IPermit2AllowanceTransfer.approve.selector);
    }

    function _revokePermit2(address token, address spender) private {
        (bool success, bytes memory result) = permit2.call(
            abi.encodeCall(IPermit2AllowanceTransfer.approve, (token, spender, uint160(0), uint48(0)))
        );
        if (!success || result.length != 0) revert TokenCallFailed(permit2, IPermit2AllowanceTransfer.approve.selector);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TokenCallFailed(token, 0x23b872dd);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TokenCallFailed(token, 0xa9059cbb);
    }

    function _forceApprove(address token, address spender, uint256 amount) private {
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, 0));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TokenCallFailed(token, 0x095ea7b3);
        (success, result) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, amount));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TokenCallFailed(token, 0x095ea7b3);
    }

    function _balanceOf(address token, address account) private view returns (uint256) {
        (bool success, bytes memory result) = token.staticcall(abi.encodeWithSelector(0x70a08231, account));
        if (!success || result.length < 32) revert TokenCallFailed(token, 0x70a08231);
        return abi.decode(result, (uint256));
    }

    /// @notice Accepts native value returned by a configured venue or unwrapped WETH.
    /// @dev Direct donations are not recoverable and are excluded from later trade deltas.
    receive() external payable {}
}
