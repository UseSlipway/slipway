// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SlipwayFeeRouter, IPonsFactoryLookup} from "../src/SlipwayFeeRouter.sol";

contract InvariantToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external { balanceOf[account] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount && balanceOf[from] >= amount, "transferFrom");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract InvariantPermit2 { function approve(address, address, uint160, uint48) external {} }
contract InvariantWrapped is InvariantToken {
    function withdraw(uint256 amount) external { balanceOf[msg.sender] -= amount; (bool ok,) = msg.sender.call{value: amount}(""); require(ok); }
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    receive() external payable {}
}
contract InvariantFactory is IPonsFactoryLookup {
    function getLaunchedToken(address) external pure returns (LaunchedToken memory) { return LaunchedToken(address(0),address(0),address(0),address(0),address(0),0,0,0,0,false,0,0,0,0,false); }
}
contract InvariantVenue {
    function swap(InvariantToken input, InvariantToken output, address recipient, uint256 amount) external {
        input.transferFrom(msg.sender, address(this), amount);
        output.mint(recipient, amount);
    }
}
contract InvariantActor {
    function approve(InvariantToken token, address spender, uint256 amount) external { token.approve(spender, amount); }
    function attempt(SlipwayFeeRouter router, SlipwayFeeRouter.ExactInParams calldata params, bytes calldata data) external {
        try router.executeExactIn(params, data) {} catch {}
    }
}

contract SlipwayFeeRouterHandler {
    InvariantToken public immutable input;
    InvariantToken public immutable output;
    InvariantVenue public immutable venue;
    SlipwayFeeRouter public immutable router;
    InvariantActor public immutable victim;
    InvariantActor public immutable attacker;

    constructor() {
        input = new InvariantToken();
        output = new InvariantToken();
        venue = new InvariantVenue();
        InvariantWrapped wrapped = new InvariantWrapped();
        InvariantFactory factory = new InvariantFactory();
        router = new SlipwayFeeRouter(address(this), address(venue), address(venue), address(new InvariantPermit2()), address(wrapped), address(factory));
        victim = new InvariantActor();
        attacker = new InvariantActor();
        input.mint(address(victim), type(uint128).max);
        victim.approve(input, address(router), type(uint128).max);
    }

    function act(uint256 amountSeed, uint256 feeSeed, uint256 minimumSeed, uint8 mode) external {
        if (mode & 1 == 0) {
            uint256 amount = amountSeed % 1e24 + 1;
            uint16 protocolFee = uint16(feeSeed % 21);
            uint16 integratorFee = uint16((feeSeed >> 8) % 101);
            uint256 minOutput = minimumSeed % (amount + 1);
            input.mint(address(this), amount);
            input.approve(address(router), amount);
            SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams(
                address(input), address(output), address(venue), amount, minOutput, protocolFee, integratorFee,
                integratorFee == 0 ? address(0) : address(0xBEEF)
            );
            bytes memory data = abi.encodeCall(InvariantVenue.swap, (input, output, address(router), amount - amount * (protocolFee + integratorFee) / 10_000));
            try router.executeExactIn(params, data) {} catch {}
        } else {
            SlipwayFeeRouter.ExactInParams memory params = SlipwayFeeRouter.ExactInParams(
                address(input), address(output), address(input), 1, 0, 0, 0, address(0)
            );
            bytes memory data = abi.encodeCall(InvariantToken.transferFrom, (address(victim), address(attacker), amountSeed % 1e18 + 1));
            attacker.attempt(router, params, data);
        }
    }
}

contract SlipwayFeeRouterInvariantTest {
    SlipwayFeeRouterHandler private handler;
    address[] private targets;

    function setUp() public {
        handler = new SlipwayFeeRouterHandler();
        targets.push(address(handler));
    }

    function targetContracts() external view returns (address[] memory) { return targets; }

    function invariant_noCallerCanMoveVictimFundsAndRouterHasNoTokenDust() public view {
        require(handler.input().balanceOf(address(handler.victim())) == type(uint128).max, "victim input moved");
        require(handler.input().balanceOf(address(handler.attacker())) == 0, "attacker received victim funds");
        require(handler.input().balanceOf(address(handler.router())) == 0, "input stranded in router");
        require(handler.output().balanceOf(address(handler.router())) == 0, "output stranded in router");
    }

    function invariant_allowedVenueAllowanceIsCleared() public view {
        require(handler.input().allowance(address(handler.router()), address(handler.venue())) == 0, "venue allowance remains");
    }
}
