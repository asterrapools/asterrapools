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

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// @notice Opens and seeds USDG/ASTER behind the Asterra hook, then swaps through it from Uniswap's Universal Router, so
///         one public transaction shows Uniswap's router contract reaching an Asterra pool. It is a manual test swap:
///         Uniswap's routing engine did not pick the pool.
/// @dev Funds are bought through the same router because it enforces a minimum output on-chain. ASTER has no hub oracle,
///      so the opening price comes from the ETH/ASTER and ETH/USDG pools; the hook does not guard a non-stock opening.
///      SIDE_USD_E6: value of each side in USD, 6 decimals. RANGE_TICKS: half width of the position (2230 = about ±25%).
///      PROOF_USDG_E6: USDG for the router swap, 6 decimals (0 skips it). RESERVE_WEI: ETH that must stay in the wallet.
contract SeedAster is Script {
    using StateLibrary for IPoolManager;

    struct ExactInputSingle {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        uint256 minHopPriceX36; // Robinhood Chain's router fork adds this field; 0 turns it off
        bytes hookData;
    }

    address internal constant DEPLOYER = 0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C;
    address internal constant ASTER = 0x8c4be7763F446DF2b5A8c331e7CCF497e7F78b1d;
    IPoolManager internal constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IUniversalRouter internal constant ROUTER = IUniversalRouter(0x8876789976dEcBfCbBbe364623C63652db8C0904);
    IPermit2 internal constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    int24 internal constant SPACING = 10;
    uint256 internal constant Q96 = 1 << 96;
    // deep ETH/USDG pool and ASTER's main market, both external Uniswap v4 pools; ids are checked
    bytes32 internal constant ETH_USDG_ID = 0xa791e5169faf703c0b63fd9552c33ec1128a773a00f5dc33a640da62a022cd35;
    bytes32 internal constant ETH_ASTER_ID = 0xa8df68b399b7ef2a821c7efb582cedf2a19b842780ae7e0a36681d597882c1bc;
    address internal constant ETH_USDG_HOOK = 0x987E330F00B79864a07FE81dFaC344D0078ABCC0;
    address internal constant ETH_ASTER_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    // ETH spent over the spot value of what is bought: fees (ASTER costs about 2.97% a swap) plus price drift
    uint256 internal constant USDG_MARGIN_BPS = 100;
    uint256 internal constant ASTER_MARGIN_BPS = 500;
    uint256 internal constant MAX_SQRT_DRIFT_BPS = 100; // 1% on the square root is about 2% on the price

    function run() external {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../sdk/src/addresses/mainnet.json"));
        address usdg = vm.parseJsonAddress(json, ".tokens.USDG.address");
        address hook = vm.parseJsonAddress(json, ".hook");
        AsterraPositions positions = AsterraPositions(vm.parseJsonAddress(json, ".positions"));
        uint256 side = vm.envUint("SIDE_USD_E6");
        int24 range = int24(int256(vm.envUint("RANGE_TICKS")));
        uint256 proof = vm.envUint("PROOF_USDG_E6");
        uint256 reserve = vm.envUint("RESERVE_WEI");
        require(usdg < ASTER, "SeedAster: token order");
        require(range >= SPACING, "SeedAster: range too narrow");

        PoolKey memory ethUsdg =
            PoolKey(Currency.wrap(address(0)), Currency.wrap(usdg), LPFeeLibrary.DYNAMIC_FEE_FLAG, 1, IHooks(ETH_USDG_HOOK));
        PoolKey memory ethAster = PoolKey(Currency.wrap(address(0)), Currency.wrap(ASTER), 0, 200, IHooks(ETH_ASTER_HOOK));
        require(PoolId.unwrap(ethUsdg.toId()) == ETH_USDG_ID, "SeedAster: ETH/USDG key mismatch");
        require(PoolId.unwrap(ethAster.toId()) == ETH_ASTER_ID, "SeedAster: ETH/ASTER key mismatch");
        PoolKey memory key = PoolKey(Currency.wrap(usdg), Currency.wrap(ASTER), LPFeeLibrary.DYNAMIC_FEE_FLAG, SPACING, IHooks(hook));

        (uint160 sqrtEthUsdg,,,) = PM.getSlot0(ethUsdg.toId());
        (uint160 sqrtEthAster,,,) = PM.getSlot0(ethAster.toId());
        uint160 market = uint160(FullMath.mulDiv(sqrtEthAster, Q96, sqrtEthUsdg)); // ASTER raw per USDG raw
        (uint160 sqrtP,,,) = PM.getSlot0(key.toId());
        bool opened = sqrtP != 0;
        if (opened) {
            uint256 gap = sqrtP > market ? sqrtP - market : market - sqrtP;
            require(gap * 10_000 <= uint256(market) * MAX_SQRT_DRIFT_BPS, "SeedAster: open pool is off the market price");
        } else {
            sqrtP = market;
        }

        uint256 asterSide = _quote(side, sqrtP);
        uint256 usdgHave = IERC20(usdg).balanceOf(DEPLOYER);
        uint256 asterHave = IERC20(ASTER).balanceOf(DEPLOYER);
        uint256 usdgBuy = side + proof > usdgHave ? side + proof - usdgHave : 0;
        uint256 asterBuy = asterSide > asterHave ? asterSide - asterHave : 0;
        uint256 ethForUsdg = _weiFor(usdgBuy, sqrtEthUsdg) * (10_000 + USDG_MARGIN_BPS) / 10_000;
        uint256 ethForAster = _weiFor(asterBuy, sqrtEthAster) * (10_000 + ASTER_MARGIN_BPS) / 10_000;
        require(DEPLOYER.balance >= ethForUsdg + ethForAster + reserve, "SeedAster: not enough ETH, lower SIDE_USD_E6");

        int24 tick = TickMath.getTickAtSqrtPrice(sqrtP);
        int24 lo = (tick - range) / SPACING * SPACING;
        int24 hi = (tick + range) / SPACING * SPACING;
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), side, asterSide
        );
        console2.log("ETH to USDG", ethForUsdg);
        console2.log("ETH to ASTER", ethForAster);
        console2.log("USDG side (6 decimals)", side);
        console2.log("ASTER side (18 decimals)", asterSide);

        vm.startBroadcast(DEPLOYER);
        if (usdgBuy > 0) _swap(ethUsdg, ethForUsdg, usdgBuy, ethForUsdg);
        if (asterBuy > 0) _swap(ethAster, ethForAster, asterBuy, ethForAster);
        if (!opened) PM.initialize(key, sqrtP);
        IERC20(usdg).approve(address(positions), side);
        IERC20(ASTER).approve(address(positions), asterSide);
        (uint256 tokenId,,) =
            positions.mint(IAsterraPositions.MintParams(key, lo, hi, liq, side, asterSide, DEPLOYER, block.timestamp + 30 minutes));
        if (proof > 0) {
            IERC20(usdg).approve(address(PERMIT2), proof);
            PERMIT2.approve(usdg, address(ROUTER), uint160(proof), uint48(block.timestamp + 30 minutes));
            _swap(key, proof, _quote(proof, sqrtP) * 90 / 100, 0);
        }
        vm.stopBroadcast();

        // runs in the simulation: a seed that left the pool empty or the price outside the position stops the broadcast
        (uint160 sqrtAfter, int24 tickAfter,,) = PM.getSlot0(key.toId());
        require(PM.getLiquidity(key.toId()) >= liq, "SeedAster: pool has no liquidity");
        require(tickAfter >= lo && tickAfter < hi, "SeedAster: price left the position");

        console2.log("pool id");
        console2.logBytes32(PoolId.unwrap(key.toId()));
        console2.log("position", tokenId);
        console2.log("tick lower", int256(lo));
        console2.log("tick upper", int256(hi));
        console2.log("sqrtPriceX96", uint256(sqrtAfter));
    }

    /// @dev Exact-input swap from currency0 to currency1 through the Universal Router (V4_SWAP: swap, settle all, take all).
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

    /// @dev currency1 raw units worth `amount0` of currency0 at sqrtPriceX96.
    function _quote(uint256 amount0, uint160 sqrtP) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount0, sqrtP, Q96), sqrtP, Q96);
    }

    /// @dev Wei worth `amount1` of a token priced against ETH (currency0) at sqrtPriceX96.
    function _weiFor(uint256 amount1, uint160 sqrtP) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount1, Q96, sqrtP), Q96, sqrtP);
    }
}
