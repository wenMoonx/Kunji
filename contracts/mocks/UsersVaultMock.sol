// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {IAdapter} from "../interfaces/IAdapter.sol";

contract UsersVaultMock {
    bool public generalReturnValue;
    bool public executedOperation;
    uint256 public returnAmount;
    uint256 public round;
    uint256 public initialVaultBalance;
    uint256 public afterRoundBalance;
    uint256 public variableToPreventWarning;

    function initialize(
        address underlyingTokenAddress,
        address adaptersRegistryAddress,
        address contractsFactoryAddress,
        address traderWalletAddress,
        address ownerAddress,
        string memory sharesName,
        string memory sharesSymbol
    ) external {}

    // not used yet
    function setReturnValue(bool _value) external {
        generalReturnValue = _value;
    }

    function setExecuteOnProtocol(bool _value) external {
        executedOperation = _value;
    }

    function setReturnAmount(uint256 _value) external {
        returnAmount = _value;
    }

    function setRound(uint256 _value) external {
        round = _value;
    }

    function setVaultValues(
        uint256 _initialVaultBalance,
        uint256 _afterRoundVaultBalance
    ) external {
        initialVaultBalance = _initialVaultBalance;
        afterRoundBalance = _afterRoundVaultBalance;
    }

    function rolloverFromTrader() external {
        variableToPreventWarning = 0; // just to avoid warnings
    }

    function executeOnProtocol(
        uint256 _protocolId,
        IAdapter.AdapterOperation memory _vaultOperation,
        uint256 _walletRatio
    ) external {
        _protocolId; // just to avoid warnings
        _vaultOperation; // just to avoid warnings
        _walletRatio = 1; // just to avoid warnings
        executedOperation = executedOperation; // just to avoid warnings
    }

    function currentRound() external view returns (uint256) {
        return round;
    }
}
