// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {UsersVault} from "../UsersVault.sol";

contract UsersVaultV2 is UsersVault {
    // added variable
    uint256 public addedVariable;

    // added method
    function addedMethod(uint256 _newValue) external {
        addedVariable = _newValue;
    }
}
