// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ContractsFactoryMock is OwnableUpgradeable {
    bool public returnValue;
    address public adaptersRegistryAddress;
    address public dynamicValuationAddress;
    uint256 public indexToReturn;

    function initialize() external initializer {}

    function setReturnValue(bool _value) external {
        returnValue = _value;
    }

    function setDynamicValuationAddress(
        address _dynamicValuationAddress
    ) external {
        dynamicValuationAddress = _dynamicValuationAddress;
    }

    function setAdaptersRegistryAddress(
        address _adaptersRegistryAddress
    ) external {
        adaptersRegistryAddress = _adaptersRegistryAddress;
    }

    function setIndexToReturn(uint256 _indexToReturn) external {
        indexToReturn = _indexToReturn;
    }

    function allowedTraders(address _trader) external view returns (bool) {
        _trader; // just to avoid warnings
        return returnValue;
    }

    function allowedInvestors(address _investor) external view returns (bool) {
        _investor; // just to avoid warnings
        return returnValue;
    }

    function tradersWallets(address _contract) external view returns (bool) {
        _contract; // just to avoid warnings
        return returnValue;
    }

    function usersVaults(address _vault) external view returns (bool) {
        _vault; // just to avoid warnings
        return returnValue;
    }

    mapping(address => bool) private _allowedTokens;

    function setAllowedGlobalToken(
        address[] calldata tokens,
        bool isAllowed
    ) external {
        for (uint256 i = 0; i < tokens.length; ++i) {
            _allowedTokens[tokens[i]] = isAllowed;
        }
    }

    function isAllowedGlobalToken(address token) external view returns (bool) {
        return _allowedTokens[token];
    }

    function feeRate() external view returns (uint256) {
        returnValue; // just to avoid warnings
        return 1e17; // 10%
    }

    function isAddressOnArray(
        address _addressToSearch,
        address[] memory _array
    ) external view returns (bool, uint256) {
        _addressToSearch;
        _array;
        return (returnValue, indexToReturn);
    }

    function isGlobalTokenAllowed(address _token) external view returns (bool) {
        _token; // just to avoid warnings
        return returnValue;
    }
}
