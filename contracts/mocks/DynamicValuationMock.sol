// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

contract DynamicValuationMock {
    uint256 public valuation;
    uint256 public oraclePrice;

    constructor(uint256 _valuation) {
        valuation = _valuation;
    }

    function setValuation(uint256 _value) external {
        valuation = _value;
    }

    function setOraclePrice(uint256 value) external {
        oraclePrice = value;
    }

    function getDynamicValuation(address) external view returns (uint256) {
        return valuation;
    }

    function getOraclePrice(address, uint256) external view returns (uint256) {
        //oraclePrice; // just to prevent warning on compilation
        return oraclePrice;
    }
}
