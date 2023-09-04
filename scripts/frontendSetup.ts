import { ethers } from "hardhat";
import {
  Signer,
  ContractTransaction,
  BigNumber,
  utils,
  constants,
} from "ethers";
import { setBalance, setCode } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  TraderWallet,
  UsersVault,
  ContractsFactory,
  DynamicValuation,
  ERC20Mock,
  IGmxPositionRouter,
  Lens,
  GmxVaultPriceFeedMock,
  IGmxVault,
} from "../typechain-types";
import { ZERO_AMOUNT, ZERO_ADDRESS } from "../tests/_helpers/constants";
import { setupContracts } from "../tests/_helpers/setupFork";
import { tokens, gmx, tokenHolders } from "../tests/_helpers/arbitrumAddresses";

const createIncreasePositionEvent = utils.keccak256(
  utils.toUtf8Bytes("CreateIncreasePosition(address,bytes32)")
);

function requestKeyFromEvent(event: any): string {
  const requestKey = event.data.slice(66);
  return `0x${requestKey}`;
}

const abiCoder = new utils.AbiCoder();

let deployer: Signer;
let trader: Signer;
let user1: Signer;

let deployerAddress: string;
let traderAddress: string;
let underlyingTokenAddress: string;
let ownerAddress: string;
let user1Address: string;
let usdcHolder0: Signer;

let txResult: ContractTransaction;
let traderWalletContract: TraderWallet;
let usersVaultContract: UsersVault;
let contractsFactoryContract: ContractsFactory;
let gmxPositionRouter: IGmxPositionRouter;
let lensContract: Lens;
let gmxVaultPriceFeedMockContract: GmxVaultPriceFeedMock;
let gmxVaultPriceFeedMock: GmxVaultPriceFeedMock;
let gmxVault: IGmxVault;
let dynamicValuationContract: DynamicValuation;

let usdcTokenContract: ERC20Mock;
let wbtcTokenContract: ERC20Mock;

let userBalanceBefore: BigNumber;
let userBalanceAfter: BigNumber;
let vaultBalanceBefore: BigNumber;
let vaultBalanceAfter: BigNumber;

let signers: Array<Signer>;
let userAddresses: Array<string>;

let roundCounter: BigNumber;

let traderInputAmount: BigNumber;
let user1InputAmount: BigNumber;

let walletRequestKey: string;
let vaultRequestKey: string;

