import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import {
  AdaptersRegistryMock,
  DynamicValuation,
  GMXAdapter,
  UniswapV3Adapter,
  Lens,
} from "../../typechain-types";
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
} from "../../scripts/_helpers/deploymentFunctions";
import {
  tokens,
  usdFeeds,
  sequencerUptimeFeed,
} from "../_helpers/arbitrumAddresses";

export const setupContracts = async (
  deployer: Signer,
  deployerAddress: string
) => {
  const SHARES_NAME = "UsersVaultShares";
  const SHARES_SYMBOL = "UVS";

  // token contracts
  const wethTokenContract = await ethers.getContractAt(
    "ERC20Mock",
    tokens.weth
  );
  const wbtcTokenContract = await ethers.getContractAt(
    "ERC20Mock",
    tokens.wbtc
  );
  const usdcTokenContract = await ethers.getContractAt(
    "ERC20Mock",
    tokens.usdc
  );
  // const underlyingTokenAddress = usdcTokenContract.address;

  const ProxyAdminFactory = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdminFactory.deploy();

  const lensContract = await deployLens();

  const uniswapAdapterContract = (await deployUniswapV3Adapter(
    proxyAdmin
  )) as UniswapV3Adapter;
  const gmxAdapterContract = (await deployGMXLibrary()) as GMXAdapter;

  // deploy mocked adaptersRegistry
  const adaptersRegistryContract = (await deployAdaptersRegistry(
    uniswapAdapterContract.address,
    proxyAdmin
  )) as AdaptersRegistryMock;

  // set uniswap
  await adaptersRegistryContract.setReturnValue(true);
  await adaptersRegistryContract.setReturnAddress(
    uniswapAdapterContract.address
  );

  const TraderWalletImplementation = await deployTraderWalletImplementation(
    gmxAdapterContract.address
  );
  const UsersVaultImplementation = await deployUsersVaultImplementation(
    gmxAdapterContract.address
  );

  const contractsFactoryContract = await deployContractsFactory(
    BigNumber.from("30000000000000000"),
    deployerAddress,
    TraderWalletImplementation.address,
    UsersVaultImplementation.address,
    adaptersRegistryContract.address,
    lensContract.address,
    proxyAdmin
  );
  await contractsFactoryContract.addGlobalAllowedTokens([
    tokens.usdc,
    tokens.usdt,
    tokens.dai,
    tokens.frax,
    tokens.weth,
    tokens.wbtc,
    tokens.link,
    tokens.uni,
  ]);

  await contractsFactoryContract.addTrader(deployerAddress);
  await contractsFactoryContract.setLensAddress(lensContract.address);

  const traderWalletContract = await deployTraderWalletInstance(
    gmxAdapterContract.address,
    contractsFactoryContract.address,
    tokens.usdc,
    deployerAddress,
    deployerAddress
  );

  const usersVaultContract = await deployUsersVaultInstance(
    gmxAdapterContract.address,
    contractsFactoryContract.address,
    traderWalletContract.address,
    deployerAddress,
    SHARES_NAME,
    SHARES_SYMBOL
  );

  const gmxObserver = await deployGmxObserver();

  const dynamicValuationContract = (await deployDynamicValuation(
    contractsFactoryContract.address,
    gmxObserver.address,
    sequencerUptimeFeed,
    proxyAdmin
  )) as DynamicValuation;
  await dynamicValuationContract.deployed();

  // set return value to false so the adapter is not found
  // await contractsFactoryContract.setReturnValue(false);
  // await contractsFactoryContract.setIndexToReturn(0);

  await traderWalletContract.connect(deployer).addProtocolToUse(2);

  // // set return value to true so global tokens exits
  // await contractsFactoryContract.setReturnValue(true);
  const allowedTokens = [
    tokens.usdc,
    tokens.usdt,
    tokens.dai,
    tokens.frax,
    tokens.wbtc,
    tokens.weth,
    tokens.uni,
    tokens.link,
  ];
  await traderWalletContract
    .connect(deployer)
    .addAllowedTradeTokens(allowedTokens);
  const shortCollaterals = [tokens.usdc, tokens.usdt, tokens.dai, tokens.frax];
  const shortIndexTokens = [tokens.wbtc, tokens.weth, tokens.uni, tokens.link];
  await traderWalletContract
    .connect(deployer)
    .addGmxShortPairs(shortCollaterals, shortIndexTokens);

  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.usdc, false);
  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.usdt, false);
  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.dai, false);
  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.frax, false);
  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.weth, false);
  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.wbtc, false);
  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.uni, false);
  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.link, false);

  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.usdc, false);
  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.usdt, false);
  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.dai, false);
  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.frax, false);
  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.weth, false);
  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.wbtc, false);
  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.uni, false);
  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, tokens.link, false);

  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.usdc,
    usdFeeds.usdc,
    186400
  );
  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.usdt,
    usdFeeds.usdt,
    186400
  );
  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.dai,
    usdFeeds.dai,
    186400
  );
  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.frax,
    usdFeeds.frax,
    186400
  );
  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.weth,
    usdFeeds.weth,
    186400
  );
  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.wbtc,
    usdFeeds.wbtc,
    186400
  );
  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.uni,
    usdFeeds.uni,
    186400
  );
  await dynamicValuationContract.setChainlinkPriceFeed(
    tokens.link,
    usdFeeds.link,
    186400
  );
  console.log("Fork setup completed");
  return {
    usdcTokenContract,
    wbtcTokenContract,
    wethTokenContract,
    contractsFactoryContract,
    adaptersRegistryContract,
    traderWalletContract,
    usersVaultContract,
    uniswapAdapterContract,
    lensContract,
    dynamicValuationContract,
  };
};
