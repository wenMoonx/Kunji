// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {IObserver} from "../interfaces/IObserver.sol";

contract ObserverMock is IObserver {
    uint8 public override decimals = 30;

    uint256 private returnValue;

    function setReturnValue(uint256 newValue) external {
        returnValue = newValue;
    }

    function setDecimals(uint8 newDecimals) external {
        decimals = newDecimals;
    }

    function getValue(address) external view override returns (uint256) {
        return returnValue;
    }
}