async function main(): Promise<void> {
  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  [deployer, user1] = await ethers.getSigners();

  // get addresses
  [deployerAddress, user1Address] = await Promise.all([
    deployer.getAddress(),
    user1.getAddress(),
  ]);

  // deploy contracts
  const contract = await setupContracts(deployer, deployerAddress);
  usdcTokenContract = contract.usdcTokenContract;
  wbtcTokenContract = contract.wbtcTokenContract;
  contractsFactoryContract = contract.contractsFactoryContract;
  traderWalletContract = contract.traderWalletContract;
  usersVaultContract = contract.usersVaultContract;
  lensContract = contract.lensContract;
  dynamicValuationContract = contract.dynamicValuationContract;

  gmxPositionRouter = await ethers.getContractAt(
    "IGmxPositionRouter",
    gmx.positionRouterAddress
  );
  gmxVault = await ethers.getContractAt("IGmxVault", gmx.vaultAddress);

  trader = deployer;
  traderAddress = deployerAddress;
  ownerAddress = deployerAddress;
  underlyingTokenAddress = usdcTokenContract.address;

  const GmxPriceFeedFactory = await ethers.getContractFactory(
    "GmxVaultPriceFeedMock"
  );
  gmxVaultPriceFeedMockContract = await GmxPriceFeedFactory.deploy();
  await gmxVaultPriceFeedMockContract.deployed();

  await contractsFactoryContract.addInvestor(user1Address);

  // initial funds
  await setBalance(tokenHolders.usdc[0], utils.parseEther("10"));
  usdcHolder0 = await ethers.getImpersonatedSigner(tokenHolders.usdc[0]);
  await usdcTokenContract
    .connect(usdcHolder0)
    .transfer(traderAddress, utils.parseUnits("10000", 6));
  await usdcTokenContract
    .connect(usdcHolder0)
    .transfer(user1Address, utils.parseUnits("90000", 6));

  console.log(
    `Trader ${traderAddress} balance`,
    await usdcTokenContract.balanceOf(traderAddress)
  );
  console.log(
    `User1 ${user1Address} balance`,
    await usdcTokenContract.balanceOf(user1Address)
  );

  // top up TraderWallet and UsersVault with ETH to pay fee on GMX
  await setBalance(traderWalletContract.address, utils.parseEther("1"));
  await setBalance(usersVaultContract.address, utils.parseEther("1"));

  // add gmx protocol
  const protocolId = 1; // GMX
  await traderWalletContract.connect(trader).addProtocolToUse(protocolId);

  // deposit funds
  traderInputAmount = utils.parseUnits("5000", 6);
  user1InputAmount = utils.parseUnits("10000", 6);
  await usdcTokenContract
    .connect(trader)
    .approve(traderWalletContract.address, traderInputAmount);
  await usdcTokenContract
    .connect(user1)
    .approve(usersVaultContract.address, user1InputAmount);
  await traderWalletContract.connect(trader).traderDeposit(traderInputAmount);
  await usersVaultContract.connect(user1).userDeposit(user1InputAmount);

  // first rollover
  await traderWalletContract.connect(trader).rollover();

  // long position
  const replicate = true;
  const tokenIn = tokens.usdc;
  let collateralToken = tokens.wbtc;
  let indexToken = collateralToken;
  let path = [tokenIn, collateralToken];
  let amountIn = utils.parseUnits("2000", 6);
  const minOut = 0;
  let sizeDelta = utils.parseUnits("10000", 30); // leverage x5
  let isLong = true;
  let tradeData = abiCoder.encode(
    ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
    [path, indexToken, amountIn, minOut, sizeDelta, isLong]
  );
  let operationId = 0; // increasePosition
  let traderOperation = { operationId, data: tradeData };

  let txResult = await traderWalletContract
    .connect(trader)
    .executeOnProtocol(protocolId, traderOperation, replicate);
  let txReceipt = await txResult.wait();
  let events = txReceipt.events?.filter(
    (event: any) => event.topics[0] === createIncreasePositionEvent
  );
  if (events) {
    walletRequestKey = requestKeyFromEvent(events[0]);
    vaultRequestKey = requestKeyFromEvent(events[1]);
  }
  // execute increasing positions by keeper
  const keeper = await ethers.getImpersonatedSigner(gmx.keeper);
  await setBalance(gmx.keeper, utils.parseEther("10"));
  await gmxPositionRouter
    .connect(keeper)
    .executeIncreasePosition(walletRequestKey, gmx.keeper);
  await gmxPositionRouter
    .connect(keeper)
    .executeIncreasePosition(vaultRequestKey, gmx.keeper);

  // add tokens for short
  await traderWalletContract
    .connect(deployer)
    .addGmxShortPairs([tokens.usdc], [tokens.weth]);

  // short position
  collateralToken = tokens.usdc;
  indexToken = tokens.weth;
  path = [collateralToken];
  amountIn = utils.parseUnits("2000", 6);
  sizeDelta = utils.parseUnits("8000", 30); // leverage x4
  isLong = false;
  tradeData = abiCoder.encode(
    ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
    [path, indexToken, amountIn, minOut, sizeDelta, isLong]
  );
  traderOperation = { operationId, data: tradeData };
  txResult = await traderWalletContract
    .connect(trader)
    .executeOnProtocol(protocolId, traderOperation, replicate);
  txReceipt = await txResult.wait();
  events = txReceipt.events?.filter(
    (event: any) => event.topics[0] === createIncreasePositionEvent
  );
  if (events) {
    walletRequestKey = requestKeyFromEvent(events[0]);
    vaultRequestKey = requestKeyFromEvent(events[1]);
  }
  // execute increasing positions by keeper
  await gmxPositionRouter
    .connect(keeper)
    .executeIncreasePosition(walletRequestKey, gmx.keeper);
  await gmxPositionRouter
    .connect(keeper)
    .executeIncreasePosition(vaultRequestKey, gmx.keeper);

  // add orders
  // increase long order
  console.log("Creating increase long order");
  collateralToken = tokens.uni;
  indexToken = collateralToken;
  path = [tokenIn, collateralToken];
  amountIn = utils.parseUnits("500", 6);
  sizeDelta = utils.parseUnits("2500", 30); // x5
  isLong = true;
  let triggerAboveThreshold = true;
  // let currentPrice: BigNumber;
  let currentPrice = (await lensContract.getGmxPrices(tokens.uni))
    .tokenMaxPrice;
  let triggerPrice = currentPrice.add(utils.parseUnits("4", 30));
  tradeData = abiCoder.encode(
    [
      "address[]",
      "uint256",
      "address",
      "uint256",
      "uint256",
      "bool",
      "uint256",
      "bool",
    ],
    [
      path,
      amountIn,
      indexToken,
      minOut,
      sizeDelta,
      isLong,
      triggerPrice,
      triggerAboveThreshold,
    ]
  );
  operationId = 2; // createIncreaseOrder
  traderOperation = { operationId, data: tradeData };
  txResult = await traderWalletContract
    .connect(trader)
    .executeOnProtocol(protocolId, traderOperation, replicate);
  await txResult.wait();

  // decrease order for short position
  console.log("Creating decrease order for shot position");
  collateralToken = tokens.usdc;
  indexToken = tokens.weth;
  isLong = false;
  triggerAboveThreshold = false; // take profit for short
  sizeDelta = utils.parseUnits("1000", 30); // decrease
  const collateralDelta = utils.parseUnits("500", 30); // decrease collateral
  currentPrice = currentPrice = (await lensContract.getGmxPrices(tokens.weth))
    .tokenMaxPrice;
  triggerPrice = currentPrice.sub(utils.parseUnits("45", 30));
  tradeData = abiCoder.encode(
    ["address", "uint256", "address", "uint256", "bool", "uint256", "bool"],
    [
      indexToken,
      sizeDelta,
      collateralToken,
      collateralDelta,
      isLong,
      triggerPrice,
      triggerAboveThreshold,
    ]
  );
  operationId = 5; // createDecreaseOrder
  traderOperation = { operationId, data: tradeData };
  txResult = await traderWalletContract
    .connect(trader)
    .executeOnProtocol(protocolId, traderOperation, replicate);
  await txResult.wait();

  currentPrice = BigNumber.from(0);
  console.log("==== Completed ====");
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
