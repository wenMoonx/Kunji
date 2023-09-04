/* eslint-disable no-process-exit */
import { ethers, network } from "hardhat";

import {
  FACTORY_ADDRESS,
  TRADER_WALLET_INSTANCE_ADDRESS,
  TOKENS,
  USERS_VAULT_INSTANCE_ADDRESS,
  DYNAMIC_VALUATION_ADDRESS,
  USD_FEEDS,
  HEARTBEAT,
} from "./_helpers/data";
import {
  ContractsFactory,
  DynamicValuation,
  TraderWallet,
  UsersVault,
} from "../typechain-types";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////                                                                                             //////////////////////
/////  CONFIGURATION FLAGS TO SELECT WHAT TO EXECUTE                                              //////////////////////
/////                                                                                             //////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////                                                                                             //////////////////////
/////  COMPLETE ./_helpers/data.ts WITH VALID ADDRESSES IF THERE ARE ALREADY DEPLOYED CONTRACTS   //////////////////////
/////                                                                                             //////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const ADD_TRADER = false;
const REMOVE_TRADER = false;
// const TRADER_ADDRESS = "0x27FB72101CB0481213af9104238E3813ec52A47b";
// const TRADER_ADDRESS = "0x8850F319334a0A7219402B82Fb99F62bAF2B6738";
const TRADER_ADDRESS = "0x78BdeFf0d8d4598FE6cC8d874aFEFaBb75599cc9";

const ADD_INVESTOR = false;
// const INVESTOR_ADDRESS = "0x27FB72101CB0481213af9104238E3813ec52A47b";
// const INVESTOR_ADDRESS = "0x8850F319334a0A7219402B82Fb99F62bAF2B6738";
// const INVESTOR_ADDRESS = "0x21B0D97Ae9CA45ABf17fFfA57C56E4bdba165879";
const INVESTOR_ADDRESS = "0x78BdeFf0d8d4598FE6cC8d874aFEFaBb75599cc9";
const REMOVE_INVESTOR = false;

// Add global tokens to the whole system
const ADD_GLOBAL_TOKENS = false;
// const ADD_GLOBAL_TOKENS = false;

// Add Adapter to use in trader wallet
// const ADD_ADAPTER_TO_USE = true;
const ADD_ADAPTER_TO_USE = false;

// Add trader tokens to trade
const ADD_TRADE_TOKENS = false;
// const ADD_TRADE_TOKENS = false;

// Set allowance for each token on trader wallet and vault
// const SET_ALLOWANCE_WALLET = true;
// const SET_ALLOWANCE_VAULT = true;
const SET_ALLOWANCE_WALLET = false;
const SET_ALLOWANCE_VAULT = false;

// Add GMX Short Pairs
// const ADD_GMX_SHORT_PAIRS = true;
const ADD_GMX_SHORT_PAIRS = false;

// Add price feeds to Dynamic Valuation contract
const ADD_PRICE_FEEDS = true;
// const ADD_PRICE_FEEDS = false;

////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

// Add Trader
const addTrader = async () => {
  console.log("Add Trader to Factory");
  const contractsFactoryContract = (await ethers.getContractAt(
    "ContractsFactory",
    FACTORY_ADDRESS
  )) as ContractsFactory;

  const txResult = await contractsFactoryContract.addTrader(TRADER_ADDRESS);
  console.log(
    "Trader: ",
    TRADER_ADDRESS,
    " Added to Factory\nTxHash: ",
    txResult.hash,
    "\n\n"
  );
};

// Remove Trader
const removeTrader = async () => {
  console.log("Remove Trader from Factory");
  const contractsFactoryContract = (await ethers.getContractAt(
    "ContractsFactory",
    FACTORY_ADDRESS
  )) as ContractsFactory;

  const txResult = await contractsFactoryContract.removeTrader(TRADER_ADDRESS);
  console.log("Trader Removed txHash: ", txResult.hash, "\n\n");
};

// Add Investor
const addInvestor = async () => {
  console.log("Add Investor to Factory");
  const contractsFactoryContract = (await ethers.getContractAt(
    "ContractsFactory",
    FACTORY_ADDRESS
  )) as ContractsFactory;

  const txResult = await contractsFactoryContract.addInvestor(INVESTOR_ADDRESS);
  console.log("Investor Added txHash: ", txResult.hash, "\n\n");
  console.log(
    "Investor: ",
    INVESTOR_ADDRESS,
    " Added to Factory\nTxHash: ",
    txResult.hash,
    "\n\n"
  );
};

