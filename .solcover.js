module.exports = {
  configureYulOptimizer: true,
  skipFiles: [
    "interfaces/",
    "adapters/uniswap/interfaces/",
    "adapters/uniswap/libraries/",
    "adapters/gmx/interfaces/",
    "mocks/",
    "libs/Constants.sol",
  ],
};
