// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {IAdapter} from "../interfaces/IAdapter.sol";

contract AdapterMock {
    bool public executedOperation;
    uint256 public ratio;

    function setExecuteOperationReturn(bool _value, uint256 _ratio) external {
        executedOperation = _value;
        ratio = _ratio;
    }

    function executeOperation(
        bool isTraderWallet,
        address traderWallet,
        address usersVault,
        uint256 _ratio,
        IAdapter.AdapterOperation memory adapterOperations
    ) external returns (bool, uint256) {
        isTraderWallet; // just to avoid warnings
        traderWallet; // just to avoid warnings
        usersVault; // just to avoid warnings
        adapterOperations; // just to avoid warnings
        _ratio; // just to avoid warnings
        executedOperation = executedOperation; // just to avoid warnings
        return (executedOperation, ratio);
    }
}
