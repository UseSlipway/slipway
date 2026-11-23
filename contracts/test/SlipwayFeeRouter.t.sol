// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SlipwayFeeRouter, IPonsFactoryLookup} from "../src/SlipwayFeeRouter.sol";

interface Vm {
    function deal(address account, uint256 balance) external;
    function expectRevert(bytes4 revertData) external;
    function expectPartialRevert(bytes4 revertData) external;
}

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external { balanceOf[account] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        require(approved >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] = approved - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockPermit2 {
    mapping(address => mapping(address => mapping(address => uint160))) public allowance;
    function approve(address token, address spender, uint160 amount, uint48) external { allowance[msg.sender][token][spender] = amount; }
    function transferFrom(address from, address to, uint160 amount, address token) external {
        uint160 allowed = allowance[from][token][msg.sender];
        require(allowed >= amount, "permit2 allowance");
        allowance[from][token][msg.sender] = allowed - amount;
        require(MockToken(token).transferFrom(from, to, amount), "token pull");
    }
}

contract MockWrappedNative is MockToken {
    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "native transfer");
    }
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    receive() external payable {}
}

contract MockSwapRouter {
    function swap(address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut) external {
        require(MockToken(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pull");
        MockToken(tokenOut).mint(recipient, amountOut);
    }
}

contract ReenteringSwapRouter {
    SlipwayFeeRouter private router;
    bytes private reentryCall;
    bool public reentrySucceeded;

    function configure(SlipwayFeeRouter router_, bytes calldata call_) external {
        router = router_;
        reentryCall = call_;
    }

    function swap(address tokenOut, address recipient, uint256 amountOut) external {
        (reentrySucceeded,) = address(router).call(reentryCall);
        MockToken(tokenOut).mint(recipient, amountOut);
    }
}

contract MockUniversalRouter {
    MockPermit2 private immutable permit2;
    constructor(MockPermit2 permit2_) { permit2 = permit2_; }
    function swap(address tokenIn, address tokenOut, address recipient, uint160 amountIn, uint256 amountOut, bool nativeInput, bool nativeOutput) external payable {
        if (nativeInput) require(msg.value == amountIn, "native input");
        else permit2.transferFrom(msg.sender, address(this), amountIn, tokenIn);
        if (nativeOutput) {
            (bool sent,) = recipient.call{value: amountOut}("");
            require(sent, "native output");
        } else MockToken(tokenOut).mint(recipient, amountOut);
    }
    receive() external payable {}
}

contract MockPonsFactory is IPonsFactoryLookup {
    mapping(address => LaunchedToken) private launched;
    function set(address token, address curve) external {
        launched[token] = LaunchedToken(token, curve, address(1), address(1), address(0), 1 ether, 3000, 60, 0, false, 0, 0, 0, 0, true);
    }
    function setPhase(address token, uint8 phase) external { launched[token].phase = phase; }
    function getLaunchedToken(address token) external view returns (LaunchedToken memory) { return launched[token]; }
}

contract MockPonsCurve {
    MockToken private immutable output;
    uint256 private immutable refundAmount;
    uint256 private immutable outputAmount;

    constructor(MockToken output_, uint256 refundAmount_, uint256 outputAmount_) {
        output = output_;
        refundAmount = refundAmount_;
        outputAmount = outputAmount_;
    }

    function buy(uint256 quoteIn, uint256, address recipient) external payable returns (uint256) {
        require(msg.value == quoteIn, "value");
        (bool refunded,) = msg.sender.call{value: refundAmount}("");
        require(refunded, "refund");
        output.mint(recipient, outputAmount);
        return outputAmount;
    }
}

contract WalletActor {
    function approve(MockToken token, address spender, uint256 amount) external { token.approve(spender, amount); }
    function callRouter(address router, SlipwayFeeRouter.ExactInParams calldata params, bytes calldata data) external {
        SlipwayFeeRouter(payable(router)).executeExactIn(params, data);
    }
}

contract SlipwayFeeRouterTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockToken private tokenIn;
    MockToken private tokenOut;
    MockSwapRouter private swapRouter;
    MockPermit2 private permit2;
    MockUniversalRouter private universalRouter;
    MockWrappedNative private wrappedNative;
    MockPonsFactory private ponsFactory;
    SlipwayFeeRouter private router;

    receive() external payable {}

    function setUp() public {
        tokenIn = new MockToken();
        tokenOut = new MockToken();
        swapRouter = new MockSwapRouter();
        permit2 = new MockPermit2();
        universalRouter = new MockUniversalRouter(permit2);
        wrappedNative = new MockWrappedNative();
        ponsFactory = new MockPonsFactory();
        router = new SlipwayFeeRouter(address(this), address(swapRouter), address(universalRouter), address(permit2), address(wrappedNative), address(ponsFactory));
    }

    function testRejectsArbitraryVenueEvenWhenVictimHasApprovedRouter() external {
        WalletActor victim = new WalletActor();
        WalletActor attacker = new WalletActor();
        tokenIn.mint(address(victim), 100);
        victim.approve(tokenIn, address(router), 100);

        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(tokenIn), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory venueCall = abi.encodeWithSelector(tokenIn.transferFrom.selector, address(victim), address(attacker), 1);
        (bool success,) = address(attacker).call(
            abi.encodeWithSelector(WalletActor.callRouter.selector, address(router), params, venueCall)
        );
        require(!success, "arbitrary venue call unexpectedly succeeded");
        require(tokenIn.balanceOf(address(victim)) == 100, "victim balance changed");
        require(tokenIn.balanceOf(address(attacker)) == 0, "attacker received tokens");
    }

    function testAllowedV3RouteTransfersOnlyMeasuredOutput() external {
        tokenIn.mint(address(this), 100);
        tokenIn.approve(address(router), 100);
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 100,
            amountOutMin: 40, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory venueCall = abi.encodeWithSelector(MockSwapRouter.swap.selector, address(tokenIn), address(tokenOut), address(router), 100, 50);
        uint256 received = router.executeExactIn(params, venueCall);
        require(received == 50, "wrong measured output");
        require(tokenOut.balanceOf(address(this)) == 50, "output not delivered");
        require(tokenIn.allowance(address(router), address(swapRouter)) == 0, "venue approval not cleared");
    }

    function testAllowedV4RouteClearsTokenAndPermit2Allowances() external {
        tokenIn.mint(address(this), 100);
        tokenIn.approve(address(router), 100);
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(universalRouter), amountIn: 100,
            amountOutMin: 40, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory data = abi.encodeCall(MockUniversalRouter.swap, (address(tokenIn), address(tokenOut), address(router), uint160(100), 50, false, false));
        require(router.executeExactInV4(params, data) == 50, "wrong v4 output");
        require(tokenOut.balanceOf(address(this)) == 50, "v4 output not delivered");
        require(tokenIn.allowance(address(router), address(permit2)) == 0, "Permit2 token approval remains");
        require(permit2.allowance(address(router), address(tokenIn), address(universalRouter)) == 0, "Permit2 venue approval remains");
    }

    function testV4NativeInputUnwrapsAndExecutes() external {
        vm.deal(address(wrappedNative), 100);
        wrappedNative.mint(address(this), 100);
        wrappedNative.approve(address(router), 100);
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(wrappedNative), tokenOut: address(tokenOut), venue: address(universalRouter), amountIn: 100,
            amountOutMin: 40, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory data = abi.encodeCall(MockUniversalRouter.swap, (address(wrappedNative), address(tokenOut), address(router), uint160(100), 50, true, false));
        require(router.executeExactInV4Native(params, true, false, data) == 50, "wrong native-input output");
        require(tokenOut.balanceOf(address(this)) == 50, "native-input output not delivered");
        require(address(router).balance == 0, "native input stranded");
    }

    function testV4NativeOutputWrapsAndDelivers() external {
        vm.deal(address(universalRouter), 100);
        tokenIn.mint(address(this), 100);
        tokenIn.approve(address(router), 100);
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(wrappedNative), venue: address(universalRouter), amountIn: 100,
            amountOutMin: 40, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory data = abi.encodeCall(MockUniversalRouter.swap, (address(tokenIn), address(wrappedNative), address(router), uint160(100), 50, false, true));
        require(router.executeExactInV4Native(params, false, true, data) == 50, "wrong native-output amount");
        require(wrappedNative.balanceOf(address(this)) == 50, "wrapped native output not delivered");
        require(address(router).balance == 0, "native output stranded");
    }

    function testPonsPartialFillRefundsNativeInputToTrader() external {
        vm.deal(address(wrappedNative), 1000);
        vm.deal(address(this), 0);
        wrappedNative.mint(address(this), 100);
        wrappedNative.approve(address(router), 100);
        MockToken ponsToken = new MockToken();
        MockPonsCurve curve = new MockPonsCurve(ponsToken, 40, 25);
        ponsFactory.set(address(ponsToken), address(curve));
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(wrappedNative), tokenOut: address(ponsToken), venue: address(curve), amountIn: 100,
            amountOutMin: 20, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory venueCall = abi.encodeWithSignature("buy(uint256,uint256,address)", 100, 20, address(router));
        uint256 received = router.executeExactInPonsNative(params, venueCall);
        require(received == 25, "wrong Pons output");
        require(address(this).balance == 40, "native partial fill was not refunded");
        require(ponsToken.balanceOf(address(this)) == 25, "Pons token not delivered");
    }

    function testV4RejectsWrongVenue() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidVenue.selector);
        router.executeExactInV4(params, "");
    }

    function testV4NativeRejectsWrongVenue() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidVenue.selector);
        router.executeExactInV4Native(params, false, false, "");
    }

    function testV4NativeRejectsUnwrapWithNonWrappedInput() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(universalRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidAddress.selector);
        router.executeExactInV4Native(params, true, false, "");
    }

    function testPonsRejectsWrongCurve() external {
        MockToken ponsToken = new MockToken();
        MockPonsCurve curve = new MockPonsCurve(ponsToken, 0, 1);
        ponsFactory.set(address(ponsToken), address(curve));
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(wrappedNative), tokenOut: address(ponsToken), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidPonsCurve.selector);
        router.executeExactInPonsNative(params, "");
    }

    function testPonsRejectsNonBondingPhase() external {
        MockToken ponsToken = new MockToken();
        MockPonsCurve curve = new MockPonsCurve(ponsToken, 0, 1);
        ponsFactory.set(address(ponsToken), address(curve));
        ponsFactory.setPhase(address(ponsToken), 1);
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(wrappedNative), tokenOut: address(ponsToken), venue: address(curve), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidPonsCurve.selector);
        router.executeExactInPonsNative(params, "");
    }

    function testRejectsProtocolFeeAboveCap() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 21, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidFee.selector);
        router.executeExactIn(params, "");
    }

    function testRejectsZeroAmount() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 0,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidAmount.selector);
        router.executeExactIn(params, "");
    }

    function testRejectsZeroFeeRecipientAtConstruction() external {
        vm.expectRevert(SlipwayFeeRouter.InvalidFeeRecipient.selector);
        new SlipwayFeeRouter(address(0), address(swapRouter), address(universalRouter), address(permit2), address(wrappedNative), address(ponsFactory));
    }

    function testRejectsPonsFactoryWithoutCodeAtConstruction() external {
        vm.expectRevert(SlipwayFeeRouter.InvalidAddress.selector);
        new SlipwayFeeRouter(address(this), address(swapRouter), address(universalRouter), address(permit2), address(wrappedNative), address(0xBEEF));
    }

    function testRejectsZeroTokenAddress() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(0), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidAddress.selector);
        router.executeExactIn(params, "");
    }

    function testRejectsIntegratorFeeAboveCap() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 101, integratorRecipient: address(1)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidFee.selector);
        router.executeExactIn(params, "");
    }

    function testRejectsZeroIntegratorRecipient() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 1, integratorRecipient: address(0)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidIntegratorRecipient.selector);
        router.executeExactIn(params, "");
    }

    function testRejectsRouterAsIntegratorRecipient() external {
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 1,
            amountOutMin: 0, protocolFeeBps: 0, integratorFeeBps: 1, integratorRecipient: address(router)
        });
        vm.expectRevert(SlipwayFeeRouter.InvalidIntegratorRecipient.selector);
        router.executeExactIn(params, "");
    }

    function testRevertsWhenMeasuredOutputIsBelowMinimum() external {
        tokenIn.mint(address(this), 100);
        tokenIn.approve(address(router), 100);
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: 100,
            amountOutMin: 51, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory data = abi.encodeCall(MockSwapRouter.swap, (address(tokenIn), address(tokenOut), address(router), 100, 50));
        vm.expectPartialRevert(SlipwayFeeRouter.InsufficientOutput.selector);
        router.executeExactIn(params, data);
        require(tokenIn.balanceOf(address(this)) == 100, "input transfer not reverted");
        require(tokenOut.balanceOf(address(this)) == 0, "output leaked after revert");
    }

    function testFuzzFeeMath(uint96 rawAmount, uint16 rawProtocolFee, uint16 rawIntegratorFee) external {
        uint256 amountIn = uint256(rawAmount) + 1;
        uint16 protocolFeeBps = rawProtocolFee % (router.MAX_PROTOCOL_FEE_BPS() + 1);
        uint16 integratorFeeBps = rawIntegratorFee % (router.MAX_INTEGRATOR_FEE_BPS() + 1);
        uint256 expectedProtocolFee = amountIn * protocolFeeBps / router.BPS_DENOMINATOR();
        uint256 expectedIntegratorFee = amountIn * integratorFeeBps / router.BPS_DENOMINATOR();
        uint256 expectedVenueAmount = amountIn - expectedProtocolFee - expectedIntegratorFee;
        address integrator = address(0xBEEF);
        uint256 recipientBefore = tokenIn.balanceOf(address(this));

        tokenIn.mint(address(this), amountIn);
        tokenIn.approve(address(router), amountIn);
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(swapRouter), amountIn: amountIn,
            amountOutMin: 1, protocolFeeBps: protocolFeeBps, integratorFeeBps: integratorFeeBps,
            integratorRecipient: integrator
        });
        bytes memory data = abi.encodeCall(MockSwapRouter.swap, (
            address(tokenIn), address(tokenOut), address(router), expectedVenueAmount, 1
        ));
        router.executeExactIn(params, data);

        require(tokenIn.balanceOf(address(this)) == recipientBefore + expectedProtocolFee, "protocol fee math mismatch");
        require(tokenIn.balanceOf(integrator) == expectedIntegratorFee, "integrator fee math mismatch");
        require(tokenIn.balanceOf(address(swapRouter)) == expectedVenueAmount, "venue amount math mismatch");
    }

    function testReentrantVenueCannotEnterRouterTwice() external {
        ReenteringSwapRouter maliciousVenue = new ReenteringSwapRouter();
        SlipwayFeeRouter guardedRouter = new SlipwayFeeRouter(
            address(this), address(maliciousVenue), address(universalRouter), address(permit2), address(wrappedNative), address(ponsFactory)
        );
        SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams({
            tokenIn: address(tokenIn), tokenOut: address(tokenOut), venue: address(maliciousVenue), amountIn: 100,
            amountOutMin: 50, protocolFeeBps: 0, integratorFeeBps: 0, integratorRecipient: address(0)
        });
        bytes memory venueCall = abi.encodeCall(ReenteringSwapRouter.swap, (address(tokenOut), address(guardedRouter), 50));
        bytes memory reentryCall = abi.encodeCall(SlipwayFeeRouter.executeExactIn, (params, venueCall));
        maliciousVenue.configure(guardedRouter, reentryCall);

        tokenIn.mint(address(this), 100);
        tokenIn.approve(address(guardedRouter), 100);
        require(guardedRouter.executeExactIn(params, venueCall) == 50, "outer swap failed");
        require(!maliciousVenue.reentrySucceeded(), "nested swap unexpectedly succeeded");
        require(tokenIn.balanceOf(address(this)) == 100, "unused input was not returned");
        require(tokenOut.balanceOf(address(this)) == 50, "output was not delivered");
        require(tokenIn.balanceOf(address(guardedRouter)) == 0, "input stranded after reentry attempt");
    }
}
