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
import {IDAMMFactory, IDAMMPool} from "../../src/interfaces/IAsterraPools.sol";

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

/// @dev Stateless exact-input v4 swapper the deployer already uses on mainnet (0x059e…9a91). Holds no funds.
interface IV4Swapper {
    function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn, address to) external payable returns (uint256);
}

interface IWETH9 {
    function deposit() external payable;
}

interface IHubPrice {
    function getPrice(address token) external view returns (uint256 priceE18);
}

/// @notice Five new ASTER pools: WETH/ASTER behind the Asterra hook, and USDG/ASTER, TSLA/ASTER, AAPL/ASTER, NVDA/ASTER as
///         DAMM pools. Every pool is opened at the market price and seeded with SIDE_USD_E6 of each token, owned by the deployer.
/// @dev ASTER has no hub feed, so the hook would refuse a stock/ASTER pool (its oracle mode needs both feeds): stock pairs use
///      DAMM, which has no oracle. The ASTER price comes from the external ETH/ASTER and ETH/USDG pools (ids checked), stock
///      prices from the hub oracle. Funds are bought first: ETH -> USDG and ETH -> ASTER through Uniswap's Universal Router
///      (on-chain minimum output), USDG -> each stock through its external 0.3% USDG pool.
///      SIDE_USD_E6: USD value of each side, 6 decimals. RANGE_TICKS: half width of the hook position (2230 = about ±25%).
///      DAMM positions span half to double the opening price. RESERVE_WEI: ETH that must stay in the wallet.
contract SeedAsterPools is Script {
    using StateLibrary for IPoolManager;

    struct ExactInputSingle {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        uint256 minHopPriceX36; // Robinhood Chain's router fork adds this field; 0 turns it off
        bytes hookData;
    }

    struct Market {
        uint160 sqrtEthUsdg; // USDG raw per wei, sqrt Q96
        uint160 sqrtEthAster; // ASTER raw per wei, sqrt Q96
        uint256 asterUsdE18; // USD per whole ASTER
    }

    address internal constant DEPLOYER = 0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C;
    address internal constant ASTER = 0x8c4be7763F446DF2b5A8c331e7CCF497e7F78b1d;
    address internal constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address internal constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    IPoolManager internal constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IUniversalRouter internal constant ROUTER = IUniversalRouter(0x8876789976dEcBfCbBbe364623C63652db8C0904);
    IV4Swapper internal constant SWAPPER = IV4Swapper(0x059EE2a35144208F577D55FDB007c7362E289A91);
    int24 internal constant SPACING = 10;
    uint256 internal constant Q96 = 1 << 96;
    bytes32 internal constant ETH_USDG_ID = 0xa791e5169faf703c0b63fd9552c33ec1128a773a00f5dc33a640da62a022cd35;
    bytes32 internal constant ETH_ASTER_ID = 0xa8df68b399b7ef2a821c7efb582cedf2a19b842780ae7e0a36681d597882c1bc;
    address internal constant ETH_USDG_HOOK = 0x987E330F00B79864a07FE81dFaC344D0078ABCC0;
    address internal constant ETH_ASTER_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    uint256 internal constant USDG_MARGIN_BPS = 100; // ETH spent over the spot value of what is bought
    uint256 internal constant ASTER_MARGIN_BPS = 500; // ASTER costs about 2.97% a swap
    uint256 internal constant STOCK_MARGIN_BPS = 400; // USDG spent on a stock: 0.3% fee plus price impact
    uint256 internal constant GAS_WEI = 200_000_000_000_000; // 0.0002 ETH, about 4x the real gas of the whole run
    uint24 internal constant DAMM_BASE_FEE = 3000; // the Create Pool default (0.3%)
    uint24 internal constant DAMM_MAX_FEE = 50_000;

    address internal usdg;
    address internal weth;
    uint256 internal side;

    function run() external virtual {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../sdk/src/addresses/mainnet.json"));
        usdg = vm.parseJsonAddress(json, ".tokens.USDG.address");
        weth = vm.parseJsonAddress(json, ".weth");
        IDAMMFactory damm = IDAMMFactory(vm.parseJsonAddress(json, ".dammFactory"));
        IHubPrice hub = IHubPrice(vm.parseJsonAddress(json, ".hub"));
        side = vm.envUint("SIDE_USD_E6");
        require(weth < ASTER && usdg < ASTER, "SeedAsterPools: token order");

        Market memory m = _market();
        uint256 ethUsdE18 = FullMath.mulDiv(FullMath.mulDiv(m.sqrtEthUsdg, m.sqrtEthUsdg, Q96), 1e30, Q96);
        uint256 asterSide = _tokens(m.asterUsdE18);
        address[3] memory stocks = [TSLA, AAPL, NVDA];
        uint256[3] memory stockUsd;
        uint256[3] memory stockSide;
        for (uint256 i; i < 3; i++) {
            stockUsd[i] = hub.getPrice(stocks[i]);
            stockSide[i] = _tokens(stockUsd[i]);
        }
        uint256 wethSide = _tokens(ethUsdE18);

        // what to buy: ASTER for five pools, USDG for the USDG pool and the three stock purchases
        uint256 usdgNeed = side + 3 * (side * (10_000 + STOCK_MARGIN_BPS) / 10_000);
        uint256 asterBuy = _short(5 * asterSide, IERC20(ASTER).balanceOf(DEPLOYER));
        uint256 usdgBuy = _short(usdgNeed, IERC20(usdg).balanceOf(DEPLOYER));
        uint256 ethForAster = _weiFor(asterBuy, m.sqrtEthAster) * (10_000 + ASTER_MARGIN_BPS) / 10_000;
        uint256 ethForUsdg = _weiFor(usdgBuy, m.sqrtEthUsdg) * (10_000 + USDG_MARGIN_BPS) / 10_000;
        uint256 need = ethForAster + ethForUsdg + wethSide + GAS_WEI + vm.envUint("RESERVE_WEI");
        require(DEPLOYER.balance >= need, "SeedAsterPools: not enough ETH, lower SIDE_USD_E6");
        console2.log("ETH to ASTER", ethForAster);
        console2.log("ETH to USDG", ethForUsdg);
        console2.log("ETH to WETH", wethSide);
        console2.log("ETH needed with gas and reserve", need);

        // hook pool WETH/ASTER: ASTER per wei is the price the external ETH/ASTER pool already shows
        PoolKey memory hookKey = PoolKey(
            Currency.wrap(weth), Currency.wrap(ASTER), LPFeeLibrary.DYNAMIC_FEE_FLAG, SPACING, IHooks(vm.parseJsonAddress(json, ".hook"))
        );

        vm.startBroadcast(DEPLOYER);
        if (usdgBuy > 0) _swap(_ethKey(usdg, ETH_USDG_HOOK, LPFeeLibrary.DYNAMIC_FEE_FLAG, 1), ethForUsdg, usdgBuy, ethForUsdg);
        if (asterBuy > 0) _swap(_ethKey(ASTER, ETH_ASTER_HOOK, 0, 200), ethForAster, asterBuy, ethForAster);
        for (uint256 i; i < 3; i++) _buyStock(stocks[i], stockSide[i]);
        IWETH9(weth).deposit{value: wethSide}();

        _hookPool(hookKey, m.sqrtEthAster, wethSide, asterSide, AsterraPositions(vm.parseJsonAddress(json, ".positions")));
        _dammPool(damm, usdg, ASTER, 1e18, 6, m.asterUsdE18, 18, side, asterSide);
        for (uint256 i; i < 3; i++) {
            _dammPool(damm, stocks[i], ASTER, stockUsd[i], 18, m.asterUsdE18, 18, stockSide[i], asterSide);
        }
        vm.stopBroadcast();

        console2.log("Deployer ETH after", DEPLOYER.balance);
    }

    function _market() internal view returns (Market memory m) {
        PoolKey memory ethUsdg = _ethKey(usdg, ETH_USDG_HOOK, LPFeeLibrary.DYNAMIC_FEE_FLAG, 1);
        PoolKey memory ethAster = _ethKey(ASTER, ETH_ASTER_HOOK, 0, 200);
        require(PoolId.unwrap(ethUsdg.toId()) == ETH_USDG_ID, "SeedAsterPools: ETH/USDG key mismatch");
        require(PoolId.unwrap(ethAster.toId()) == ETH_ASTER_ID, "SeedAsterPools: ETH/ASTER key mismatch");
        (m.sqrtEthUsdg,,,) = PM.getSlot0(ethUsdg.toId());
        (m.sqrtEthAster,,,) = PM.getSlot0(ethAster.toId());
        // USD per whole ASTER = (USDG raw per ASTER raw) * 1e12 USD per raw ratio, in E18
        uint256 x = FullMath.mulDiv(m.sqrtEthUsdg, 1e24, m.sqrtEthAster); // sqrt(USDG raw per ASTER raw) * 1e24
        m.asterUsdE18 = x * x / 1e18;
        require(m.asterUsdE18 > 0, "SeedAsterPools: no ASTER price");
    }

    function _ethKey(address token, address hooks, uint24 fee, int24 spacing) internal pure returns (PoolKey memory) {
        return PoolKey(Currency.wrap(address(0)), Currency.wrap(token), fee, spacing, IHooks(hooks));
    }

    /// @dev Raw units (18 decimals) of a token worth `side` USD at `usdE18` USD per whole token.
    function _tokens(uint256 usdE18) internal view returns (uint256) {
        return side * 1e12 * 1e18 / usdE18;
    }

    function _short(uint256 want, uint256 have) internal pure returns (uint256) {
        return want > have ? want - have : 0;
    }

    function _buyStock(address stock, uint256 amount) internal {
        uint256 have = IERC20(stock).balanceOf(DEPLOYER);
        if (have >= amount) return;
        // ERC20/ERC20 external pool, 0.3% fee, spacing 60; currencies are sorted
        bool usdgFirst = usdg < stock;
        PoolKey memory key = PoolKey(
            Currency.wrap(usdgFirst ? usdg : stock), Currency.wrap(usdgFirst ? stock : usdg), 3000, 60, IHooks(address(0))
        );
        (uint160 sqrtP,,,) = PM.getSlot0(key.toId());
        require(sqrtP != 0, "SeedAsterPools: no external stock pool");
        uint256 spend = side * (10_000 + STOCK_MARGIN_BPS) / 10_000;
        IERC20(usdg).approve(address(SWAPPER), spend);
        SWAPPER.swap(key, usdgFirst, spend, DEPLOYER);
        require(IERC20(stock).balanceOf(DEPLOYER) >= amount * 99 / 100, "SeedAsterPools: bought too little stock");
    }

    function _hookPool(PoolKey memory key, uint160 market, uint256 amount0, uint256 amount1, AsterraPositions positions) internal {
        int24 range = int24(int256(vm.envUint("RANGE_TICKS")));
        require(range >= SPACING, "SeedAsterPools: range too narrow");
        (uint160 sqrtP,,,) = PM.getSlot0(key.toId());
        if (sqrtP == 0) {
            sqrtP = market;
            PM.initialize(key, sqrtP);
        } else {
            uint256 gap = sqrtP > market ? sqrtP - market : market - sqrtP;
            require(gap * 10_000 <= uint256(market) * 100, "SeedAsterPools: open pool is off the market price");
        }
        int24 tick = TickMath.getTickAtSqrtPrice(sqrtP);
        int24 lo = (tick - range) / SPACING * SPACING;
        int24 hi = (tick + range) / SPACING * SPACING;
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), amount0, amount1
        );
        IERC20(Currency.unwrap(key.currency0)).approve(address(positions), amount0);
        IERC20(Currency.unwrap(key.currency1)).approve(address(positions), amount1);
        (uint256 tokenId,,) = positions.mint(
            IAsterraPositions.MintParams(key, lo, hi, liq, amount0, amount1, DEPLOYER, block.timestamp + 30 minutes)
        );
        console2.log("hook pool WETH/ASTER id");
        console2.logBytes32(PoolId.unwrap(key.toId()));
        console2.log("position", tokenId);
    }

    /// @dev Creates a DAMM pool for the pair at the market price and seeds it. `usdA`/`usdB`: USD per whole token (E18).
    ///      `amountA`/`amountB` are raw amounts in the argument order, not the sorted order.
    function _dammPool(
        IDAMMFactory damm,
        address tokenA,
        address tokenB,
        uint256 usdA,
        uint8 decA,
        uint256 usdB,
        uint8 decB,
        uint256 amountA,
        uint256 amountB
    ) internal {
        require(damm.poolsForPair(tokenA, tokenB).length == 0, "SeedAsterPools: the pair already has a DAMM pool");
        bool sorted = tokenA < tokenB;
        (address t0, address t1) = sorted ? (tokenA, tokenB) : (tokenB, tokenA);
        uint160 sqrtP = sorted ? _sqrtPrice(usdA, decA, usdB, decB) : _sqrtPrice(usdB, decB, usdA, decA);
        (uint256 a0, uint256 a1) = sorted ? (amountA, amountB) : (amountB, amountA);

        address pool = damm.createPool(
            IDAMMFactory.CreateParams(
                t0, t1, sqrtP, uint160(uint256(sqrtP) * 7071 / 10_000), uint160(uint256(sqrtP) * 14_142 / 10_000), DAMM_BASE_FEE, DAMM_MAX_FEE, 0, 0
            )
        );
        IERC20(t0).approve(pool, a0);
        IERC20(t1).approve(pool, a1);
        (uint256 shares,,) = IDAMMPool(pool).addLiquidity(a0, a1, 0, DEPLOYER, block.timestamp + 30 minutes);
        require(shares > 0, "SeedAsterPools: no shares");
        console2.log("DAMM pool", pool);
        console2.log("token0", t0);
        console2.log("token1", t1);
    }

    /// @dev sqrt(token1 raw per token0 raw) in Q96, from USD prices per whole token (E18) and decimals.
    function _sqrtPrice(uint256 usd0, uint8 dec0, uint256 usd1, uint8 dec1) internal pure returns (uint160) {
        uint256 priceQ192 = FullMath.mulDiv(usd0 * 10 ** dec1, 1 << 192, usd1 * 10 ** dec0);
        return uint160(_sqrt(priceQ192));
    }

    /// @dev Exact-input swap from native ETH (currency0) through the Universal Router (V4_SWAP: swap, settle all, take all).
    function _swap(PoolKey memory key, uint256 amountIn, uint256 minOut, uint256 value) internal {
        bytes memory actions = hex"060c0f";
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(ExactInputSingle(key, true, uint128(amountIn), uint128(minOut), 0, ""));
        params[1] = abi.encode(key.currency0, amountIn);
        params[2] = abi.encode(key.currency1, minOut);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        ROUTER.execute{value: value}(hex"10", inputs, block.timestamp + 30 minutes);
    }

    /// @dev Wei worth `amount1` of a token priced against ETH (currency0) at sqrtPriceX96.
    function _weiFor(uint256 amount1, uint160 sqrtP) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount1, Q96, sqrtP), Q96, sqrtP);
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
