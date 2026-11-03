// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AsterraToken} from "../../src/token/AsterraToken.sol";

contract AsterraTokenV2 is AsterraToken {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract AsterraTokenTest is Test {
    AsterraToken aster;
    address owner = address(0xA11CE);
    address holder = address(0xB0B);

    function setUp() public {
        aster = AsterraToken(
            address(new ERC1967Proxy(address(new AsterraToken()), abi.encodeCall(AsterraToken.initialize, (owner, holder))))
        );
    }

    function test_initialSupplyAndMetadata() public view {
        assertEq(aster.name(), "Asterra");
        assertEq(aster.symbol(), "ASTER");
        assertEq(aster.totalSupply(), 1_000_000_000e18);
        assertEq(aster.balanceOf(holder), 1_000_000_000e18);
        assertEq(aster.owner(), owner);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        aster.initialize(address(this), address(this));
    }

    function test_implementationIsLocked() public {
        AsterraToken impl = new AsterraToken();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(address(this), address(this));
    }

    function test_burnReducesSupply() public {
        vm.prank(holder);
        aster.burn(1e18);
        assertEq(aster.totalSupply(), 1_000_000_000e18 - 1e18);
    }

    function test_onlyOwnerUpgradesAndStateSurvives() public {
        address v2 = address(new AsterraTokenV2());
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, address(this)));
        aster.upgradeToAndCall(v2, "");
        vm.prank(owner);
        aster.upgradeToAndCall(v2, "");
        assertEq(AsterraTokenV2(address(aster)).version(), 2);
        assertEq(aster.balanceOf(holder), 1_000_000_000e18);
    }

    function test_renouncingOwnershipFreezesUpgrades() public {
        vm.prank(owner);
        aster.renounceOwnership();
        address v2 = address(new AsterraTokenV2());
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, owner));
        aster.upgradeToAndCall(v2, "");
    }
}
