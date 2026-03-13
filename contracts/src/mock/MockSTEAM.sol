// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockSTEAM
 * @notice Test token for local Foundry tests only.
 *         On Hedera testnet/mainnet, use the actual HTS STEAM token instead.
 *         HTS STEAM has 8 decimals — this mock matches that.
 */
contract MockSTEAM is ERC20, Ownable {
    constructor(address initialOwner) ERC20("Mock STEAM", "mSTEAM") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
