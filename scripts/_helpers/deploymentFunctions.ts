import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";
import { ProxyAdmin } from "../../typechain-types";

export async function deployProxyAdmin() {
  console.log("DEPLOYING ProxyAdmin Contract");

  const proxyAdminFactory = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdminContract = await proxyAdminFactory.deploy();

  console.log("ProxyAdmin Contract DEPLOYED.");
  console.log("ProxyAdmin Contract Address:", proxyAdminContract.address);
  console.log("\n");

  return proxyAdminContract;
}

export async function deployLens() {
  console.log("DEPLOYING Lens Contract");
  const LensFactory = await ethers.getContractFactory("Lens");
  const lensContract = await LensFactory.deploy();
  await lensContract.deployed();
  console.log(
    "Lens Contract DEPLOYED. txHash:",
    lensContract.deployTransaction.hash
  );
  console.log("Lens Contract Address:", lensContract.address);
  console.log("\n");
  return lensContract;
}

export async function deployUniswapV3Adapter(proxyAdmin: ProxyAdmin) {
  console.log("DEPLOYING UniswapAdapter Contract");

  const UniswapV3AdapterFactory = await ethers.getContractFactory(
    "UniswapV3Adapter"
  );

  console.log("Deploying implementation");
  const UniswapV3AdapterInstance = await UniswapV3AdapterFactory.deploy();

  const TransparentUpgradeableProxyFactory = await ethers.getContractFactory(
    "TransparentUpgradeableProxy"
  );

  console.log("Deploying proxy");
  const uniswapAdapterProxy = await TransparentUpgradeableProxyFactory.deploy(
    UniswapV3AdapterInstance.address,
    proxyAdmin.address,
    (
      await UniswapV3AdapterInstance.populateTransaction.initialize()
    ).data!
  );
  await uniswapAdapterProxy.deployed();
  const uniswapAdapterContract = UniswapV3AdapterFactory.attach(
    uniswapAdapterProxy.address
  );

  console.log(
    "UniswapV3Adapter Contract DEPLOYED. txHash:",
    uniswapAdapterProxy.deployTransaction.hash
  );
  console.log(
    "UniswapV3Adapter Contract Address:",
    uniswapAdapterContract.address
  );
  console.log("\n");

  return uniswapAdapterContract;
}

export async function deployAdaptersRegistry(
  uniswapAdapterAddress: string,
  proxyAdmin: ProxyAdmin
) {
  console.log("DEPLOYING Adapter Registry Contract");

  const AdaptersRegistryFactory = await ethers.getContractFactory(
    "AdaptersRegistryMock"
  );
  console.log("Deploying implementation");
  const AdaptersRegistryInstance = await AdaptersRegistryFactory.deploy();

  const TransparentUpgradeableProxyFactory = await ethers.getContractFactory(
    "TransparentUpgradeableProxy"
  );

  console.log("Deploying proxy");
  const adaptersRegistryProxy = await TransparentUpgradeableProxyFactory.deploy(
    AdaptersRegistryInstance.address,
    proxyAdmin.address,
    (
      await AdaptersRegistryInstance.populateTransaction.initialize()
    ).data!
  );
  await adaptersRegistryProxy.deployed();
  const adaptersRegistryContract = AdaptersRegistryFactory.attach(
    adaptersRegistryProxy.address
  );

  console.log(
    "AdaptersRegistry Contract DEPLOYED. txHash:",
    adaptersRegistryProxy.deployTransaction.hash
  );
  console.log(
    "AdaptersRegistry Contract Address:",
    adaptersRegistryContract.address
  );

  console.log("Set Uniswap Adapter on Registry");
  let txResult = await adaptersRegistryContract.setReturnAddress(
    uniswapAdapterAddress
  );
  console.log("Uniswap Adapter Set txHash: ", txResult.hash);

  console.log("Set Return Value to TRUE in Adapter Registry");
  txResult = await adaptersRegistryContract.setReturnValue(true);
  console.log("Return Value Set txHash: ", txResult.hash, "\n\n");

  return adaptersRegistryContract;
}

