// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 - Test ERC20 token for DEX testing
/// @notice A mintable ERC20 token used exclusively in the test environment
contract MockERC20 is ERC20 {
    /// @notice Deploy the token and mint initial supply to deployer
    /// @param name Full token name (e.g., "Token A")
    /// @param symbol Token symbol (e.g., "TKA")
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    /// @notice Mint additional tokens to any address (for testing only)
    /// @param to Recipient address
    /// @param amount Amount of tokens to mint (in wei)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
