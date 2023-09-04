import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
import {
  TraderWalletTest,
  UsersVaultTest,
  ContractsFactoryMock,
  AdaptersRegistryMock,
  AdapterMock,
  UniswapV3Adapter,
  DynamicValuationMock,
} from "../../typechain-types";

let dynamicValuationContract: DynamicValuationMock;

export async function setupContracts(
  deployer: Signer,
  deployerAddress: string
) {
  const SHARES_NAME = "UsersVaultShares";
  const SHARES_SYMBOL = "UVS";

  // USDC contract
  const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
  const usdcTokenContract = await ERC20MockFactory.deploy("USDC", "USDC", 6);
  await usdcTokenContract.deployed();

  // WETH contract
  const wethTokenContract = await ERC20MockFactory.deploy("WETH", "WETH", 18);
  await wethTokenContract.deployed();

  // USDX contract
  const usdxTokenContract = await ERC20MockFactory.deploy("USDX", "USDX", 8);
  await usdxTokenContract.deployed();

  // deploy library
  const GMXAdapterLibraryFactory = await ethers.getContractFactory(
    "GMXAdapter"
  );
  const gmxAdapterContract = await GMXAdapterLibraryFactory.deploy();
  await gmxAdapterContract.deployed();

  // deploy uniswap adapter
  const UniswapAdapterFactory = await ethers.getContractFactory(
    "UniswapV3Adapter"
  );
  const uniswapAdapterContract = (await upgrades.deployProxy(
    UniswapAdapterFactory,
    [],
    {
      initializer: "initialize",
    }
  )) as UniswapV3Adapter;
  await uniswapAdapterContract.deployed();

  // deploy mocked adaptersRegistry
  const AdaptersRegistryFactory = await ethers.getContractFactory(
    "AdaptersRegistryMock"
  );
  const adaptersRegistryContract = (await upgrades.deployProxy(
    AdaptersRegistryFactory,
    []
  )) as AdaptersRegistryMock;
  await adaptersRegistryContract.deployed();

  // set uniswap
  await adaptersRegistryContract.setReturnValue(true);
  await adaptersRegistryContract.setReturnAddress(
    uniswapAdapterContract.address
  );

  // deploy mocked DynamicValuation
  const DynamicValuationfactory = await ethers.getContractFactory(
    "DynamicValuationMock"
  );
  dynamicValuationContract = (await DynamicValuationfactory.deploy(
    0
  )) as DynamicValuationMock;
  await dynamicValuationContract.deployed();

  // deploy mocked ContractsFactory
  const ContractsFactoryFactory = await ethers.getContractFactory(
    "ContractsFactoryMock"
  );
  const contractsFactoryContract = (await upgrades.deployProxy(
    ContractsFactoryFactory,
    []
  )) as ContractsFactoryMock;
  await contractsFactoryContract.deployed();
  // set TRUE for response
  await contractsFactoryContract.setReturnValue(true);
  await contractsFactoryContract.setAdaptersRegistryAddress(
    adaptersRegistryContract.address
  );
  // set the dynamic valuation address
  await contractsFactoryContract.setDynamicValuationAddress(
    dynamicValuationContract.address
  );

  // deploy mocked adapter
  const AdapterFactory = await ethers.getContractFactory("AdapterMock");
  const adapterContract = (await AdapterFactory.deploy()) as AdapterMock;
  await adapterContract.deployed();

  // deploy Trader Wallet
  const TraderWalletFactory = await ethers.getContractFactory(
    "TraderWalletTest",
    {
      libraries: {
        GMXAdapter: gmxAdapterContract.address,
      },
    }
  );

  const traderWalletContract = (await upgrades.deployProxy(
    TraderWalletFactory,
    [
      usdcTokenContract.address,
      deployerAddress,
      deployerAddress, // owner
    ],
    {
      initializer: "initialize",
      unsafeAllowLinkedLibraries: true,
    }
  )) as TraderWalletTest;
  await traderWalletContract.deployed();
  await traderWalletContract.setContractsFactoryAddress(
    contractsFactoryContract.address
  );

  // deploy User Vault
  const UsersVaultFactory = await ethers.getContractFactory("UsersVaultTest", {
    libraries: {
      GMXAdapter: gmxAdapterContract.address,
    },
  });

  const usersVaultContract = (await upgrades.deployProxy(
    UsersVaultFactory,
    [
      usdcTokenContract.address,
      traderWalletContract.address,
      deployerAddress, // owner
      SHARES_NAME,
      SHARES_SYMBOL,
    ],
    {
      initializer: "initialize",
      unsafeAllowLinkedLibraries: true,
    }
  )) as UsersVaultTest;
  await usersVaultContract.deployed();
  await usersVaultContract.setContractsFactoryAddress(
    contractsFactoryContract.address
  );

  // set vault address in trader wallet
  await traderWalletContract
    .connect(deployer)
    .setVaultAddress(usersVaultContract.address);

  // set return value to false so the adapter is not found
  await contractsFactoryContract.setReturnValue(false);
  await contractsFactoryContract.setIndexToReturn(0);
  await traderWalletContract.connect(deployer).addProtocolToUse(2);

  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, usdcTokenContract.address, false);

  await traderWalletContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, wethTokenContract.address, false);

  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, usdcTokenContract.address, false);

  await usersVaultContract
    .connect(deployer)
    .setAdapterAllowanceOnToken(2, wethTokenContract.address, false);

  // set return value to true so global tokens exits
  await contractsFactoryContract.setReturnValue(true);

  return {
    usdcTokenContract,
    wethTokenContract,
    usdxTokenContract,
    contractsFactoryContract,
    adaptersRegistryContract,
    adapterContract,
    traderWalletContract,
    usersVaultContract,
    uniswapAdapterContract,
    dynamicValuationContract,
  };
}
