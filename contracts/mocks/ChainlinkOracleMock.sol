// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract ChainlinkOracleMock {
    int256 answer;
    uint256 updatedAt;

    uint8 public decimals;

    function setDecimals(uint8 newValue) external {
        decimals = newValue;
    }

    function setAnswer(int256 newValue) external {
        answer = newValue;
    }

    function setUpdatedAt(uint256 newValue) external {
        updatedAt = newValue;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256 _answer, uint256, uint256 _updatedAt, uint80)
    {
        return (0, answer, 0, updatedAt, 0);
    }
}