export async function deployGMXLibrary() {
  console.log("DEPLOYING GMX Library");

  const GMXAdapterLibraryFactory = await ethers.getContractFactory(
    "GMXAdapter"
  );
  const gmxAdapterContract = await GMXAdapterLibraryFactory.deploy();
  await gmxAdapterContract.deployed();

  console.log(
    "GMX Library DEPLOYED. txHash: ",
    gmxAdapterContract.deployTransaction.hash
  );
  console.log("Contract Address: ", gmxAdapterContract.address);
  console.log("\n");
  return gmxAdapterContract;
}

export async function deployTraderWalletImplementation(
  gmxLibraryAddress: string
) {
  console.log("DEPLOYING TraderWallet Implementation Contract");

  const TraderWalletFactory = await ethers.getContractFactory("TraderWallet", {
    libraries: {
      GMXAdapter: gmxLibraryAddress,
    },
  });

  const TraderWallet = await TraderWalletFactory.deploy();

  console.log(
    "TraderWallet Implementation Contract DEPLOYED. txHash:",
    TraderWallet.deployTransaction.hash
  );
  console.log(
    "TraderWallet Implementation Contract Address:",
    TraderWallet.address
  );
  console.log("\n");

  return TraderWallet;
}

export async function deployUsersVaultImplementation(
  gmxLibraryAddress: string
) {
  console.log("DEPLOYING UsersVault Implementation Contract");
  const UsersVaultFactory = await ethers.getContractFactory("UsersVault", {
    libraries: {
      GMXAdapter: gmxLibraryAddress,
    },
  });

  const UsersVault = await UsersVaultFactory.deploy();

  console.log(
    "UsersVault implementation Contract DEPLOYED. txHash:",
    UsersVault.deployTransaction.hash
  );
  console.log(
    "UsersVault implementation Contract Address:",
    UsersVault.address
  );
  console.log("\n");

  return UsersVault;
}

export async function deployContractsFactory(
  feeRate: BigNumber,
  feeReceiver: string,
  walletImplementationAddress: string,
  vaultImplementationAddress: string,
  adaptersRegistryAddress: string,
  lensContractAddress: string,
  proxyAdmin: ProxyAdmin
) {
  console.log("DEPLOYING ContractsFactory Contract");
  const ContractsFactoryFactory = await ethers.getContractFactory(
    "ContractsFactory"
  );
  console.log("Deploying implementation");
  const ContractsFactoryInstance = await ContractsFactoryFactory.deploy();

  const TransparentUpgradeableProxyFactory = await ethers.getContractFactory(
    "TransparentUpgradeableProxy"
  );

  console.log("Deploying proxy");
  const contractsFactoryProxy = await TransparentUpgradeableProxyFactory.deploy(
    ContractsFactoryInstance.address,
    proxyAdmin.address,
    (
      await ContractsFactoryInstance.populateTransaction.initialize(
        feeRate,
        feeReceiver,
        walletImplementationAddress,
        vaultImplementationAddress
      )
    ).data!
  );
  await contractsFactoryProxy.deployed();
  const contractsFactoryContract = ContractsFactoryFactory.attach(
    contractsFactoryProxy.address
  );

  console.log(
    "ContractsFactory Contract DEPLOYED. txHash:",
    contractsFactoryProxy.deployTransaction.hash
  );
  console.log(
    "ContractsFactory Contract Address:",
    contractsFactoryContract.address
  );

  console.log("Set Adapter Registry in Factory");
  const txResult = await contractsFactoryContract.setAdaptersRegistryAddress(
    adaptersRegistryAddress
  );
  console.log("Adapter Registry Set txHash: ", txResult.hash, "\n\n");

  console.log("Set Lens in Factory");
  const txResult2 = await contractsFactoryContract.setLensAddress(
    lensContractAddress
  );
  console.log("Lens Set txHash: ", txResult2.hash, "\n\n");

  return contractsFactoryContract;
}

export async function deployTraderWalletInstance(
  gmxLibraryAddress: string,
  contractsFactoryAddress: string,
  underlyingTokenAddress: string,
  traderAddress: string,
  owner: string
) {
  console.log("DEPLOYING TraderWallet Instance Contract");

  const contractsFactoryContract = await ethers.getContractAt(
    "ContractsFactory",
    contractsFactoryAddress
  );
  const numOfTraderWallets =
    await contractsFactoryContract.numOfTraderWallets();

  const tx = await contractsFactoryContract.deployTraderWallet(
    underlyingTokenAddress,
    traderAddress,
    owner
  );

  const traderWalletAddress = await contractsFactoryContract.traderWalletsArray(
    numOfTraderWallets
  );

  const TraderWalletFactory = await ethers.getContractFactory("TraderWallet", {
    libraries: {
      GMXAdapter: gmxLibraryAddress,
    },
  });
  const traderWalletContract = await TraderWalletFactory.attach(
    traderWalletAddress
  );

  console.log("TraderWallet Instance Contract DEPLOYED. txHash:", tx.hash);
  console.log(
    "TraderWallet Instance Contract Address:",
    traderWalletContract.address
  );
  console.log("\n");

  return traderWalletContract;
}

