// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

interface IObserver {
    function decimals() external view returns (uint8);

    function getValue(address account) external view returns (uint256);
}
