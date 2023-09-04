// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {TraderWallet} from "../TraderWallet.sol";

contract TraderWalletV2 is TraderWallet {
    // added variable
    uint256 public addedVariable;

    // added method
    function addedMethod(uint256 _newValue) external {
        addedVariable = _newValue;
    }
}
