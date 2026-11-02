// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAsterraHub, Venue} from "../../src/interfaces/IAsterraHub.sol";
import {IAsterraBuyback, IAsterraRouter} from "../../src/interfaces/IAsterraPeriphery.sol";
import {AsterraBuyback} from "../../src/buyback/AsterraBuyback.sol";
import {MockToken} from "../credit/mocks/MockToken.sol";
import {MockRouter} from "../credit/mocks/MockRouter.sol";
import {CreditBase} from "../credit/LendingVault.t.sol";

contract AsterraBuybackV2 is AsterraBuyback {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract AsterraBuybackTest is CreditBase {
    AsterraBuyback bb;
    MockRouter router;
    MockToken aster;
    MockToken usd;
    MockToken weth;
    address keeper = address(0xEE9E);

    function setUp() public {
        _deployHub(); // treasury = 0x7EA5
        aster = new MockToken("ASTER", 18);
        usd = new MockToken("tUSD", 6);
        weth = new MockToken("WETH", 18);
        router = new MockRouter(address(weth));
        router.setRate(address(usd), address(aster), 10e30); // 1 tUSD (1e6) -> 10 ASTER (1e19)
        router.setRate(address(weth), address(aster), 20_000e18);
        bb = AsterraBuyback(
            payable(
                address(
                    new ERC1967Proxy(
                        address(new AsterraBuyback()),
                        abi.encodeCall(
                            AsterraBuyback.initialize,
                            (owner, IAsterraHub(address(hub)), IAsterraRouter(address(router)), address(aster))
                        )
                    )
                )
            )
        );
        vm.prank(owner);
        hub.setOperator(keeper, true);
    }

    function _route(address tokenIn) internal view returns (IAsterraRouter.Hop[] memory r) {
        r = new IAsterraRouter.Hop[](1);
        r[0] = IAsterraRouter.Hop(Venue.V4, address(0), tokenIn, address(aster), "");
    }

    function test_initialState() public view {
        (IAsterraHub h, IAsterraRouter r, uint64 cooldown, uint16 tBps) = bb.config();
        assertEq(address(h), address(hub));
        assertEq(address(r), address(router));
        assertEq(cooldown, 1 hours);
        assertEq(tBps, 2000);
        assertEq(bb.aster(), address(aster));
        assertEq(bb.owner(), owner);
    }

    function test_syncEmitsRevenueOnce() public {
        usd.mint(address(bb), 100e6);
        vm.expectEmit(address(bb));
        emit IAsterraBuyback.RevenueReceived(address(usd), 100e6, address(this));
        assertEq(bb.sync(address(usd)), 100e6);
        assertEq(bb.sync(address(usd)), 0);
    }

    function test_executeSplitsTreasuryAndBurns() public {
        usd.mint(address(bb), 100e6);
        uint256 supplyBefore = aster.totalSupply();
        vm.prank(keeper);
        uint256 burned = bb.execute(address(usd), 100e6, _route(address(usd)), 800e18);
        // 20% to treasury, 80 tUSD -> 800 ASTER burned
        assertEq(burned, 800e18);
        assertEq(usd.balanceOf(treasury), 20e6);
        assertEq(usd.balanceOf(address(bb)), 0);
        assertEq(aster.balanceOf(address(bb)), 0);
        assertEq(aster.totalSupply(), supplyBefore); // minted by the router, then burned
        assertEq(bb.totalBurned(), 800e18);
        assertEq(bb.totalBought(address(usd)), 80e6);
        assertEq(bb.lastExecution(address(usd)), block.timestamp);
        assertEq(bb.nextExecution(address(usd)), block.timestamp + 1 hours);
    }

    function test_executeNativeEth() public {
        vm.deal(address(bb), 1e18);
        vm.prank(keeper);
        uint256 burned = bb.execute(address(0), 1e18, _route(address(weth)), 0);
        assertEq(burned, 0.8e18 * 20_000);
        assertEq(treasury.balance, 0.2e18);
        assertEq(address(bb).balance, 0);
    }

    function test_executeAsterBurnsDirectly() public {
        aster.mint(address(bb), 1000e18);
        vm.prank(owner);
        uint256 burned = bb.execute(address(aster), 1000e18, new IAsterraRouter.Hop[](0), 0);
        assertEq(burned, 800e18);
        assertEq(aster.balanceOf(treasury), 200e18);
        assertEq(aster.totalSupply(), 200e18);
    }

    function test_executeRejects() public {
        usd.mint(address(bb), 100e6);
        vm.expectRevert(IAsterraBuyback.NotKeeper.selector);
        bb.execute(address(usd), 100e6, _route(address(usd)), 0);

        vm.startPrank(keeper);
        vm.expectRevert(AsterraBuyback.ZeroAmount.selector);
        bb.execute(address(usd), 0, _route(address(usd)), 0);
        vm.expectRevert(AsterraBuyback.InsufficientBalance.selector);
        bb.execute(address(usd), 101e6, _route(address(usd)), 0);
        vm.expectRevert(AsterraBuyback.BadRoute.selector);
        bb.execute(address(usd), 100e6, _route(address(weth)), 0);
        vm.expectRevert(AsterraBuyback.BadRoute.selector);
        bb.execute(address(usd), 100e6, new IAsterraRouter.Hop[](0), 0);
        vm.expectRevert(IAsterraRouter.Slippage.selector);
        bb.execute(address(usd), 100e6, _route(address(usd)), 801e18);

        bb.execute(address(usd), 50e6, _route(address(usd)), 0);
        vm.expectRevert(IAsterraBuyback.Cooldown.selector);
        bb.execute(address(usd), 10e6, _route(address(usd)), 0);
        vm.warp(block.timestamp + 1 hours);
        bb.execute(address(usd), 10e6, _route(address(usd)), 0);
        vm.stopPrank();
    }

    function test_noTreasuryBurnsEverything() public {
        vm.prank(owner);
        hub.setFeeConfig(address(bb), address(0), 1000);
        usd.mint(address(bb), 10e6);
        vm.prank(keeper);
        assertEq(bb.execute(address(usd), 10e6, _route(address(usd)), 0), 100e18);
    }

    function test_adminOnly() public {
        vm.expectRevert();
        bb.setConfig(IAsterraRouter(address(router)), 0, 0);
        vm.expectRevert();
        bb.rescue(address(usd), address(this), 0);
        vm.startPrank(owner);
        vm.expectRevert(AsterraBuyback.InvalidParams.selector);
        bb.setConfig(IAsterraRouter(address(router)), 0, 10_001);
        bb.setConfig(IAsterraRouter(address(router)), 5 minutes, 0);
        usd.mint(address(bb), 5e6);
        bb.rescue(address(usd), owner, 5e6);
        vm.stopPrank();
        assertEq(usd.balanceOf(owner), 5e6);
    }

    function test_upgradeKeepsState() public {
        usd.mint(address(bb), 10e6);
        vm.prank(keeper);
        bb.execute(address(usd), 10e6, _route(address(usd)), 0);
        address impl = address(new AsterraBuybackV2());
        vm.expectRevert();
        bb.upgradeToAndCall(impl, "");
        vm.prank(owner);
        bb.upgradeToAndCall(impl, "");
        assertEq(AsterraBuybackV2(payable(address(bb))).version(), 2);
        assertEq(bb.totalBurned(), 80e18);
    }

    function testFuzz_splitConserves(uint96 amount, uint16 tBps) public {
        uint256 amt = bound(uint256(amount), 1, 1e30);
        uint16 bps = uint16(bound(tBps, 0, 10_000));
        vm.prank(owner);
        bb.setConfig(IAsterraRouter(address(router)), 0, bps);
        usd.mint(address(bb), amt);
        vm.prank(keeper);
        uint256 burned = bb.execute(address(usd), amt, _route(address(usd)), 0);
        uint256 toTreasury = amt * bps / 10_000;
        assertEq(usd.balanceOf(treasury), toTreasury);
        assertEq(bb.totalBought(address(usd)), amt - toTreasury);
        assertEq(burned, (amt - toTreasury) * 10e30 / 1e18);
        assertEq(usd.balanceOf(address(bb)), 0);
    }
}
