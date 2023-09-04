// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;
import {IUsersVault} from "./../interfaces/IUsersVault.sol";
import {IAdapter} from "../interfaces/IAdapter.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract TraderWalletMock {
    using EnumerableSet for EnumerableSet.AddressSet;

    event TraderWalletRolloverExecuted();

    address public addressToReturn;
    address public usersVaultAddress;

    mapping(uint256 => bool) public isTraderSelectedProtocol;
    mapping(address => bool) public isAllowedTradeToken;

    constructor() {}

    function initialize(
        address underlyingTokenAddress,
        address traderAddress,
        address ownerAddress
    ) external {}

    function setUsersVault(address _value) external {
        usersVaultAddress = _value;
    }

    function setAddressToReturn(address _value) external {
        addressToReturn = _value;
    }

    function getAdapterAddressPerProtocol(
        uint256 _protocolId
    ) external view returns (address) {
        _protocolId;
        return addressToReturn;
    }

    function callExecuteOnProtocolInVault(
        uint256 _protocolId,
        IAdapter.AdapterOperation memory _traderOperation,
        uint256 _walletRatio
    ) external {
        IUsersVault(usersVaultAddress).executeOnProtocol(
            _protocolId,
            _traderOperation,
            _walletRatio
        );
        emit TraderWalletRolloverExecuted();
    }

    function callRolloverInVault() external {
        IUsersVault(usersVaultAddress).rolloverFromTrader();
    }

    function setIsTraderSelectedProtocol(
        uint256 protocolId,
        bool value
    ) external {
        isTraderSelectedProtocol[protocolId] = value;
    }

    function setIsAllowedTradeToken(address token, bool value) external {
        isAllowedTradeToken[token] = value;
    }
}