// Add Investor
const removeInvestor = async () => {
  console.log("Remove Investor from Factory");
  const contractsFactoryContract = (await ethers.getContractAt(
    "ContractsFactory",
    FACTORY_ADDRESS
  )) as ContractsFactory;

  const txResult = await contractsFactoryContract.removeInvestor(
    INVESTOR_ADDRESS
  );
  console.log("Investor Removed txHash: ", txResult.hash, "\n\n");
};

// Add Global Tokens to whole system
const addGlobalTokens = async () => {
  console.log("Add Global Tokens to Factory");
  const contractsFactoryContract = (await ethers.getContractAt(
    "ContractsFactory",
    FACTORY_ADDRESS
  )) as ContractsFactory;

  const txResult = await contractsFactoryContract.addGlobalAllowedTokens([
    TOKENS.usdc,
    // TOKENS.usdt,
    TOKENS.dai,
    // TOKENS.frax,
    TOKENS.weth,
    TOKENS.wbtc,
    TOKENS.link,
    // TOKENS.uni,
  ]);
  console.log("Global Tokens Added txHash: ", txResult.hash, "\n\n");
};

// Add Adapter to Use on Trader Wallet
const addAdapterToUse = async () => {
  console.log("Add Adapter in Wallet");
  const traderWalletContract = (await ethers.getContractAt(
    "TraderWallet",
    TRADER_WALLET_INSTANCE_ADDRESS
  )) as TraderWallet;

  const txResult = await traderWalletContract.addProtocolToUse(2);
  console.log("Adapter Added txHash: ", txResult.hash, "\n\n");
};

// Add Trade Tokens to Wallet
const addTradeTokens = async () => {
  console.log("Add Trade Tokens to Wallet");
  const traderWalletContract = (await ethers.getContractAt(
    "TraderWallet",
    TRADER_WALLET_INSTANCE_ADDRESS
  )) as TraderWallet;

  const txResult = await traderWalletContract.addAllowedTradeTokens([
    TOKENS.usdc,
    // TOKENS.usdt,
    TOKENS.dai,
    // TOKENS.frax,
    TOKENS.weth,
    TOKENS.wbtc,
    TOKENS.link,
    // TOKENS.uni,
  ]);
  console.log("Trade Tokens Added txHash: ", txResult.hash, "\n\n");
};

// Add GMX Short Pairs to Wallet
const addGmxShortPairs = async () => {
  console.log("Add GMX Short Pairs to Wallet");
  const traderWalletContract = (await ethers.getContractAt(
    "TraderWallet",
    TRADER_WALLET_INSTANCE_ADDRESS
  )) as TraderWallet;

  const shortCollaterals = [TOKENS.usdc, TOKENS.usdt, TOKENS.dai, TOKENS.frax];
  const shortIndexTokens = [TOKENS.wbtc, TOKENS.weth, TOKENS.uni, TOKENS.link];

  const txResult = await traderWalletContract.addGmxShortPairs(
    shortCollaterals,
    shortIndexTokens
  );
  console.log("GMX Short Pairs Added txHash: ", txResult.hash, "\n\n");
};

// Add GMX Short Pairs to Wallet
const setTokenAllowanceOnWallet = async () => {
  console.log("Set Token Allowance on Wallet");

  const traderWalletContract = (await ethers.getContractAt(
    "TraderWallet",
    TRADER_WALLET_INSTANCE_ADDRESS
  )) as TraderWallet;

  let txResult;
  const allowedTokens = await traderWalletContract.getAllowedTradeTokens();
  for (let i = 0; i < allowedTokens.length; i++) {
    txResult = await traderWalletContract.setAdapterAllowanceOnToken(
      2,
      allowedTokens[i],
      false
    );
    console.log("Token Allowance on Wallet Set: ", txResult.hash);
  }
  console.log("\n\n");
};

