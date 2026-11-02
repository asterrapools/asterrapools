// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title AsterraToken (ASTER)
/// @notice Protocol token. Fixed supply minted once to `holder`; no owner, no mint. Burnable (buyback & burn).
contract AsterraToken is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    constructor(address holder) ERC20("Asterra", "ASTER") ERC20Permit("Asterra") {
        _mint(holder, TOTAL_SUPPLY);
    }
}
