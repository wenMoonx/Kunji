import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "hardhat-abi-exporter";
import "hardhat-spdx-license-identifier";
import "hardhat-tracer";
import "solidity-docgen";
import "@typechain/hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";

import * as dotenv from "dotenv";
dotenv.config();

const arbitrum_rpc = process.env.ARBITRUM_NODE || "";
if (arbitrum_rpc === "") {
  throw new Error("Invalid ARBITRUM_NODE");
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: process.env.LOCAL_TEST_ARBITRUM_NODE || arbitrum_rpc || "",
        blockNumber: 77400000,
        enabled: true,
      },
    },
    arbitrum: {
      url: arbitrum_rpc,
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrum_test: {
      url: process.env.TEST_ARBITRUM_NODE || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    goerli: {
      url:
        "https://eth-goerli.g.alchemy.com/v2/" + process.env.GOERLI_ALCHEMY_KEY,
      chainId: 5,
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      // gas: 2100000,
      // gasPrice: 45000000000, // 45
    },
    local: {
      url: "http://127.0.0.1:8545/",
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./tests",
  },
  solidity: {
    version: "0.8.19",
    settings: {
      viaIR: false,
      optimizer: {
        enabled: true,
        runs: 75,
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    excludeContracts: [
      "@openzeppelin/contracts/",
      "@openzeppelin/contracts-upgradeable/",
      "mocks/",
    ],
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
    except: [
      "@openzeppelin/contracts/",
      "@openzeppelin/contracts-upgradeable/",
      "mocks/",
    ],
  },
  mocha: {
    timeout: 100000000,
  },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: true,
  },
  abiExporter: {
    path: "./abi",
    runOnCompile: true,
    clear: true,
    flat: false,
    spacing: 2,
    except: [
      "@openzeppelin/contracts/",
      "@openzeppelin/contracts-upgradeable/",
      "interfaces/",
      "mocks/",
    ],
  },
};

export default config;
