// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SlipwayFeeRouter, IPonsFactoryLookup} from "../src/SlipwayFeeRouter.sol";

interface Vm {
    function deal(address account, uint256 balance) external;
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
    function approve(address, address, uint160, uint48) external {}
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

contract MockPonsFactory is IPonsFactoryLookup {
    mapping(address => LaunchedToken) private launched;
    function set(address token, address curve) external {
        launched[token] = LaunchedToken(token, curve, address(1), address(1), address(0), 1 ether, 3000, 60, 0, false, 0, 0, 0, 0, true);
    }
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
    MockWrappedNative private wrappedNative;
    MockPonsFactory private ponsFactory;
    SlipwayFeeRouter private router;

    receive() external payable {}

    function setUp() public {
        tokenIn = new MockToken();
        tokenOut = new MockToken();
        swapRouter = new MockSwapRouter();
        permit2 = new MockPermit2();
        wrappedNative = new MockWrappedNative();
        ponsFactory = new MockPonsFactory();
        router = new SlipwayFeeRouter(address(this), address(swapRouter), address(swapRouter), address(permit2), address(wrappedNative), address(ponsFactory));
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
}
