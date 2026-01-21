// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestANON
/// @notice Test ERC20 token for testing AnonPool on testnet
/// @dev !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
///      WARNING: TESTNET ONLY - DO NOT DEPLOY TO MAINNET
///      This token has an unrestricted mint() function that allows anyone
///      to mint unlimited tokens. It is intended solely for testing purposes.
///      For mainnet, use the real $ANON token contract.
///      !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
contract TestANON is ERC20 {
    constructor() ERC20("Test ANON", "tANON") {
        // Mint 1 billion tokens to deployer
        _mint(msg.sender, 1_000_000_000 * 10 ** 18);
    }

    /// @notice Anyone can mint tokens for testing
    /// @dev TESTNET ONLY - This function has no access control and allows
    ///      unlimited minting. Never deploy this contract to mainnet.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
