// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../adapters/gmx/interfaces/IVaultPriceFeed.sol";

contract GmxVaultPriceFeedMock {
    mapping(address => uint256) public prices;

    function getPrice(
        address token,
        bool,
        bool,
        bool
    ) external view returns (uint256) {
        return prices[token];
    }

    function setPrice(address token, uint256 value) external {
        prices[token] = value;
        return;
    }
}
