// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

import {ITraderWallet} from "./interfaces/ITraderWallet.sol";
import {IUsersVault} from "./interfaces/IUsersVault.sol";
import {IContractsFactory} from "./interfaces/IContractsFactory.sol";

contract ContractsFactory is OwnableUpgradeable, IContractsFactory {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant override BASE = 1e18; // 100%
    uint256 public override feeRate;
    address public override feeReceiver;
    address public override dynamicValuationAddress;
    address public override adaptersRegistryAddress;
    address public override lensAddress;

    address[] public override traderWalletsArray;
    mapping(address => bool) public override isTraderWallet;

    address[] public override usersVaultsArray;
    mapping(address => bool) public override isUsersVault;

    mapping(address => bool) public override allowedInvestors;
    mapping(address => bool) public override allowedTraders;

    EnumerableSet.AddressSet private _allowedGlobalTokens;

    UpgradeableBeacon private _beaconProxyForTraderWallet;
    UpgradeableBeacon private _beaconProxyForUsersVault;

    function initialize(
        uint256 _feeRate,
        address _feeReceiver,
        address _traderWalletImplementation,
        address _usersVaultImplementation
    ) external override initializer {
        __Ownable_init();

        if (_feeRate > BASE) revert FeeRateError();
        feeRate = _feeRate;

        if (_feeReceiver == address(0)) {
            revert ZeroAddress("_feeReceiver");
        }
        feeReceiver = _feeReceiver;

        _beaconProxyForTraderWallet = new UpgradeableBeacon(
            _traderWalletImplementation
        );
        _beaconProxyForUsersVault = new UpgradeableBeacon(
            _usersVaultImplementation
        );

        emit FeeRateSet(_feeRate);
        emit FeeReceiverSet(_feeReceiver);

        emit TraderWalletImplementationChanged(_traderWalletImplementation);
        emit UsersVaultImplementationChanged(_usersVaultImplementation);
    }

    function addInvestors(
        address[] calldata investors
    ) external override onlyOwner {
        uint256 length = investors.length;
        for (uint256 i = 0; i < length; ++i) {
            addInvestor(investors[i]);
        }
    }

    function addInvestor(address _investorAddress) public override onlyOwner {
        _checkZeroAddress(_investorAddress, "_investorAddress");

        if (allowedInvestors[_investorAddress]) {
            revert InvestorAlreadyExists();
        }
        allowedInvestors[_investorAddress] = true;

        emit InvestorAdded(_investorAddress);
    }

    function removeInvestor(
        address _investorAddress
    ) external override onlyOwner {
        _checkZeroAddress(_investorAddress, "_investorAddress");

        if (!allowedInvestors[_investorAddress]) {
            revert InvestorNotExists();
        }
        delete allowedInvestors[_investorAddress];

        emit InvestorRemoved(_investorAddress);
    }

    function addTraders(
        address[] calldata traders
    ) external override onlyOwner {
        uint256 length = traders.length;
        for (uint256 i = 0; i < length; ++i) {
            addTrader(traders[i]);
        }
    }

    function addTrader(address _traderAddress) public override onlyOwner {
        _checkZeroAddress(_traderAddress, "_traderAddress");

        if (allowedTraders[_traderAddress]) {
            revert TraderAlreadyExists();
        }
        allowedTraders[_traderAddress] = true;

        emit TraderAdded(_traderAddress);
    }

    function removeTrader(address _traderAddress) external override onlyOwner {
        _checkZeroAddress(_traderAddress, "_traderAddress");

        if (!allowedTraders[_traderAddress]) {
            revert TraderNotExists();
        }
        delete allowedTraders[_traderAddress];

        emit TraderRemoved(_traderAddress);
    }

    function setDynamicValuationAddress(
        address _dynamicValuationAddress
    ) external override onlyOwner {
        _checkZeroAddress(_dynamicValuationAddress, "_dynamicValueAddress");

        dynamicValuationAddress = _dynamicValuationAddress;

        emit DynamicValuationAddressSet(_dynamicValuationAddress);
    }

    function setAdaptersRegistryAddress(
        address _adaptersRegistryAddress
    ) external override onlyOwner {
        _checkZeroAddress(_adaptersRegistryAddress, "_adaptersRegistryAddress");

        adaptersRegistryAddress = _adaptersRegistryAddress;

        emit AdaptersRegistryAddressSet(_adaptersRegistryAddress);
    }

    function setLensAddress(address _lensAddress) external override onlyOwner {
        _checkZeroAddress(_lensAddress, "_lensAddress");

        lensAddress = _lensAddress;

        emit LensAddressSet(_lensAddress);
    }

    function setFeeReceiver(
        address newFeeReceiver
    ) external override onlyOwner {
        _checkZeroAddress(newFeeReceiver, "newFeeReceiver");

        feeReceiver = newFeeReceiver;

        emit FeeReceiverSet(newFeeReceiver);
    }

    function setFeeRate(uint256 _newFeeRate) external override onlyOwner {
        if (_newFeeRate > BASE) revert FeeRateError();
        feeRate = _newFeeRate;

        emit FeeRateSet(_newFeeRate);
    }

    function setUsersVaultImplementation(
        address newImplementation
    ) external override onlyOwner {
        _beaconProxyForUsersVault.upgradeTo(newImplementation);

        emit UsersVaultImplementationChanged(newImplementation);
    }

    function setTraderWalletImplementation(
        address newImplementation
    ) external override onlyOwner {
        _beaconProxyForTraderWallet.upgradeTo(newImplementation);

        emit TraderWalletImplementationChanged(newImplementation);
    }

    function addGlobalAllowedTokens(
        address[] calldata _tokens
    ) external override onlyOwner {
        for (uint256 i; i < _tokens.length; ) {
            address token = _tokens[i];

            if (token == address(0)) {
                revert ZeroAddress("_tokens");
            }

            _allowedGlobalTokens.add(token);

            emit GlobalTokenAdded(token);

            unchecked {
                ++i;
            }
        }
    }

    function removeGlobalToken(address token) external override onlyOwner {
        if (!_allowedGlobalTokens.remove(token)) {
            revert InvalidToken();
        }

        emit GlobalTokenRemoved(token);
    }

    function deployTraderWallet(
        address underlyingTokenAddress,
        address traderAddress,
        address _owner
    ) external override onlyOwner {
        _checkZeroAddress(underlyingTokenAddress, "_underlyingTokenAddress");
        _checkZeroAddress(traderAddress, "_traderAddress");
        _checkZeroAddress(_owner, "_owner");

        if (!allowedTraders[traderAddress]) revert InvalidTrader();

        if (!_allowedGlobalTokens.contains(underlyingTokenAddress)) {
            revert InvalidToken();
        }

        address newTraderWallet = address(
            new BeaconProxy(
                address(_beaconProxyForTraderWallet),
                abi.encodeWithSelector(
                    ITraderWallet.initialize.selector,
                    underlyingTokenAddress,
                    traderAddress,
                    _owner
                )
            )
        );

        if (newTraderWallet == address(0)) revert FailedWalletDeployment();

        isTraderWallet[newTraderWallet] = true;
        traderWalletsArray.push(newTraderWallet);

        emit TraderWalletDeployed(
            newTraderWallet,
            traderAddress,
            underlyingTokenAddress
        );
    }

    function deployUsersVault(
        address traderWalletAddress,
        address _owner,
        string memory sharesName,
        string memory sharesSymbol
    ) external override onlyOwner {
        _checkZeroAddress(traderWalletAddress, "_traderWalletAddress");
        _checkZeroAddress(_owner, "_owner");

        if (!isTraderWallet[traderWalletAddress]) revert InvalidWallet();

        if (ITraderWallet(traderWalletAddress).vaultAddress() != address(0)) {
            revert UsersVaultAlreadyDeployed();
        }

        address newUsersVault = address(
            new BeaconProxy(
                address(_beaconProxyForUsersVault),
                abi.encodeWithSelector(
                    IUsersVault.initialize.selector,
                    ITraderWallet(traderWalletAddress).underlyingTokenAddress(),
                    traderWalletAddress,
                    _owner,
                    sharesName,
                    sharesSymbol
                )
            )
        );

        if (newUsersVault == address(0)) revert FailedVaultDeployment();

        isUsersVault[newUsersVault] = true;
        usersVaultsArray.push(newUsersVault);

        ITraderWallet(traderWalletAddress).setVaultAddress(newUsersVault);

        emit UsersVaultDeployed(newUsersVault, traderWalletAddress);
    }

    function usersVaultImplementation()
        external
        view
        override
        returns (address)
    {
        return _beaconProxyForUsersVault.implementation();
    }

    function traderWalletImplementation()
        external
        view
        override
        returns (address)
    {
        return _beaconProxyForTraderWallet.implementation();
    }

    function numOfTraderWallets() external view override returns (uint256) {
        return traderWalletsArray.length;
    }

    function numOfUsersVaults() external view override returns (uint256) {
        return usersVaultsArray.length;
    }

    function isAllowedGlobalToken(
        address token
    ) external view override returns (bool) {
        return _allowedGlobalTokens.contains(token);
    }

    function allowedGlobalTokensAt(
        uint256 index
    ) external view override returns (address) {
        return _allowedGlobalTokens.at(index);
    }

    function allowedGlobalTokensLength()
        external
        view
        override
        returns (uint256)
    {
        return _allowedGlobalTokens.length();
    }

    function getAllowedGlobalTokens()
        external
        view
        override
        returns (address[] memory)
    {
        return _allowedGlobalTokens.values();
    }

    function _checkZeroAddress(
        address _variable,
        string memory _message
    ) internal pure {
        if (_variable == address(0)) revert ZeroAddress({target: _message});
    }
}
