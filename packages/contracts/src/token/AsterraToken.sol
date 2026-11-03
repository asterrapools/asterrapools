// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20BurnableUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {ERC20PermitUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

/// @title AsterraToken (ASTER)
/// @notice Protocol token. Fixed supply minted once to `holder` on initialization; no mint function. Burnable
///         (buyback & burn).
/// @dev UUPS proxy; OpenZeppelin's ERC-7201 namespaced storage. Only the owner can upgrade, and renouncing ownership
///      freezes the implementation for good.
contract AsterraToken is ERC20Upgradeable, ERC20BurnableUpgradeable, ERC20PermitUpgradeable, UUPSUpgradeable, Ownable2StepUpgradeable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address holder) external initializer {
        __ERC20_init("Asterra", "ASTER");
        __ERC20Permit_init("Asterra");
        __Ownable_init(owner_);
        _mint(holder, TOTAL_SUPPLY);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
