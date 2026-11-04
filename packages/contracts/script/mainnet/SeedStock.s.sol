// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {AsterraPositions} from "../../src/periphery/AsterraPositions.sol";
import {IAsterraPositions} from "../../src/interfaces/IAsterraPeriphery.sol";

/// @dev Stateless exact-input v4 swapper the deployer already uses on mainnet (0x059e…9a91). Holds no funds.
interface IV4Swapper {
    function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn, address to) external payable returns (uint256);
}

interface IHubPrice {
    function getPrice(address token) external view returns (uint256 priceE18);
}

/// @notice ASTERRAPOOLS V2.0: opens the first stock pool, TSLA/USDG behind the Asterra hook in ORACLE mode, full range,
///         owned by the deployer. Run after the stock feeds are registered (scripts/mainnet-v2.sh does both).
/// @dev Buys the funds first: ETH -> USDG through the deep native ETH/USDG pool, then USDG -> TSLA through the plain
///      TSLA/USDG 0.3% pool (both external Uniswap v4 pools; ids are checked). The opening price comes from the hub
///      oracle; the hook rejects an initialize away from it or with a stale feed.
///      SIDE_USD_E6: value of each side in USD with 6 decimals. ETH_FOR_USDG: wei swapped to USDG for both sides.
contract SeedStock is Script {
    using StateLibrary for IPoolManager;

    address internal constant DEPLOYER = 0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C;
    IPoolManager internal constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IV4Swapper internal constant SWAPPER = IV4Swapper(0x059EE2a35144208F577D55FDB007c7362E289A91);
    address internal constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    int24 internal constant SPACING = 10;
    bytes32 internal constant ETH_USDG_ID = 0xa791e5169faf703c0b63fd9552c33ec1128a773a00f5dc33a640da62a022cd35;
    bytes32 internal constant TSLA_USDG_ID = 0x8517f8071ae5b831b738052f12125e8e3d6c158b78728aa44ce3b25e5104d32e;

    function run() external {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../sdk/src/addresses/mainnet.json"));
        address usdg = vm.parseJsonAddress(json, ".tokens.USDG.address");
        address hook = vm.parseJsonAddress(json, ".hook");
        IHubPrice hub = IHubPrice(vm.parseJsonAddress(json, ".hub"));
        AsterraPositions positions = AsterraPositions(vm.parseJsonAddress(json, ".positions"));
        uint256 sideUsd = vm.envUint("SIDE_USD_E6");
        uint256 ethForUsdg = vm.envUint("ETH_FOR_USDG");

        uint256 pTsla = hub.getPrice(TSLA);
        uint256 pUsdg = hub.getPrice(usdg);
        uint256 tslaSide = sideUsd * 1e12 * 1e18 / pTsla; // 18 decimals
        uint256 usdgSide = sideUsd * 1e18 / pUsdg; // 6 decimals
        uint256 tslaBuyUsdg = sideUsd * 103 / 100; // USDG spent on TSLA, 3% over for fees

        PoolKey memory ethUsdg =
            PoolKey(Currency.wrap(address(0)), Currency.wrap(usdg), LPFeeLibrary.DYNAMIC_FEE_FLAG, 1, IHooks(0x987E330F00B79864a07FE81dFaC344D0078ABCC0));
        PoolKey memory tslaUsdgExt = PoolKey(Currency.wrap(TSLA), Currency.wrap(usdg), 3000, 60, IHooks(address(0)));
        require(PoolId.unwrap(ethUsdg.toId()) == ETH_USDG_ID, "SeedStock: ETH/USDG key mismatch");
        require(PoolId.unwrap(tslaUsdgExt.toId()) == TSLA_USDG_ID, "SeedStock: TSLA/USDG key mismatch");

        vm.startBroadcast(DEPLOYER);
        SWAPPER.swap{value: ethForUsdg}(ethUsdg, true, ethForUsdg, DEPLOYER);
        require(IERC20(usdg).balanceOf(DEPLOYER) >= tslaBuyUsdg + usdgSide, "SeedStock: not enough USDG, raise ETH_FOR_USDG");
        IERC20(usdg).approve(address(SWAPPER), tslaBuyUsdg);
        SWAPPER.swap(tslaUsdgExt, false, tslaBuyUsdg, DEPLOYER);
        uint256 tsla = IERC20(TSLA).balanceOf(DEPLOYER);
        require(tsla >= tslaSide * 99 / 100, "SeedStock: bought too little TSLA");
        if (tsla > tslaSide) tsla = tslaSide;

        IERC20(TSLA).approve(address(positions), tsla);
        IERC20(usdg).approve(address(positions), usdgSide);
        require(TSLA < usdg, "SeedStock: token order");
        PoolKey memory key = PoolKey(Currency.wrap(TSLA), Currency.wrap(usdg), LPFeeLibrary.DYNAMIC_FEE_FLAG, SPACING, IHooks(hook));
        (uint160 sqrtP,,,) = PM.getSlot0(key.toId());
        if (sqrtP == 0) {
            sqrtP = uint160(_sqrt(FullMath.mulDiv(pTsla * 1e6, 1 << 192, pUsdg * 1e18)));
            PM.initialize(key, sqrtP);
        }
        int24 lo = TickMath.minUsableTick(SPACING);
        int24 hi = TickMath.maxUsableTick(SPACING);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), tsla, usdgSide
        );
        (uint256 tokenId,,) =
            positions.mint(IAsterraPositions.MintParams(key, lo, hi, liq, tsla, usdgSide, DEPLOYER, block.timestamp + 30 minutes));
        vm.stopBroadcast();

        console2.log("pool id");
        console2.logBytes32(PoolId.unwrap(key.toId()));
        console2.log("position", tokenId);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = x;
        uint256 y = (x >> 1) + 1;
        while (y < z) {
            z = y;
            y = (x / y + y) >> 1;
        }
    }
}
