// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {IDLMMFactory, IDLMMPool} from "../../src/interfaces/IAsterraPools.sol";
import {BinMath} from "../../src/dlmm/BinMath.sol";
import {SeedAsterPools, IWETH9} from "./SeedAsterPools.s.sol";

/// @notice The first two DLMM pools: WETH/ASTER and USDG/ASTER, each opened at the market price and seeded with SIDE_USD_E6
///         of each token over 21 bins (10 of ASTER below the price, the active bin with both, 10 of WETH or USDG above).
/// @dev Reuses SeedAsterPools for the ASTER price (external ETH/ASTER and ETH/USDG pools) and the Universal Router buys.
///      DLMM needs no hub feed, so ASTER pairs work. ASTER is token1 in both pairs. RESERVE_WEI: ETH that must stay.
contract SeedAsterDlmm is SeedAsterPools {
    uint16 internal constant BIN_STEP = 100; // 1% a bin: the 21 bins span about ±10%
    uint256 internal constant HALF = 10; // bins on each side of the active bin
    // the live ETH/ASTER hook took about 8% on 2026-11-09 while forge's fork shows less, so 5% made the buy revert
    uint256 internal constant ASTER_BUY_MARGIN_BPS = 1500;

    function run() external override {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../sdk/src/addresses/mainnet.json"));
        usdg = vm.parseJsonAddress(json, ".tokens.USDG.address");
        weth = vm.parseJsonAddress(json, ".weth");
        IDLMMFactory f = IDLMMFactory(vm.parseJsonAddress(json, ".dlmmFactory"));
        side = vm.envUint("SIDE_USD_E6");
        require(weth < ASTER && usdg < ASTER, "SeedAsterDlmm: token order");

        Market memory m = _market();
        uint256 ethUsdE18 = FullMath.mulDiv(FullMath.mulDiv(m.sqrtEthUsdg, m.sqrtEthUsdg, Q96), 1e30, Q96);
        uint256 asterSide = _tokens(m.asterUsdE18);
        uint256 wethSide = _tokens(ethUsdE18);
        // raw ASTER per raw token0, Q128: per wei straight from ETH/ASTER, per USDG raw as the ratio of the two ETH prices
        uint256 wethPriceX128 = FullMath.mulDiv(m.sqrtEthAster, m.sqrtEthAster, 1 << 64);
        uint256 r = FullMath.mulDiv(m.sqrtEthAster, 1 << 64, m.sqrtEthUsdg);
        uint256 usdgPriceX128 = r * r;

        uint256 asterBuy = _short(2 * asterSide, IERC20(ASTER).balanceOf(DEPLOYER));
        uint256 usdgBuy = _short(side, IERC20(usdg).balanceOf(DEPLOYER));
        uint256 wethBuy = _short(wethSide, IERC20(weth).balanceOf(DEPLOYER));
        uint256 ethForAster = _weiFor(asterBuy, m.sqrtEthAster) * (10_000 + ASTER_BUY_MARGIN_BPS) / 10_000;
        uint256 ethForUsdg = _weiFor(usdgBuy, m.sqrtEthUsdg) * (10_000 + USDG_MARGIN_BPS) / 10_000;
        // 2.3M gas here vs 6.5M in SeedAsterPools: half its buffer still covers forge's worst case (0.000091 ETH)
        uint256 need = ethForAster + ethForUsdg + wethBuy + GAS_WEI / 2 + vm.envUint("RESERVE_WEI");
        require(DEPLOYER.balance >= need, "SeedAsterDlmm: not enough ETH, lower SIDE_USD_E6");
        console2.log("ETH to ASTER", ethForAster);
        console2.log("ETH to USDG", ethForUsdg);
        console2.log("ETH to WETH", wethBuy);
        console2.log("ETH needed with gas and reserve", need);

        vm.startBroadcast(DEPLOYER);
        if (usdgBuy > 0) _swap(_ethKey(usdg, ETH_USDG_HOOK, LPFeeLibrary.DYNAMIC_FEE_FLAG, 1), ethForUsdg, usdgBuy, ethForUsdg);
        if (asterBuy > 0) _swap(_ethKey(ASTER, ETH_ASTER_HOOK, 0, 200), ethForAster, asterBuy, ethForAster);
        if (wethBuy > 0) IWETH9(weth).deposit{value: wethBuy}();
        _dlmmPool(f, weth, wethSide, asterSide, wethPriceX128);
        _dlmmPool(f, usdg, side, asterSide, usdgPriceX128);
        vm.stopBroadcast();

        console2.log("Deployer ETH after", DEPLOYER.balance);
    }

    /// @dev Creates token0/ASTER at the bin holding `priceX128` and spreads amount0/amount1 evenly over 21 bins.
    function _dlmmPool(IDLMMFactory f, address token0, uint256 amount0, uint256 amount1, uint256 priceX128) internal {
        require(f.getPool(token0, ASTER, BIN_STEP) == address(0), "SeedAsterDlmm: the pair already has this DLMM pool");
        int24 active = _binFor(priceX128);
        address pool = f.createPool(IDLMMFactory.CreateParams(token0, ASTER, BIN_STEP, active, DAMM_BASE_FEE, DAMM_MAX_FEE));
        require(IDLMMPool(pool).activeId() == active, "SeedAsterDlmm: active bin");
        uint256 per0 = amount0 / (HALF + 1);
        uint256 per1 = amount1 / (HALF + 1);
        int24[] memory ids = new int24[](2 * HALF + 1);
        uint256[] memory a0 = new uint256[](2 * HALF + 1);
        uint256[] memory a1 = new uint256[](2 * HALF + 1);
        for (uint256 i; i < ids.length; i++) {
            int24 id = active - int24(int256(HALF)) + int24(int256(i));
            ids[i] = id;
            if (id >= active) a0[i] = per0;
            if (id <= active) a1[i] = per1;
        }
        IERC20(token0).approve(pool, per0 * (HALF + 1));
        IERC20(ASTER).approve(pool, per1 * (HALF + 1));
        IDLMMPool(pool).addLiquidity(ids, a0, a1, DEPLOYER, block.timestamp + 30 minutes);
        console2.log("DLMM pool", pool);
        console2.log("token0", token0);
        console2.log("active bin", int256(active));
    }

    /// @dev Largest bin id whose price is at or below `priceX128` (bin price grows with the id).
    ///      ±6900 keeps 1.01^id inside BinMath's [2^-100, 2^100].
    function _binFor(uint256 priceX128) internal pure returns (int24) {
        int24 lo = -6900;
        int24 hi = 6900;
        while (lo < hi) {
            int24 mid = lo + (hi - lo + 1) / 2;
            if (BinMath.getPriceX128(mid, BIN_STEP) <= priceX128) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }
}
