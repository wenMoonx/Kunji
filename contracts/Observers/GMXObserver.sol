// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {IGmxAdapter} from "../adapters/gmx/interfaces/IGmxAdapter.sol";
import {IGmxReader} from "../adapters/gmx/interfaces/IGmxReader.sol";
import {IGmxVault} from "../adapters/gmx/interfaces/IGmxVault.sol";
import {IGmxOrderBook} from "../adapters/gmx/interfaces/IGmxOrderBook.sol";
import {ITraderWallet} from "../interfaces/ITraderWallet.sol";
import {IObserver} from "../interfaces/IObserver.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract GMXObserver is IObserver {
    IGmxVault public constant gmxVault =
        IGmxVault(0x489ee077994B6658eAfA855C308275EAd8097C4A);
    IGmxReader public constant gmxReader =
        IGmxReader(0x22199a49A999c351eF7927602CFB187ec3cae489);
    IGmxOrderBook public constant gmxOrderBook =
        IGmxOrderBook(0x09f77E8A13De9a35a7231028187e9fD5DB8a2ACB);

    /// @notice The decimals amount of current observer for returned USD value
    uint8 public constant override decimals = 30;

    /// @notice Evaluates all account positions on GMX along allowed tokens
    /// @param account The account address whose positions will be evaluated
    /// @return Returns positions value in USD scaled to 1e30
    function getValue(
        address account
    ) external view override returns (uint256) {
        uint256 longPositionsValueUSD = _evaluateLongPosition(account);
        uint256 shortPositionsValueUSD = _evaluateShortPosition(account);
        uint256 increaseOrdersUSD = _evaluateIncreaseOrders(account);
        return
            longPositionsValueUSD + shortPositionsValueUSD + increaseOrdersUSD;
    }

    function _evaluateShortPosition(
        address account
    ) internal view returns (uint256) {
        address[] memory gmxShortCollaterals = ITraderWallet(account)
            .getGmxShortCollaterals();
        uint256 len = gmxShortCollaterals.length;
        if (len == 0) return 0;

        bool[] memory isLong = new bool[](len); // default false values
        uint256[] memory shortPositions = IGmxReader(gmxReader).getPositions(
            address(gmxVault),
            account,
            gmxShortCollaterals,
            ITraderWallet(account).getGmxShortIndexTokens(),
            isLong
        );

        uint256 shortPositionsValueUSD;

        for (uint256 i; i < len; ) {
            uint256 collateralUSD = shortPositions[1 + i * 9];
            if (collateralUSD == 0) {
                unchecked {
                    ++i;
                }
                continue;
            }
            bool hasProfit = shortPositions[7 + i * 9] == 0 ? false : true;
            uint256 deltaUSD = shortPositions[8 + i * 9];
            if (hasProfit) {
                shortPositionsValueUSD =
                    shortPositionsValueUSD +
                    collateralUSD +
                    deltaUSD;
            } else {
                shortPositionsValueUSD =
                    shortPositionsValueUSD +
                    collateralUSD -
                    deltaUSD;
            }
            unchecked {
                ++i;
            }
        }
        return shortPositionsValueUSD; // scaled 1e30
    }

    function _evaluateLongPosition(
        address account
    ) internal view returns (uint256) {
        address[] memory allowedLongTokens = ITraderWallet(account)
            .getAllowedTradeTokens();
        uint256 len = allowedLongTokens.length;
        bool[] memory isLong = new bool[](len);
        for (uint256 i; i < isLong.length; ) {
            isLong[i] = true;
            unchecked {
                ++i;
            }
        }

        // collaterals and indexTOkens are the same for long positions
        uint256[] memory longPositions = IGmxReader(gmxReader).getPositions(
            address(gmxVault),
            account,
            allowedLongTokens, // collaterals
            allowedLongTokens, // indexTokens (trades)
            isLong
        );

        uint256 longPositionsValueUSD;

        // iterate over list
        for (uint256 i; i < len; ) {
            uint256 collateralUSD = longPositions[1 + i * 9];
            if (collateralUSD == 0) {
                unchecked {
                    ++i;
                }
                continue;
            }
            bool hasProfit = longPositions[7 + i * 9] == 0 ? false : true;
            uint256 deltaUSD = longPositions[8 + i * 9];
            if (hasProfit) {
                longPositionsValueUSD =
                    longPositionsValueUSD +
                    collateralUSD +
                    deltaUSD;
            } else {
                longPositionsValueUSD =
                    longPositionsValueUSD +
                    collateralUSD -
                    deltaUSD;
            }
            unchecked {
                ++i;
            }
        }
        return longPositionsValueUSD; // scaled 1e30
    }

    function _evaluateIncreaseOrders(
        address account
    ) internal view returns (uint256 increaseOrdersUSD) {
        uint256 latestIndex = gmxOrderBook.increaseOrdersIndex(account);

        // search only over last 10 orders
        uint256 endIndex = latestIndex > 10 ? latestIndex - 10 : 0;
        for (uint256 i = endIndex; i <= latestIndex; ++i) {
            IGmxOrderBook.IncreaseOrder memory order = gmxOrderBook
                .increaseOrders(account, i);

            if (order.account != address(0)) {
                increaseOrdersUSD +=
                    (order.purchaseTokenAmount *
                        gmxVault.getMinPrice(order.purchaseToken)) /
                    (10 ** IERC20Metadata(order.purchaseToken).decimals());
            }
        }
    }
}
