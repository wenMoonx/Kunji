// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

interface IAdaptersRegistry {
    function getAdapterAddress(uint256) external view returns (bool, address);

    function allValidProtocols() external view returns (uint256[] memory);
}
