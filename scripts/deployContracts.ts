/* eslint-disable no-process-exit */
import { ethers, network, upgrades } from "hardhat";
import {
  deployLens,
  deployUniswapV3Adapter,
  deployAdaptersRegistry,
  deployGMXLibrary,
  deployTraderWalletImplementation,
  deployUsersVaultImplementation,
  deployContractsFactory,
  deployTraderWalletInstance,
  deployUsersVaultInstance,
  deployGmxObserver,
  deployDynamicValuation,
  deployProxyAdmin,
} from "./_helpers/deploymentFunctions";

import {
  GMX_LIBRARY_ADDRESS,
  UNISWAP_ADAPTER_ADDRESS,
  ADAPTER_REGISTRY_ADDRESS,
  WALLET_IMPLEMENTATION_ADDRESS,
  VAULT_IMPLEMENTATION_ADDRESS,
  FACTORY_ADDRESS,
  TRADER_WALLET_INSTANCE_ADDRESS,
  GMX_OBSERVER_ADDRESS,
  FEE_RATE,
  UNDERLYING_TOKEN_ADDRESS,
  SHARES_NAME,
  SHARES_SYMBOL,
  SEQUENCER_UPTIME,
  WHITELISTED_TRADERS,
  WHITELISTED_USERS,
  TOKENS,
  USD_FEEDS,
  HEARTBEAT,
  LENS_ADDRESS,
} from "./_helpers/data";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////                                                                                             //////////////////////
/////  CONFIGURATION FLAGS TO SELECT WHAT TO DEPLOY                                               //////////////////////
/////                                                                                             //////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////                                                                                             //////////////////////
/////  COMPLETE ./_helpers/data.ts WITH VALID ADDRESSES IF THERE ARE ALREADY DEPLOYED CONTRACTS   //////////////////////
/////                                                                                             //////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const DEPLOY_LENS = true;
const DEPLOY_GMX_LIBRARY = true;
const DEPLOY_UNISWAP_ADAPTER = true;
const DEPLOY_ADAPTER_REGISTRY = true;
const DEPLOY_WALLET_IMPLEMENTATION = true;
const DEPLOY_VAULT_IMPLEMENTATION = true;
const DEPLOY_FACTORY = true;
const DEPLOY_GMX_OBSERVER = true;
const DEPLOY_DYNAMIC_VALUATION = true;
const DEPLOY_TRADER_WALLET_INSTANCE = true;
const DEPLOY_USERS_VAULT_INSTANCE = true;

