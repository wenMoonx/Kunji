// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {TraderWallet} from "../TraderWallet.sol";

import {IContractsFactory} from "../interfaces/IContractsFactory.sol";

contract TraderWalletTest is TraderWallet {
    function setUnderlyingTokenAddress(
        address _underlyingTokenAddress
    )
        external
        onlyTrader
        notZeroAddress(_underlyingTokenAddress, "_underlyingTokenAddress")
    {
        emit UnderlyingTokenAddressSet(_underlyingTokenAddress);
        underlyingTokenAddress = _underlyingTokenAddress;
    }

    function setContractsFactoryAddress(
        address _contractsFactoryAddress
    )
        external
        onlyOwner
        notZeroAddress(_contractsFactoryAddress, "_contractsFactoryAddress")
    {
        contractsFactoryAddress = _contractsFactoryAddress;
    }

    function setVaultAddress(address _vaultAddress) external virtual override {
        if (vaultAddress != address(0)) {
            revert DoubleSet();
        }

        vaultAddress = _vaultAddress;
    }
}