export async function deployUsersVaultInstance(
  gmxLibraryAddress: string,
  contractsFactoryAddress: string,
  traderWalletAddress: string,
  owner: string,
  sharesName: string,
  sharesSymbol: string
) {
  console.log("DEPLOYING UsersVault Instance Contract");

  const contractsFactoryContract = await ethers.getContractAt(
    "ContractsFactory",
    contractsFactoryAddress
  );

  const traderWalletContract = await ethers.getContractAt(
    "TraderWallet",
    traderWalletAddress
  );

  const numOfUsersVaults = await contractsFactoryContract.numOfUsersVaults();

  const tx = await contractsFactoryContract.deployUsersVault(
    traderWalletContract.address,
    owner,
    sharesName,
    sharesSymbol
  );

  const usersVaultAddress = await contractsFactoryContract.usersVaultsArray(
    numOfUsersVaults
  );

  const UsersVaultFactory = await ethers.getContractFactory("UsersVault", {
    libraries: {
      GMXAdapter: gmxLibraryAddress,
    },
  });
  const UsersVault = await UsersVaultFactory.attach(usersVaultAddress);

  console.log("UsersVault Instance Contract DEPLOYED. txHash:", tx.hash);
  console.log(
    "UsersVault Instance Contract Address:",
    UsersVault.address,
    "\n\n"
  );

  return UsersVault;
}

export async function deployGmxObserver() {
  console.log("DEPLOYING GMX Observer Contract");

  const gmxObserverFactory = await ethers.getContractFactory("GMXObserver");
  const gmxObserverContract = await gmxObserverFactory.deploy();
  await gmxObserverContract.deployed();

  console.log(
    "GMX Observer Contract DEPLOYED. txHash:",
    gmxObserverContract.deployTransaction.hash
  );
  console.log(
    "GMX Observer Contract Address:",
    gmxObserverContract.address,
    "\n\n"
  );
  return gmxObserverContract;
}

export async function deployDynamicValuation(
  contractsFactoryAddress: string,
  gmxObserverAddress: string,
  sequencerUptime: string,
  proxyAdmin: ProxyAdmin
) {
  console.log("DEPLOYING DynamicValuation Contract");

  const DynamicValuationFactory = await ethers.getContractFactory(
    "DynamicValuation"
  );
  console.log("Deploying implementation");
  const DynamicValuationInstance = await DynamicValuationFactory.deploy();

  const TransparentUpgradeableProxyFactory = await ethers.getContractFactory(
    "TransparentUpgradeableProxy"
  );

  console.log("Deploying proxy");
  const dynamicValuationProxy = await TransparentUpgradeableProxyFactory.deploy(
    DynamicValuationInstance.address,
    proxyAdmin.address,
    (
      await DynamicValuationInstance.populateTransaction.initialize(
        contractsFactoryAddress,
        sequencerUptime,
        gmxObserverAddress
      )
    ).data!
  );
  await dynamicValuationProxy.deployed();
  const dynamicValuationContract = DynamicValuationFactory.attach(
    dynamicValuationProxy.address
  );

  console.log(
    "DynamicValuation Contract DEPLOYED. txHash:",
    dynamicValuationProxy.deployTransaction.hash
  );
  console.log(
    "DynamicValuation Contract Address:",
    dynamicValuationContract.address
  );

  console.log("Set Dynamic Valuation Address on Factory");
  const contractsFactoryContract = await ethers.getContractAt(
    "ContractsFactory",
    contractsFactoryAddress
  );
  const txResult = await contractsFactoryContract.setDynamicValuationAddress(
    dynamicValuationContract.address
  );
  console.log("Dynamic Valuation Address Set txHash: ", txResult.hash, "\n\n");

  return dynamicValuationContract;
}
