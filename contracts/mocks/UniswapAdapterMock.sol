// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract UniswapAdapterMock {
    address public immutable uniswapV3Router = address(this);
    address public immutable factory = address(this);

    function getPool(address, address, uint24) external pure returns (address) {
        return address(1);
    }
}
