// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import {AggregatorV2V3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

import {IContractsFactory} from "./interfaces/IContractsFactory.sol";
import {IDynamicValuation} from "./interfaces/IDynamicValuation.sol";
import {IAdaptersRegistry} from "./interfaces/IAdaptersRegistry.sol";
import {ITraderWallet} from "./interfaces/ITraderWallet.sol";
import {IUsersVault} from "./interfaces/IUsersVault.sol";
import {IBaseVault} from "./interfaces/IBaseVault.sol";
import {IObserver} from "./interfaces/IObserver.sol";

contract DynamicValuation is
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IDynamicValuation
{
    address public override factory;

    /// @notice The decimals amount of current observer for returned USD value
    uint8 public constant override decimals = 30;

    bool public useSequencer;
    address public override sequencerUptimeFeed;

    address public override gmxObserver;

    mapping(address => OracleData) private _chainlinkOracles; // token address => chainlink feed
    uint256 private constant _GRACE_PERIOD_TIME = 3600;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _factory,
        address _sequencerUptimeFeed,
        address _gmxObserver
    ) external override initializer {
        __ReentrancyGuard_init();
        __Ownable_init();

        factory = _factory;
        gmxObserver = _gmxObserver;
        sequencerUptimeFeed = _sequencerUptimeFeed;

        emit SetGmxObserver(_gmxObserver);
    }

    function setChainlinkPriceFeed(
        address token,
        address priceFeed,
        uint32 heartbeat
    ) external override onlyOwner {
        uint8 dataFeedDecimals = priceFeed != address(0)
            ? AggregatorV2V3Interface(priceFeed).decimals()
            : 0;
        uint8 tokenDecimals = priceFeed != address(0)
            ? IERC20Metadata(token).decimals()
            : 0;

        OracleData memory oracleData = OracleData({
            dataFeed: priceFeed,
            dataFeedDecimals: dataFeedDecimals,
            heartbeat: heartbeat,
            tokenDecimals: tokenDecimals
        });
        _chainlinkOracles[token] = oracleData;

        emit SetChainlinkOracle(token, oracleData);
    }

    function setGmxObserver(address newValue) external override onlyOwner {
        gmxObserver = newValue;

        emit SetGmxObserver(newValue);
    }

    function chainlinkOracles(
        address token
    ) external view override returns (OracleData memory) {
        return _chainlinkOracles[token];
    }

    function getOraclePrice(
        address token,
        uint256 amount
    ) public view override returns (uint256) {
        OracleData memory oracleData = _chainlinkOracles[token];

        uint256 oracleAnswer = _getDataFeedAnswer(oracleData, token);

        return
            _scaleNumber(
                oracleAnswer * amount,
                oracleData.dataFeedDecimals + oracleData.tokenDecimals,
                decimals
            );
    }

    /// @notice Returns total valuation of all positions in USD scaled to 1e30
    /// @param addr Address for valuation
    /// @return valuation All positions valuation in USD
    function getDynamicValuation(
        address addr
    ) external view override returns (uint256 valuation) {
        IContractsFactory _factory = IContractsFactory(factory);

        bool isTraderWallet = _factory.isTraderWallet(addr);
        if (!isTraderWallet && !_factory.isUsersVault(addr)) {
            revert WrongAddress();
        }

        valuation = _getUSDValueOfAddress(
            IBaseVault(addr).getAllowedTradeTokens(),
            addr
        );
        address _gmxObserver = gmxObserver;
        if (_gmxObserver != address(0)) {
            valuation += _getUSDValueOfAddressForAnObserver(_gmxObserver, addr);
        }
    }

    function _getUSDValueOfAddress(
        address[] memory tokens,
        address addr
    ) private view returns (uint256 usdValue) {
        _checkSequencerUptimeFeed();

        for (uint256 i = 0; i < tokens.length; ++i) {
            usdValue += getOraclePrice(
                tokens[i],
                IERC20Metadata(tokens[i]).balanceOf(addr)
            );
        }
    }

    function _getUSDValueOfAddressForAnObserver(
        address observer,
        address addr
    ) private view returns (uint256) {
        if (observer == address(0)) {
            revert NoObserver();
        }

        uint256 value = IObserver(observer).getValue(addr);

        uint256 observerDecimals = IObserver(observer).decimals();

        return _scaleNumber(value, observerDecimals, decimals);
    }

    function _getDataFeedAnswer(
        OracleData memory oracleData,
        address token
    ) private view returns (uint256) {
        if (oracleData.dataFeed == address(0)) {
            revert NoOracleForToken(token);
        }

        AggregatorV2V3Interface _dataFeed = AggregatorV2V3Interface(
            oracleData.dataFeed
        );

        (, int answer, , uint256 updatedAt, ) = _dataFeed.latestRoundData();
        if (answer <= 0) {
            revert BadPrice();
        }
        if (block.timestamp - updatedAt > oracleData.heartbeat) {
            revert TooOldPrice();
        }

        return uint256(answer);
    }

    function _scaleNumber(
        uint256 number,
        uint256 decimalsOfNumber,
        uint256 desiredDecimals
    ) private pure returns (uint256) {
        if (desiredDecimals < decimalsOfNumber) {
            return number / (10 ** (decimalsOfNumber - desiredDecimals));
        } else if (desiredDecimals > decimalsOfNumber) {
            return number * (10 ** (desiredDecimals - decimalsOfNumber));
        } else {
            return number;
        }
    }

    function _checkSequencerUptimeFeed() private view {
        address _sequencerUptimeFeed = sequencerUptimeFeed;
        if (_sequencerUptimeFeed == address(0)) {
            return;
        }
        (, int256 answer, uint256 startedAt, , ) = AggregatorV2V3Interface(
            _sequencerUptimeFeed
        ).latestRoundData();

        // Answer == 0: Sequencer is up
        // Answer == 1: Sequencer is down
        bool isSequencerUp = answer == 0;
        if (!isSequencerUp) {
            revert SequencerDown();
        }

        // Make sure the grace period has passed after the
        // sequencer is back up.
        uint256 timeSinceUp = block.timestamp - startedAt;
        if (timeSinceUp <= _GRACE_PERIOD_TIME) {
            revert GracePeriodNotOver();
        }
    }
}
