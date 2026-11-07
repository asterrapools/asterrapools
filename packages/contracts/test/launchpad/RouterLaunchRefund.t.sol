// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {AsterraFixture} from "../utils/AsterraFixture.sol";
import {AsterraLaunchpad} from "../../src/launchpad/AsterraLaunchpad.sol";
import {AsterraLaunchToken} from "../../src/launchpad/AsterraLaunchToken.sol";
import {IAsterraRouter} from "../../src/interfaces/IAsterraPeriphery.sol";
import {IAsterraHub, Venue} from "../../src/interfaces/IAsterraHub.sol";

/// A buy through the router that is larger than what the curve still needs: the launchpad only pulls what it uses, and the
/// router sends the rest back to the caller instead of keeping it.
contract RouterLaunchRefundTest is AsterraFixture {
    AsterraLaunchpad internal lp;
    address internal token;
    address internal buyer = makeAddr("buyer");

    function setUp() public {
        setUpAsterra();
        UpgradeableBeacon beacon = new UpgradeableBeacon(address(new AsterraLaunchToken()), owner);
        lp = AsterraLaunchpad(
            payable(
                address(
                    new ERC1967Proxy(
                        address(new AsterraLaunchpad()),
                        abi.encodeCall(
                            AsterraLaunchpad.initialize,
                            (owner, IAsterraHub(address(hub)), address(weth), address(beacon), address(manager), address(positions), address(hook))
                        )
                    )
                )
            )
        );
        vm.prank(owner);
        hub.setRegistrar(address(lp), true);
        vm.prank(alice);
        token = lp.create("Comet", "COMET", "", 0);
    }

    function _buy() internal view returns (IAsterraRouter.Hop[] memory h) {
        h = new IAsterraRouter.Hop[](1);
        h[0] = IAsterraRouter.Hop(Venue.LAUNCH, address(lp), address(weth), token, abi.encode(token));
    }

    function test_ethBuyPastTheCurveGetsTheChangeBackInEth() public {
        (uint256 used,, uint256 left) = lp.quoteBuy(token, 10 ether);
        assertLt(used, 10 ether);
        vm.deal(buyer, 10 ether);

        vm.expectEmit(true, true, false, true, address(router));
        emit IAsterraRouter.RouteExecuted(buyer, buyer, address(weth), token, used, left, 1);
        vm.prank(buyer);
        uint256 out = router.swap{value: 10 ether}(_buy(), 10 ether, left, buyer, block.timestamp, false);

        assertEq(out, left);
        assertTrue(lp.launch(token).graduated);
        assertEq(buyer.balance, 10 ether - used, "change in ETH");
        assertEq(weth.balanceOf(buyer), 0);
        assertEq(weth.balanceOf(address(router)), 0, "router keeps no WETH");
        assertEq(address(router).balance, 0, "router keeps no ETH");
    }

    function test_wethBuyPastTheCurveGetsTheChangeBackInWeth() public {
        (uint256 used,,) = lp.quoteBuy(token, 10 ether);
        weth.mint(buyer, 10 ether);
        vm.startPrank(buyer);
        weth.approve(address(router), 10 ether);
        router.swap(_buy(), 10 ether, 0, buyer, block.timestamp, false);
        vm.stopPrank();

        assertTrue(lp.launch(token).graduated);
        assertEq(weth.balanceOf(buyer), 10 ether - used);
        assertEq(weth.balanceOf(address(router)), 0);
    }

    function test_buyInsideTheCurveSpendsItAll() public {
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        router.swap{value: 1 ether}(_buy(), 1 ether, 0, buyer, block.timestamp, false);

        assertFalse(lp.launch(token).graduated);
        assertEq(buyer.balance, 0);
        assertEq(weth.balanceOf(address(router)), 0);
    }

    /// USD -> WETH (v4) -> COMET: the WETH the curve did not take is returned as WETH; the USD leg is spent in full.
    function test_twoHopBuyReturnsTheUnusedMiddleToken() public {
        PoolKey memory k = keyFor(address(weth), address(usd), 10);
        bool wethIs0 = Currency.unwrap(k.currency0) == address(weth);
        manager.initialize(k, wethIs0 ? sqrtPriceFor(2400e18, 18, 6) : sqrtPriceFor(uint256(1e36) / 2400e18, 6, 18));
        mintFullRange(alice, k, wethIs0 ? 100e18 : 240_000e6, wethIs0 ? 240_000e6 : 100e18);

        IAsterraRouter.Hop[] memory h = new IAsterraRouter.Hop[](2);
        h[0] = v4Hop(k, address(usd), address(weth));
        h[1] = _buy()[0];
        uint256 usdIn = 20_000e6; // about 8 ETH, the curve needs about 4.4
        usd.mint(buyer, usdIn);
        vm.startPrank(buyer);
        usd.approve(address(router), usdIn);
        router.swap(h, usdIn, 0, buyer, block.timestamp, false);
        vm.stopPrank();

        assertTrue(lp.launch(token).graduated);
        assertEq(usd.balanceOf(buyer), 0, "the USD leg is spent in full");
        assertGt(weth.balanceOf(buyer), 3 ether, "unused WETH comes back");
        assertEq(weth.balanceOf(address(router)), 0);
        assertEq(IERC20(token).balanceOf(address(router)), 0);
    }
}
