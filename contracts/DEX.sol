// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title DEX - Automated Market Maker (AMM) Decentralized Exchange
/// @notice Implements a constant-product AMM with 0.3% trading fees and LP token accounting
/// @dev Based on Uniswap V2 mechanics. LP tokens tracked internally via mapping.
contract DEX is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Address of Token A in the trading pair
    address public tokenA;

    /// @notice Address of Token B in the trading pair
    address public tokenB;

    /// @notice Current reserve of Token A held by this contract
    uint256 public reserveA;

    /// @notice Current reserve of Token B held by this contract
    uint256 public reserveB;

    /// @notice Total supply of LP tokens across all providers
    uint256 public totalLiquidity;

    /// @notice LP token balance per liquidity provider
    mapping(address => uint256) public liquidity;

    /// @notice Emitted when a provider adds liquidity to the pool
    event LiquidityAdded(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidityMinted
    );

    /// @notice Emitted when a provider removes liquidity from the pool
    event LiquidityRemoved(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidityBurned
    );

    /// @notice Emitted when a trader swaps one token for another
    event Swap(
        address indexed trader,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Initialize the DEX with two token addresses
    /// @param _tokenA Address of the first token (Token A)
    /// @param _tokenB Address of the second token (Token B)
    constructor(address _tokenA, address _tokenB) {
        require(_tokenA != address(0), "DEX: tokenA is zero address");
        require(_tokenB != address(0), "DEX: tokenB is zero address");
        require(_tokenA != _tokenB, "DEX: identical token addresses");
        tokenA = _tokenA;
        tokenB = _tokenB;
    }

    /// @notice Add liquidity to the pool and receive LP tokens
    /// @dev First provider sets the initial price ratio. Subsequent providers must match it.
    ///      LP tokens for first provider = sqrt(amountA * amountB)
    ///      LP tokens for subsequent providers = (amountA * totalLiquidity) / reserveA
    /// @param amountA Amount of Token A to deposit
    /// @param amountB Amount of Token B to deposit
    /// @return liquidityMinted Number of LP tokens minted to the caller
    function addLiquidity(uint256 amountA, uint256 amountB)
        external
        nonReentrant
        returns (uint256 liquidityMinted)
    {
        require(amountA > 0 && amountB > 0, "DEX: amounts must be greater than zero");

        if (totalLiquidity == 0) {
            // First liquidity provision: provider sets initial price ratio
            liquidityMinted = _sqrt(amountA * amountB);
            require(liquidityMinted > 0, "DEX: insufficient initial liquidity");
        } else {
            // Subsequent provisions: must match existing price ratio exactly
            uint256 expectedB = (amountA * reserveB) / reserveA;
            require(amountB == expectedB, "DEX: token ratio mismatch");
            liquidityMinted = (amountA * totalLiquidity) / reserveA;
            require(liquidityMinted > 0, "DEX: zero LP tokens minted");
        }

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;
        reserveA += amountA;
        reserveB += amountB;

        emit LiquidityAdded(msg.sender, amountA, amountB, liquidityMinted);
    }

    /// @notice Remove liquidity from the pool by burning LP tokens
    /// @dev Returns proportional share of both reserves, including accumulated fees
    ///      amountA = (liquidityBurned * reserveA) / totalLiquidity
    ///      amountB = (liquidityBurned * reserveB) / totalLiquidity
    /// @param liquidityAmount Amount of LP tokens to burn
    /// @return amountA Amount of Token A returned to caller
    /// @return amountB Amount of Token B returned to caller
    function removeLiquidity(uint256 liquidityAmount)
        external
        nonReentrant
        returns (uint256 amountA, uint256 amountB)
    {
        require(liquidityAmount > 0, "DEX: burn amount must be greater than zero");
        require(liquidity[msg.sender] >= liquidityAmount, "DEX: insufficient LP balance");

        amountA = (liquidityAmount * reserveA) / totalLiquidity;
        amountB = (liquidityAmount * reserveB) / totalLiquidity;

        require(amountA > 0 && amountB > 0, "DEX: zero token output");

        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        reserveA -= amountA;
        reserveB -= amountB;

        IERC20(tokenA).safeTransfer(msg.sender, amountA);
        IERC20(tokenB).safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, amountA, amountB, liquidityAmount);
    }

    /// @notice Swap Token A for Token B using constant product formula with 0.3% fee
    /// @param amountAIn Amount of Token A to swap in
    /// @return amountBOut Amount of Token B received
    function swapAForB(uint256 amountAIn)
        external
        nonReentrant
        returns (uint256 amountBOut)
    {
        require(amountAIn > 0, "DEX: input amount must be greater than zero");
        require(reserveA > 0 && reserveB > 0, "DEX: insufficient liquidity");

        amountBOut = getAmountOut(amountAIn, reserveA, reserveB);
        require(amountBOut > 0, "DEX: zero output amount");

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountAIn);

        reserveA += amountAIn;
        reserveB -= amountBOut;

        IERC20(tokenB).safeTransfer(msg.sender, amountBOut);

        emit Swap(msg.sender, tokenA, tokenB, amountAIn, amountBOut);
    }

    /// @notice Swap Token B for Token A using constant product formula with 0.3% fee
    /// @param amountBIn Amount of Token B to swap in
    /// @return amountAOut Amount of Token A received
    function swapBForA(uint256 amountBIn)
        external
        nonReentrant
        returns (uint256 amountAOut)
    {
        require(amountBIn > 0, "DEX: input amount must be greater than zero");
        require(reserveA > 0 && reserveB > 0, "DEX: insufficient liquidity");

        amountAOut = getAmountOut(amountBIn, reserveB, reserveA);
        require(amountAOut > 0, "DEX: zero output amount");

        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountBIn);

        reserveB += amountBIn;
        reserveA -= amountAOut;

        IERC20(tokenA).safeTransfer(msg.sender, amountAOut);

        emit Swap(msg.sender, tokenB, tokenA, amountBIn, amountAOut);
    }

    /// @notice Get the current spot price of Token A in terms of Token B
    /// @dev Price is scaled by 1e18 to preserve precision. Returns 0 if pool is empty.
    /// @return price Current price = (reserveB * 1e18) / reserveA
    function getPrice() external view returns (uint256 price) {
        if (reserveA == 0) return 0;
        price = (reserveB * 1e18) / reserveA;
    }

    /// @notice Get current reserves of both tokens
    /// @return _reserveA Current Token A reserve
    /// @return _reserveB Current Token B reserve
    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA, reserveB);
    }

    /// @notice Calculate output amount for a given input using constant product with 0.3% fee
    /// @dev Formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    ///      The 997/1000 factor applies the 0.3% fee. Fee remains in pool as reward for LPs.
    /// @param amountIn Amount of input token
    /// @param reserveIn Reserve of input token
    /// @param reserveOut Reserve of output token
    /// @return amountOut Amount of output token after fee deduction
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "DEX: input amount must be greater than zero");
        require(reserveIn > 0 && reserveOut > 0, "DEX: insufficient reserves");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Babylonian square root implementation
    /// @param y Input value
    /// @return z Integer square root of y
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