// Add GMX Short Pairs to Vault
const setTokenAllowanceOnVault = async () => {
  console.log("Set Token Allowance on Vault");

  const traderWalletContract = (await ethers.getContractAt(
    "TraderWallet",
    TRADER_WALLET_INSTANCE_ADDRESS
  )) as TraderWallet;

  const usersVaultContract = (await ethers.getContractAt(
    "UsersVault",
    USERS_VAULT_INSTANCE_ADDRESS
  )) as UsersVault;

  let txResult;
  const allowedTokens = await traderWalletContract.getAllowedTradeTokens();
  for (let i = 0; i < allowedTokens.length; i++) {
    txResult = await usersVaultContract.setAdapterAllowanceOnToken(
      2,
      allowedTokens[i],
      false
    );
    console.log("Token Allowance on Vault Set: ", txResult.hash);
  }
  console.log("\n\n");
};

// Add Price Feeds to Dynamic Valuation contract
const addPriceFeeds = async () => {
  console.log("Add Feeds to Dynamic Valuation contract");

  const dynamicValuationContract = (await ethers.getContractAt(
    "DynamicValuation",
    DYNAMIC_VALUATION_ADDRESS
  )) as DynamicValuation;

  const tokensAddresses = [
    TOKENS.usdc,
    // TOKENS.usdt,
    TOKENS.dai,
    // TOKENS.frax,
    TOKENS.weth,
    TOKENS.wbtc,
    // TOKENS.uni,
    TOKENS.link,
  ];

  const tokensFeeds = [
    USD_FEEDS.usdc,
    // USD_FEEDS.usdt,
    USD_FEEDS.dai,
    // USD_FEEDS.frax,
    USD_FEEDS.weth,
    USD_FEEDS.wbtc,
    // USD_FEEDS.uni,
    USD_FEEDS.link,
  ];
  const tokensHeartbeat = [
    HEARTBEAT.usdc,
    // HEARTBEAT.usdt,
    HEARTBEAT.dai,
    // HEARTBEAT.frax,
    HEARTBEAT.weth,
    HEARTBEAT.wbtc,
    // HEARTBEAT.uni,
    HEARTBEAT.link,
  ];

  let txResult;
  for (let i = 0; i < tokensFeeds.length; i++) {
    txResult = await dynamicValuationContract.setChainlinkPriceFeed(
      tokensAddresses[i],
      tokensFeeds[i],
      tokensHeartbeat[i]
    );
    console.log("Feed Added to Dynamic Valuation contract: ", txResult.hash);
  }
  console.log("\n\n");
};

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("\n\n");
  console.log("\nCONFIGURING....");
  console.log(
    "=================================================================="
  );
  console.log("Network:", network.name);
  console.log("deployerAddress :>> ", deployer.address);
  console.log("\n");

  if (FACTORY_ADDRESS != "") {
    if (ADD_TRADER && TRADER_ADDRESS != "") {
      await addTrader();
    }
    if (REMOVE_TRADER && TRADER_ADDRESS != "") {
      await removeTrader();
    }

    if (ADD_INVESTOR && INVESTOR_ADDRESS != "") {
      await addInvestor();
    }
    if (REMOVE_INVESTOR && INVESTOR_ADDRESS != "") {
      await removeInvestor();
    }

    if (ADD_GLOBAL_TOKENS && TOKENS) {
      await addGlobalTokens();
    }
  } else {
    console.log("No ContractsFactory address provided");
  }

  if (TRADER_WALLET_INSTANCE_ADDRESS != "") {
    if (ADD_ADAPTER_TO_USE) {
      await addAdapterToUse();
    }
    if (ADD_TRADE_TOKENS && TOKENS) {
      await addTradeTokens();
    }
    if (ADD_GMX_SHORT_PAIRS && TOKENS) {
      await addGmxShortPairs();
    }
    if (SET_ALLOWANCE_WALLET && TOKENS) {
      await setTokenAllowanceOnWallet();
    }
  } else {
    console.log("No TraderWallet address provided");
  }

  if (
    USERS_VAULT_INSTANCE_ADDRESS != "" &&
    TRADER_WALLET_INSTANCE_ADDRESS != ""
  ) {
    if (SET_ALLOWANCE_VAULT && TOKENS) {
      await setTokenAllowanceOnVault();
    }
  } else {
    console.log("No TraderWallet address provided");
  }

  if (DYNAMIC_VALUATION_ADDRESS) {
    if (ADD_PRICE_FEEDS && USD_FEEDS) {
      await addPriceFeeds();
    }
  } else {
    console.log("No Dynamic Valuation address provided");
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