/* const DEPLOY_LENS = false;
const DEPLOY_GMX_LIBRARY = false;
const DEPLOY_UNISWAP_ADAPTER = false;
const DEPLOY_ADAPTER_REGISTRY = false;
const DEPLOY_WALLET_IMPLEMENTATION = false;
const DEPLOY_VAULT_IMPLEMENTATION = false;
const DEPLOY_FACTORY = false;
const DEPLOY_GMX_OBSERVER = false;
// const DEPLOY_DYNAMIC_VALUATION = false;
const DEPLOY_TRADER_WALLET_INSTANCE = false;
const DEPLOY_USERS_VAULT_INSTANCE = false; */

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function main(): Promise<void> {
  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  console.clear();

  const [deployer] = await ethers.getSigners();
  console.log("\n\n");
  console.log("\nDEPLOYING....");
  console.log(
    "=================================================================="
  );
  console.log("Network:", network.name);
  console.log("deployerAddress :>> ", deployer.address);
  console.log("\n");

  console.log(
    "Balance before:",
    (await ethers.provider.getBalance(deployer.address)).toString()
  );

  let lensContract = undefined;
  let uniswapAdapterContract = undefined;
  let adaptersRegistryContract = undefined;
  let gmxLibraryContract = undefined;
  let walletImplementationContract = undefined;
  let vaultImplementationContract = undefined;
  let contractsFactoryContract = undefined;
  let traderWalletInstanceContract = undefined;
  let usersVaultInstanceContract = undefined;
  let gmxObserverContract = undefined;
  let dynamicValuationContract = undefined;

  const proxyAdmin = await deployProxyAdmin();

  /* const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const UNDERLYING_TOKEN_CONTRACT = await ERC20Mock.deploy("Test", "Test", 18);
  const UNDERLYING_TOKEN_ADDRESS = UNDERLYING_TOKEN_CONTRACT.address; */

  // DEPLOY LENS
  if (DEPLOY_LENS) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    lensContract = await deployLens();
  }

  // DEPLOY UNISWAP ADAPTER
  if (DEPLOY_UNISWAP_ADAPTER) {
    uniswapAdapterContract = await deployUniswapV3Adapter(proxyAdmin);
  }

  // DEPLOY ADAPTER REGISTRY
  const uniswapAdapterAddress =
    uniswapAdapterContract?.address || UNISWAP_ADAPTER_ADDRESS;
  if (DEPLOY_ADAPTER_REGISTRY && uniswapAdapterAddress != "") {
    adaptersRegistryContract = await deployAdaptersRegistry(
      uniswapAdapterAddress,
      proxyAdmin
    );
  } else {
    console.log("ADAPTER REGISTRY deployment error - Parameter missing !");
  }

  // DEPLOY GMX LIBRARY
  if (DEPLOY_GMX_LIBRARY) {
    gmxLibraryContract = await deployGMXLibrary();
  }

  // DEPLOY WALLET IMPLEMENTATION
  const gmxLibraryAddress = gmxLibraryContract?.address || GMX_LIBRARY_ADDRESS;
  if (DEPLOY_WALLET_IMPLEMENTATION && gmxLibraryAddress != "") {
    walletImplementationContract = await deployTraderWalletImplementation(
      gmxLibraryAddress
    );
  } else {
    console.log("WALLET IMPLEMENTATION deployment error - Parameter missing !");
  }

  // DEPLOY VAULT IMPLEMENTATION
  if (DEPLOY_VAULT_IMPLEMENTATION && gmxLibraryAddress != "") {
    vaultImplementationContract = await deployUsersVaultImplementation(
      gmxLibraryAddress
    );
  } else {
    console.log("VAULT IMPLEMENTATION deployment error - Parameter missing !");
  }

  // DEPLOY FACTORY
  const walletImplementationAddress =
    walletImplementationContract?.address || WALLET_IMPLEMENTATION_ADDRESS;
  const vaultImplementationAddress =
    vaultImplementationContract?.address || VAULT_IMPLEMENTATION_ADDRESS;
  const adaptersRegistryAddress =
    adaptersRegistryContract?.address || ADAPTER_REGISTRY_ADDRESS;
  const lensContractAddress = lensContract?.address || LENS_ADDRESS;
  if (
    DEPLOY_FACTORY &&
    FEE_RATE &&
    walletImplementationAddress != "" &&
    vaultImplementationAddress != "" &&
    adaptersRegistryAddress != ""
  ) {
    contractsFactoryContract = await deployContractsFactory(
      FEE_RATE,
      deployer.address,
      walletImplementationAddress,
      vaultImplementationAddress,
      adaptersRegistryAddress,
      lensContractAddress,
      proxyAdmin
    );

    // ADD TRADER TO ALLOWED
    console.log("Add trader to factory");
    const txResult = await contractsFactoryContract.addTrader(deployer.address);
    console.log("Trader Added txHash: ", txResult.hash, "\n\n");

    // ADD ALLOWED TOKENS
    console.log("Add allowed tokens to the factory");
    const txResult2 = await contractsFactoryContract.addGlobalAllowedTokens(
      Object.values(TOKENS)
    );
    console.log("Allowed tokens Added txHash: ", txResult2.hash, "\n\n");
  } else {
    console.log("FACTORY deployment error - Parameter missing !");
  }

  // DEPLOY TRADER WALLET INSTANCE
  const contractsFactoryAddress =
    contractsFactoryContract?.address || FACTORY_ADDRESS;

  if (
    DEPLOY_TRADER_WALLET_INSTANCE &&
    gmxLibraryAddress != "" &&
    contractsFactoryAddress != "" &&
    UNDERLYING_TOKEN_ADDRESS != ""
  ) {
    traderWalletInstanceContract = await deployTraderWalletInstance(
      gmxLibraryAddress,
      contractsFactoryAddress,
      UNDERLYING_TOKEN_ADDRESS,
      deployer.address,
      deployer.address
    );
  } else {
    console.log("WALLET INSTANCE deployment error - Parameter missing !");
  }

  // DEPLOY USERS VAULT INSTANCE
  const traderWalletInstanceAddress =
    traderWalletInstanceContract?.address || TRADER_WALLET_INSTANCE_ADDRESS;
  if (DEPLOY_USERS_VAULT_INSTANCE && traderWalletInstanceAddress != "") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    usersVaultInstanceContract = await deployUsersVaultInstance(
      gmxLibraryAddress,
      contractsFactoryAddress,
      traderWalletInstanceAddress,
      deployer.address,
      SHARES_NAME,
      SHARES_SYMBOL
    );
  } else {
    console.log("VAULT INSTANCE deployment error - Parameter missing !");
  }

  if (DEPLOY_GMX_OBSERVER) {
    gmxObserverContract = await deployGmxObserver();
  }

  const gmxObserverAddress =
    gmxObserverContract?.address || GMX_OBSERVER_ADDRESS;

  if (
    DEPLOY_DYNAMIC_VALUATION &&
    gmxObserverAddress != "" &&
    contractsFactoryAddress != "" &&
    SEQUENCER_UPTIME
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dynamicValuationContract = await deployDynamicValuation(
      contractsFactoryAddress,
      gmxObserverAddress,
      SEQUENCER_UPTIME,
      proxyAdmin
    );

    console.log("Add oracles to dynamic valuation");
    const keys = Object.keys(USD_FEEDS);
    for (const key of keys) {
      console.log(
        "Adding token",
        TOKENS[key as keyof typeof TOKENS],
        "to DynamicValuation"
      );
      await dynamicValuationContract.setChainlinkPriceFeed(
        TOKENS[key as keyof typeof TOKENS],
        USD_FEEDS[key as keyof typeof USD_FEEDS],
        HEARTBEAT[key as keyof typeof HEARTBEAT]
      );
      console.log(
        "Token",
        TOKENS[key as keyof typeof TOKENS],
        "added to DynamicValuation"
      );
    }
    console.log("\n\n");
  } else {
    console.log("DYNAMIC VALUATION deployment error - Parameter missing !");
  }

  if (contractsFactoryContract) {
    console.log("Adding investors and traders...");

    await contractsFactoryContract.addInvestors(WHITELISTED_USERS);

    console.log("Investors added");

    await contractsFactoryContract.addTraders(WHITELISTED_TRADERS);

    console.log("Traders added");

    console.log("Investors and traders have been added.");
  }

  console.log(
    "\n==================================================================\n"
  );
  console.log("DEPLOYMENT FINISHED....\n\n");

  console.log(
    "Balance after:",
    (await ethers.provider.getBalance(deployer.address)).toString()
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
