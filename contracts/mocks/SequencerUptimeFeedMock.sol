// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract SequencerUptimeFeedMock {
    int256 answer;
    uint256 startedAt;

    function setAnswer(int256 newValue) external {
        answer = newValue;
    }

    function setStartedAt(uint256 newValue) external {
        startedAt = newValue;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256 _answer, uint256 _startedAt, uint256, uint80)
    {
        return (0, answer, startedAt, 0, 0);
    }
}
