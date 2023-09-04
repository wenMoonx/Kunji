// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {UsersVault} from "../UsersVault.sol";

contract UsersVaultTest is UsersVault {
    function setContractsFactoryAddress(
        address _contractsFactoryAddress
    ) external {
        contractsFactoryAddress = _contractsFactoryAddress;
    }
}
