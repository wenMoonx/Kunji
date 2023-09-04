/* eslint-disable @typescript-eslint/no-explicit-any */
import { setBalance, setCode } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  Signer,
  ContractFactory,
  ContractTransaction,
  BigNumber,
  utils,
  constants,
} from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  GMXAdapter,
  TraderWallet,
  Lens,
  ERC20Mock,
  IGmxRouter,
  IGmxVault,
  IGmxPositionRouter,
  GmxVaultPriceFeedMock,
  IGmxPositionManager,
  UsersVaultMock,
  ContractsFactoryMock,
  TraderWalletTest__factory,
  TraderWalletTest,
  DynamicValuationMock,
  AdaptersRegistryMock,
  UniswapV3Adapter,
} from "../../typechain-types";
import Reverter from "../_helpers/reverter";
import { ReverterLocal } from "../_helpers/reverter";
import { tokens, gmx, tokenHolders } from "../_helpers/arbitrumAddresses";

const reverter = new Reverter();
const reverterLocal = new ReverterLocal();

const abiCoder = new utils.AbiCoder();

let trader: Signer;
let owner: Signer;
let usdcHolder0: Signer;
let usersVaultContract: UsersVaultMock;

let underlyingTokenAddress: string;
let traderAddress: string;
let ownerAddress: string;

let txResult: ContractTransaction;
let TraderWalletFactory: TraderWalletTest__factory;
let traderWalletContract: TraderWalletTest;
let usdcTokenContract: ERC20Mock;
let wbtcTokenContract: ERC20Mock;

let contractsFactoryContract: ContractsFactoryMock;
let GMXAdapterFactory: ContractFactory;
let gmxAdapterLibrary: GMXAdapter;
let gmxRouter: IGmxRouter;
let gmxPositionRouter: IGmxPositionRouter;
let gmxVault: IGmxVault;
let gmxVaultPriceFeedMockContract: GmxVaultPriceFeedMock;
let gmxVaultPriceFeedMock: GmxVaultPriceFeedMock;
let gmxPositionManager: IGmxPositionManager;
let dynamicValuationContract: DynamicValuationMock;
let adapterRegistryContract: AdaptersRegistryMock;
let LensFactory: ContractFactory;
let lensContract: Lens;

const protocolId = 1; // GMX

const increaseRound = async (
  _traderWalletContract: TraderWallet,
  _usersVaultContract: UsersVaultMock
) => {
  await usdcTokenContract
    .connect(trader)
    .approve(traderWalletContract.address, utils.parseUnits("1", 6));

  // deposit so rollover can be executed
  await _traderWalletContract
    .connect(trader)
    .traderDeposit(utils.parseUnits("1", 6));

  // for rollover return ok
  await _usersVaultContract.setReturnValue(true);

  // increase users vault round
  await _usersVaultContract.setRound(1);

  // so the round is increased
  await _traderWalletContract.connect(trader).rollover();
};

const createIncreasePositionEvent = utils.keccak256(
  utils.toUtf8Bytes("CreateIncreasePosition(address,bytes32)")
);
const createDecreasePositionEvent = utils.keccak256(
  utils.toUtf8Bytes("CreateDecreasePosition(address,bytes32)")
);
// const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function requestKeyFromEvent(event: any): string {
  const requestKey = event.data.slice(66);
  return `0x${requestKey}`;
}

describe("GMXAdapter", function () {
  before(async () => {
    gmxRouter = await ethers.getContractAt("IGmxRouter", gmx.routerAddress);
    gmxPositionRouter = await ethers.getContractAt(
      "IGmxPositionRouter",
      gmx.positionRouterAddress
    );
    await ethers.getContractAt("IGmxReader", gmx.readerAddress);
    gmxVault = await ethers.getContractAt("IGmxVault", gmx.vaultAddress);
    await ethers.getContractAt("IGmxOrderBook", gmx.orderBookAddress);

    gmxPositionManager = await ethers.getContractAt(
      "IGmxPositionManager",
      gmx.positionManagerAddress
    );

    [trader, owner] = await ethers.getSigners();

    [traderAddress, ownerAddress] = await Promise.all([
      trader.getAddress(),
      owner.getAddress(),
    ]);

    // deploy mocked DynamicValuation
    const DynamicValuationfactory = await ethers.getContractFactory(
      "DynamicValuationMock"
    );
    dynamicValuationContract = (await DynamicValuationfactory.deploy(
      0
    )) as DynamicValuationMock;
    await dynamicValuationContract.deployed();

    // set mock oracle price 1 to avoid division by zero error
    await dynamicValuationContract.setOraclePrice(1);

    wbtcTokenContract = await ethers.getContractAt("ERC20Mock", tokens.wbtc);
    usdcTokenContract = await ethers.getContractAt("ERC20Mock", tokens.usdc);
    underlyingTokenAddress = usdcTokenContract.address;

    usdcHolder0 = await ethers.getImpersonatedSigner(tokenHolders.usdc[0]);
    await usdcTokenContract
      .connect(usdcHolder0)
      .transfer(traderAddress, utils.parseUnits("1001", 6));

    LensFactory = await ethers.getContractFactory("Lens");
    lensContract = (await LensFactory.deploy()) as Lens;
    await lensContract.deployed();

    // gmx adapter
    GMXAdapterFactory = await ethers.getContractFactory("GMXAdapter");
    gmxAdapterLibrary = (await GMXAdapterFactory.deploy()) as GMXAdapter;
    await gmxAdapterLibrary.deployed();

    // uniswap adapter
    const UniswapAdapterF = await ethers.getContractFactory("UniswapV3Adapter");
    const uniswapAdapter: UniswapV3Adapter = (await upgrades.deployProxy(
      UniswapAdapterF,
      [],
      {
        initializer: "initialize",
      }
    )) as UniswapV3Adapter;
    await uniswapAdapter.deployed();

    TraderWalletFactory = await ethers.getContractFactory("TraderWalletTest", {
      libraries: {
        GMXAdapter: gmxAdapterLibrary.address,
      },
    });
    const traderWalletProxy = await upgrades.deployProxy(
      TraderWalletFactory,
      [underlyingTokenAddress, traderAddress, ownerAddress],
      {
        initializer: "initialize",
        unsafeAllowLinkedLibraries: true,
      }
    );
    traderWalletContract = TraderWalletFactory.attach(
      traderWalletProxy.address
    );
    await traderWalletContract.deployed();

    const GmxPriceFeedFactory = await ethers.getContractFactory(
      "GmxVaultPriceFeedMock"
    );
    gmxVaultPriceFeedMockContract = await GmxPriceFeedFactory.deploy();
    await gmxVaultPriceFeedMockContract.deployed();

    /////////////////////////////////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////

    // deploy mocked ContractsFactory
    const ContractsFactoryFactory = await ethers.getContractFactory(
      "ContractsFactoryMock"
    );
    contractsFactoryContract = (await upgrades.deployProxy(
      ContractsFactoryFactory,
      []
    )) as ContractsFactoryMock;
    await contractsFactoryContract.deployed();
    await traderWalletContract
      .connect(owner)
      .setContractsFactoryAddress(contractsFactoryContract.address);
    // set TRUE for response
    await contractsFactoryContract.setReturnValue(true);
    // set the dynamic valuation address
    await contractsFactoryContract.setDynamicValuationAddress(
      dynamicValuationContract.address
    );

    const AdaptersRegistryFactory = await ethers.getContractFactory(
      "AdaptersRegistryMock"
    );
    adapterRegistryContract = (await upgrades.deployProxy(
      AdaptersRegistryFactory,
      [],
      { initializer: "initialize", verifySourceCode: true }
    )) as AdaptersRegistryMock;
    await adapterRegistryContract.deployed();

    await contractsFactoryContract.setAdaptersRegistryAddress(
      adapterRegistryContract.address
    );

    // deploy mocked Vault
    const UsersVaultFactory = await ethers.getContractFactory("UsersVaultMock");
    usersVaultContract = (await UsersVaultFactory.deploy()) as UsersVaultMock;
    await usersVaultContract.deployed();
    await traderWalletContract
      .connect(owner)
      .setVaultAddress(usersVaultContract.address);

    await traderWalletContract.connect(trader).addProtocolToUse(protocolId);

    await adapterRegistryContract.connect(trader).setReturnValue(true);
    await adapterRegistryContract
      .connect(trader)
      .setReturnAddress(uniswapAdapter.address);
    await traderWalletContract.connect(trader).addProtocolToUse(2);

    // so no round ZERO check fail
    await increaseRound(traderWalletContract, usersVaultContract);
    await reverter.snapshot();
  });

  describe("GMX Lens", function () {
    it("Should return values for available liquidity", async () => {
      const liquidity = await lensContract.getAvailableLiquidity(tokens.wbtc);
      expect(liquidity.availableLong).to.be.gt(100);
      expect(liquidity.availableShort).to.be.gt(100);
    });
  });

  describe("Adapter deployment parameters", function () {
    describe("Correct initial fixture", function () {
      it("Should has USDC balance on the trader address", async () => {
        expect(await usdcTokenContract.balanceOf(traderAddress)).to.equal(
          utils.parseUnits("1000", 6)
        );
      });
    });

    describe("Correct initial parameters", function () {
      it("Should has approval for positionRouter plugin", async () => {
        expect(
          await gmxRouter.approvedPlugins(
            traderWalletContract.address,
            gmxPositionRouter.address
          )
        ).to.equal(true);
      });
    });

    describe("Reverts when token are not added for trading", function () {
      const amount = utils.parseUnits("1000", 6);
      const replicate = false;

      before(async () => {
        await usdcTokenContract
          .connect(trader)
          .approve(traderWalletContract.address, amount);
      });

      after(async () => {
        await reverter.revert();
      });

      it("Should revert creating LONG position if tokens were not added to allowed tradelist", async () => {
        const isLong = true;
        const tokenIn = tokens.usdc;
        const collateralToken = tokens.wbtc;
        const indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        const amountIn = amount;
        const minOut = 0;
        const sizeDelta = utils.parseUnits("2000", 30);

        const tradeData = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path, indexToken, amountIn, minOut, sizeDelta, isLong]
        );
        const operationId = 0; // increasePosition
        const traderOperation = { operationId, data: tradeData };

        await expect(
          traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate)
        ).to.be.revertedWithCustomError(
          gmxAdapterLibrary.attach(traderWalletContract.address),
          "NotSupportedTokens"
        );
      });

      it("Should revert creating SHORT position if tokens were not added to allowed tradelist", async () => {
        const isLong = false;
        const tokenIn = tokens.usdc;
        const collateralToken = tokenIn;
        const indexToken = tokens.wbtc;
        const path = [tokenIn];
        const amountIn = amount;
        const minOut = 0;
        const sizeDelta = utils.parseUnits("2000", 30);

        const tradeData = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path, indexToken, amountIn, minOut, sizeDelta, isLong]
        );
        const operationId = 0; // increasePosition
        const traderOperation = { operationId, data: tradeData };

        await expect(
          traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate)
        ).to.be.revertedWithCustomError(
          gmxAdapterLibrary.attach(traderWalletContract.address),
          "NotSupportedTokens"
        );
      });
    });

    describe("Reverts with creating new orders", function () {
      const amount = utils.parseUnits("1000", 6);
      const replicate = false;

      let indexToken: string;
      let collateralToken: string;
      let traderOperation: any;
      before(async () => {
        await usdcTokenContract
          .connect(trader)
          .approve(traderWalletContract.address, amount);

        const allowedTokens = [
          tokens.usdc,
          tokens.usdt,
          tokens.wbtc,
          tokens.weth,
        ];

        await contractsFactoryContract.setAllowedGlobalToken(
          allowedTokens,
          true
        );

        await traderWalletContract
          .connect(trader)
          .addAllowedTradeTokens(allowedTokens);

        const isLong = true;
        const tokenIn = tokens.usdc;
        collateralToken = tokens.wbtc;
        indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        const amountIn = amount.add(1);
        const minOut = 0;
        const sizeDelta = utils.parseUnits("2000", 30);

        const tradeData = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path, indexToken, amountIn, minOut, sizeDelta, isLong]
        );
        const operationId = 0; // increasePosition
        traderOperation = { operationId, data: tradeData };
      });

      after(async () => {
        await reverter.revert();
      });

      it("Should revert if Wallet does not have enough Ether for fee", async () => {
        await expect(
          traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate)
        ).to.be.revertedWithCustomError(
          gmxAdapterLibrary.attach(traderWalletContract.address),
          "InsufficientEtherBalance"
        );
      });

      it("Should revert with insufficient balance", async () => {
        await trader.sendTransaction({
          to: traderWalletContract.address,
          value: utils.parseEther("0.2"),
        });
        await expect(
          traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate)
        )
          .to.be.revertedWithCustomError(
            gmxAdapterLibrary.attach(traderWalletContract.address),
            "CreateIncreasePositionFail"
          )
          .withArgs("ERC20: transfer amount exceeds balance");
      });

      it("Should revert if operation is invalid", async () => {
        const operationId = 10;
        traderOperation.operationId = operationId;
        await expect(
          traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate)
        ).to.be.revertedWithCustomError(
          gmxAdapterLibrary.attach(traderWalletContract.address),
          "InvalidOperationId"
        );
      });
    });

    describe("Open and close LONG trader position", function () {
      const amount = utils.parseUnits("1000", 6);
      const replicate = false;
      const isLong = true;

      let indexToken: string;
      let collateralToken: string;
      let requestKey: string;
      let keeper: Signer;
      before(async () => {
        await trader.sendTransaction({
          to: traderWalletContract.address,
          value: utils.parseEther("0.2"),
        });
        await usdcTokenContract
          .connect(trader)
          .approve(traderWalletContract.address, amount);
        await traderWalletContract.connect(trader).traderDeposit(amount);
        const allowedTokens = [
          tokens.usdc,
          tokens.usdt,
          tokens.wbtc,
          tokens.weth,
        ];
        await contractsFactoryContract.setAllowedGlobalToken(
          allowedTokens,
          true
        );
        await traderWalletContract
          .connect(trader)
          .addAllowedTradeTokens(allowedTokens);

        const tokenIn = tokens.usdc;
        collateralToken = tokens.wbtc;
        indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        const amountIn = amount;
        const minOut = 0;
        const sizeDelta = utils.parseUnits("2000", 30);

        const tradeData = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path, indexToken, amountIn, minOut, sizeDelta, isLong]
        );
        const operationId = 0; // increasePosition
        const traderOperation = { operationId, data: tradeData };

        txResult = await traderWalletContract
          .connect(trader)
          .executeOnProtocol(protocolId, traderOperation, replicate);
        const txReceipt = await txResult.wait();

        const events = txReceipt.events?.filter(
          (event: any) => event.topics[0] === createIncreasePositionEvent
        )[0];
        requestKey = requestKeyFromEvent(events);
      });

      after(async () => {
        await reverter.revert();
      });

      it("Should emit event with create increase position requestKey", async () => {
        await expect(txResult)
          .to.emit(
            gmxAdapterLibrary.attach(traderWalletContract.address),
            "CreateIncreasePosition"
          )
          .withArgs(traderWalletContract.address, requestKey);
      });

      it("Should spent all trader's balance", async () => {
        expect(await usdcTokenContract.balanceOf(traderAddress)).to.equal(0);
      });

      it("Should create IncreasePositionRequest in GMX.PositionRouter contract ", async () => {
        const createdRequest = await gmxPositionRouter.increasePositionRequests(
          requestKey
        );
        expect(createdRequest.account).to.equal(traderWalletContract.address);
        expect(createdRequest.amountIn).to.equal(amount);
      });

      describe("Execute increasing position by a keeper", function () {
        before(async () => {
          keeper = await ethers.getImpersonatedSigner(gmx.keeper);
          await setBalance(gmx.keeper, utils.parseEther("10"));
          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(requestKey, gmx.keeper);
        });

        it("Should remove IncreasePositionRequest after executing ", async () => {
          const createdRequest =
            await gmxPositionRouter.increasePositionRequests(requestKey);
          expect(createdRequest.account).to.equal(constants.AddressZero);
          expect(createdRequest.indexToken).to.equal(constants.AddressZero);
          expect(createdRequest.amountIn).to.equal(constants.Zero);
        });

        it("Should return opened position from positions list", async () => {
          const position = await lensContract.getPositions(
            traderWalletContract.address,
            [collateralToken],
            [indexToken],
            [isLong]
          );
          const [size] = position;
          expect(size).to.equal(utils.parseUnits("2000", 30));
        });
      });

      describe("Closing position", function () {
        let sizeDelta: BigNumber;

        before(async () => {
          const tokenOut = tokens.usdc;
          const path = [collateralToken, tokenOut];
          const collateralDelta = 0; // doesn't matter for full closing position
          sizeDelta = utils.parseUnits("2000", 30);
          const minOut = 0;

          const tradeData = abiCoder.encode(
            ["address[]", "address", "uint256", "uint256", "bool", "uint256"],
            [path, indexToken, collateralDelta, sizeDelta, isLong, minOut]
          );
          const operationId = 1; // decrease position
          const traderOperation = { operationId, data: tradeData };

          txResult = await traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate);
          const txReceipt = await txResult.wait();

          const events = txReceipt.events?.filter(
            (event: any) => event.topics[0] === createDecreasePositionEvent
          )[0];
          requestKey = requestKeyFromEvent(events);
        });

        it("Should emit event with create decrease position requestKey", async () => {
          await expect(txResult)
            .to.emit(
              gmxAdapterLibrary.attach(traderWalletContract.address),
              "CreateDecreasePosition"
            )
            .withArgs(traderWalletContract.address, requestKey);
        });

        it("Should create DecreasePositionRequest in GMX.PositionRouter contract ", async () => {
          const createdRequest =
            await gmxPositionRouter.decreasePositionRequests(requestKey);
          expect(createdRequest.account).to.equal(traderWalletContract.address);
          expect(createdRequest.sizeDelta)
            .to.equal(sizeDelta)
            .to.equal(utils.parseUnits("2000", 30));
        });

        describe("Execute decreasing position by a keeper", function () {
          before(async () => {
            await gmxPositionRouter
              .connect(keeper)
              .executeDecreasePosition(requestKey, gmx.keeper);
          });

          it("Should remove DecreasePositionRequest after executing ", async () => {
            const createdRequest =
              await gmxPositionRouter.decreasePositionRequests(requestKey);
            expect(createdRequest.account).to.equal(constants.AddressZero);
            expect(createdRequest.indexToken).to.equal(constants.AddressZero);
            expect(createdRequest.sizeDelta).to.equal(constants.Zero);
          });

          it("Should return zeros for traderWallet position from positions list", async () => {
            const position = await lensContract.getPositions(
              traderWalletContract.address,
              [collateralToken],
              [indexToken],
              [isLong]
            );
            const [size] = position;
            expect(size).to.equal(constants.Zero);
          });
        });
      });
    });

    describe("Open a SHORT trader position", function () {
      const amount = utils.parseUnits("1000", 6);
      const replicate = false;
      const isLong = false;

      let indexToken: string;
      let collateralToken: string;
      let requestKey: string;
      let keeper: Signer;
      before(async () => {
        await trader.sendTransaction({
          to: traderWalletContract.address,
          value: utils.parseEther("0.2"),
        });
        await usdcTokenContract
          .connect(trader)
          .approve(traderWalletContract.address, amount);
        await traderWalletContract.connect(trader).traderDeposit(amount);
        const shortCollaterals = [tokens.usdc];
        const shortIndexTokens = [tokens.wbtc];
        await traderWalletContract
          .connect(owner)
          .addGmxShortPairs(shortCollaterals, shortIndexTokens);

        const tokenIn = tokens.usdc;
        collateralToken = tokenIn;
        indexToken = tokens.wbtc;
        const path = [collateralToken];
        const amountIn = amount;
        const minOut = 0;
        const sizeDelta = utils.parseUnits("2000", 30);

        const tradeData = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path, indexToken, amountIn, minOut, sizeDelta, isLong]
        );
        const operationId = 0; // increasePosition
        const traderOperation = { operationId, data: tradeData };

        txResult = await traderWalletContract
          .connect(trader)
          .executeOnProtocol(protocolId, traderOperation, replicate);
        const txReceipt = await txResult.wait();

        const events = txReceipt.events?.filter(
          (event: any) => event.topics[0] === createIncreasePositionEvent
        )[0];
        requestKey = requestKeyFromEvent(events);
      });

      after(async () => {
        await reverter.revert();
      });

      it("Should emit event with create increase position requestKey", async () => {
        await expect(txResult)
          .to.emit(
            gmxAdapterLibrary.attach(traderWalletContract.address),
            "CreateIncreasePosition"
          )
          .withArgs(traderWalletContract.address, requestKey);
      });

      it("Should spent all trader's balance", async () => {
        expect(await usdcTokenContract.balanceOf(traderAddress)).to.equal(0);
      });

      it("Should create IncreasePositionRequest in GMX.PositionRouter contract ", async () => {
        const createdRequest = await gmxPositionRouter.increasePositionRequests(
          requestKey
        );
        expect(createdRequest.account).to.equal(traderWalletContract.address);
        expect(createdRequest.amountIn).to.equal(amount);
      });

      describe("Execute increasing position by a keeper", function () {
        before(async () => {
          keeper = await ethers.getImpersonatedSigner(gmx.keeper);
          await setBalance(gmx.keeper, utils.parseEther("10"));
          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(requestKey, gmx.keeper);
        });

        it("Should remove IncreasePositionRequest after executing ", async () => {
          const createdRequest =
            await gmxPositionRouter.increasePositionRequests(requestKey);
          expect(createdRequest.account).to.equal(constants.AddressZero);
          expect(createdRequest.indexToken).to.equal(constants.AddressZero);
          expect(createdRequest.amountIn).to.equal(constants.Zero);
        });

        it("Should return opened position from positions list", async () => {
          const position = await lensContract.getPositions(
            traderWalletContract.address,
            [collateralToken],
            [indexToken],
            [isLong]
          );
          const [size] = position;
          expect(size).to.equal(utils.parseUnits("2000", 30));
        });
      });
    });

    describe("Open and few trader positions", function () {
      const amount = utils.parseUnits("1000", 6);
      const replicate = false;
      const isLong = true;

      let indexToken: string;
      let collateralToken: string;
      let requestKey1: string;
      let requestKey2: string;
      let amountIn: BigNumber;
      let sizeDelta: BigNumber;

      let keeper: Signer;
      before(async () => {
        await trader.sendTransaction({
          to: traderWalletContract.address,
          value: utils.parseEther("0.2"),
        });
        await usdcTokenContract
          .connect(trader)
          .approve(traderWalletContract.address, amount);
        await traderWalletContract.connect(trader).traderDeposit(amount);
        const allowedTokens = [
          tokens.usdc,
          tokens.usdt,
          tokens.wbtc,
          tokens.weth,
        ];
        await contractsFactoryContract.setAllowedGlobalToken(
          allowedTokens,
          true
        );
        await traderWalletContract
          .connect(trader)
          .addAllowedTradeTokens(allowedTokens);

        // first position
        const tokenIn = tokens.usdc;
        collateralToken = tokens.wbtc;
        indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        amountIn = amount.div(2);
        const minOut = 0;
        sizeDelta = utils.parseUnits("2000", 30);

        const tradeData = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path, indexToken, amountIn, minOut, sizeDelta, isLong]
        );
        const operationId = 0; // increasePosition
        const traderOperation = { operationId, data: tradeData };

        txResult = await traderWalletContract
          .connect(trader)
          .executeOnProtocol(protocolId, traderOperation, replicate);
        const txReceipt = await txResult.wait();

        const events = txReceipt.events?.filter(
          (event: any) => event.topics[0] === createIncreasePositionEvent
        )[0];
        requestKey1 = requestKeyFromEvent(events);

        // second position
        // support short tokens
        await traderWalletContract
          .connect(owner)
          .addGmxShortPairs([tokens.usdc], [tokens.weth]);
        const path2 = [tokenIn];
        const indexToken2 = tokens.weth;
        const isLong2 = false;
        const tradeData2 = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path2, indexToken2, amountIn, minOut, sizeDelta, isLong2]
        );
        const traderOperation2 = { operationId, data: tradeData2 };
        txResult = await traderWalletContract
          .connect(trader)
          .executeOnProtocol(protocolId, traderOperation2, replicate);
        const txReceipt2 = await txResult.wait();
        const events2 = txReceipt2.events?.filter(
          (event: any) => event.topics[0] === createIncreasePositionEvent
        )[0];
        requestKey2 = requestKeyFromEvent(events2);
      });

      after(async () => {
        await reverter.revert();
      });

      it("Should spent all trader's balance", async () => {
        expect(await usdcTokenContract.balanceOf(traderAddress)).to.equal(0);
      });

      it("Should create IncreasePositionRequest in GMX.PositionRouter contract ", async () => {
        const createdRequest = await gmxPositionRouter.increasePositionRequests(
          requestKey1
        );
        expect(createdRequest.account).to.equal(traderWalletContract.address);
        expect(createdRequest.amountIn).to.equal(amountIn);
      });

      describe("Execute increasing position by a keeper", function () {
        before(async () => {
          keeper = await ethers.getImpersonatedSigner(gmx.keeper);
          await setBalance(gmx.keeper, utils.parseEther("10"));
          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(requestKey1, gmx.keeper);
          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(requestKey2, gmx.keeper);
        });

        it("Should remove IncreasePositionRequest after executing ", async () => {
          const createdRequest =
            await gmxPositionRouter.increasePositionRequests(requestKey1);
          expect(createdRequest.account).to.equal(constants.AddressZero);
          expect(createdRequest.indexToken).to.equal(constants.AddressZero);
          expect(createdRequest.amountIn).to.equal(constants.Zero);
        });

        it("Should return 2 opened positions for trader wallet", async () => {
          const positions = await lensContract.getAllPositionsProcessed(
            traderWalletContract.address
          );
          expect(positions.length).to.equal(2);
        });

        it("Should return correct values for the first position", async () => {
          const positions = await lensContract.getAllPositionsProcessed(
            traderWalletContract.address
          );
          // first are 'short' positions
          const position = positions[0];
          expect(position.size).to.equal(sizeDelta);
          expect(position.collateralToken).to.equal(tokens.usdc); // stable for 'short'
          expect(position.indexToken).to.equal(tokens.weth);
          expect(position.isLong).to.equal(false);
        });

        it("Should return correct values for the second position", async () => {
          const positions = await lensContract.getAllPositionsProcessed(
            traderWalletContract.address
          );

          const position = positions[1];
          expect(position.size).to.equal(sizeDelta);
          expect(position.collateralToken).to.equal(tokens.wbtc);
          expect(position.indexToken).to.equal(tokens.wbtc); // same for Long
          expect(position.isLong).to.equal(true);
        });
      });
    });

    describe("Limit orders", function () {
      const amount = utils.parseUnits("1000", 6);
      const replicate = false;

      let indexToken: string;
      let collateralToken: string;
      let limitOrderKeeper: Signer;

      describe("Creating Long Increase Limit order", function () {
        const tokenIn = tokens.usdc;
        collateralToken = tokens.wbtc;
        indexToken = collateralToken; // wbtc
        const path = [tokenIn, collateralToken];
        const amountIn = amount;

        const minOut = 0;
        const sizeDelta = utils.parseUnits("2000", 30);
        const isLong = true;
        const triggerAboveThreshold = true;

        let currentPrice: BigNumber;
        let triggerPrice: BigNumber;

        before(async () => {
          await trader.sendTransaction({
            to: traderWalletContract.address,
            value: utils.parseEther("0.2"),
          });
          await usdcTokenContract
            .connect(trader)
            .approve(traderWalletContract.address, amount);
          await traderWalletContract.connect(trader).traderDeposit(amount);

          const allowedTokens = [
            tokens.usdc,
            tokens.usdt,
            tokens.wbtc,
            tokens.weth,
          ];
          await contractsFactoryContract.setAllowedGlobalToken(
            allowedTokens,
            true
          );
          await traderWalletContract
            .connect(trader)
            .addAllowedTradeTokens(allowedTokens);

          limitOrderKeeper = await ethers.getImpersonatedSigner(
            gmx.limitOrderKeeper
          );
          await setBalance(gmx.limitOrderKeeper, utils.parseEther("10"));

          currentPrice = await gmxVault.getMaxPrice(indexToken);
          triggerPrice = currentPrice.add(utils.parseUnits("100", 30));
          const tradeData = abiCoder.encode(
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
          const operationId = 2; // createIncreaseOrder
          const traderOperation = { operationId, data: tradeData };
          txResult = await traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate);
          await txResult.wait();
        });

        after(async () => {
          reverter.revert();
        });

        it("Should create increase order index for trader wallet account", async () => {
          expect(
            await lensContract.increaseOrdersIndex(traderWalletContract.address)
          ).to.equal(1); // first increase order
        });

        it("Should return correct data of created limit order", async () => {
          const index = 0;

          const order = await lensContract.increaseOrder(
            traderWalletContract.address,
            index
          );
          expect(order.account).to.equal(traderWalletContract.address);
          expect(order.purchaseToken).to.equal(collateralToken);
          expect(order.collateralToken).to.equal(collateralToken);
          expect(order.indexToken).to.equal(indexToken);
          expect(order.sizeDelta).to.equal(sizeDelta);
          expect(order.triggerPrice).to.equal(triggerPrice);
        });

        describe("CANCEL the existing increase limit order", function () {
          const orderIndex = 0;
          before(async () => {
            reverterLocal.snapshot();

            const operationId = 4; // cancelIncreaseOrder
            const walletIndex = orderIndex;
            const vaultIndex = orderIndex; // mocked value
            const tradeData = abiCoder.encode(
              ["uint256[]"],
              [[walletIndex, vaultIndex]]
            );
            const traderOperation = { operationId, data: tradeData };
            txResult = await traderWalletContract
              .connect(trader)
              .executeOnProtocol(protocolId, traderOperation, replicate);
          });
          after(async () => {
            reverterLocal.revert();
          });

          it("Should return empty data at zero limit order index", async () => {
            const index = 0;

            const order = await lensContract.increaseOrder(
              traderWalletContract.address,
              index
            );
            expect(order.account).to.equal(constants.AddressZero);
            expect(order.purchaseToken).to.equal(constants.AddressZero);
            expect(order.collateralToken).to.equal(constants.AddressZero);
            expect(order.indexToken).to.equal(constants.AddressZero);
            expect(order.sizeDelta).to.equal(0);
            expect(order.triggerPrice).to.equal(0);
          });
        });

        describe("UPDATE the existing limit order", function () {
          const orderIndex = 0;
          let newSizeDelta: BigNumber;
          let newTriggerAboveThreshold: boolean;
          before(async () => {
            reverterLocal.snapshot();

            const operationId = 3; // updateIncreaseOrder
            const walletIndex = orderIndex;
            const vaultIndex = orderIndex; // mocked value

            newSizeDelta = sizeDelta.add(utils.parseUnits("100", 30));
            newTriggerAboveThreshold = false;
            const tradeData = abiCoder.encode(
              ["uint256[]", "uint256", "uint256", "bool"],
              [
                [walletIndex, vaultIndex],
                newSizeDelta,
                triggerPrice,
                newTriggerAboveThreshold,
              ]
            );
            const traderOperation = { operationId, data: tradeData };
            txResult = await traderWalletContract
              .connect(trader)
              .executeOnProtocol(protocolId, traderOperation, replicate);
          });
          after(async () => {
            reverterLocal.revert();
          });

          it("Should return updated data at zero increase limit order index", async () => {
            const index = 0;

            const order = await lensContract.increaseOrder(
              traderWalletContract.address,
              index
            );
            expect(order.account).to.equal(traderWalletContract.address);
            expect(order.purchaseToken).to.equal(collateralToken);
            expect(order.collateralToken).to.equal(collateralToken);
            expect(order.indexToken).to.equal(indexToken);
            expect(order.sizeDelta).to.equal(newSizeDelta);
            expect(order.triggerAboveThreshold).to.equal(
              newTriggerAboveThreshold
            );
          });
        });

        describe("Fail execution increase limit order because price didn't reach trigger", function () {
          it("Should revert order execution because price didn't reach trigger", async () => {
            await expect(
              gmxPositionManager
                .connect(limitOrderKeeper)
                .executeIncreaseOrder(
                  traderWalletContract.address,
                  0,
                  gmx.limitOrderKeeper
                )
            ).to.be.revertedWith("OrderBook: invalid price for execution");
          });
        });

        describe("Executing Long Increase Limit order by limitOrderKeeper", function () {
          before(async () => {
            // mock Gmx PriceFeed
            const gmxPriceFeedMockCode = await ethers.provider.getCode(
              gmxVaultPriceFeedMockContract.address
            );
            await setCode(gmx.vaultPriceFeedAddress, gmxPriceFeedMockCode);
            gmxVaultPriceFeedMock = await ethers.getContractAt(
              "GmxVaultPriceFeedMock",
              gmx.vaultPriceFeedAddress
            );

            // increase price
            await gmxVaultPriceFeedMock.setPrice(
              indexToken,
              triggerPrice.add(1)
            );
            // execute order
            await gmxPositionManager
              .connect(limitOrderKeeper)
              .executeIncreaseOrder(
                traderWalletContract.address,
                0,
                gmx.limitOrderKeeper
              );
          });

          after(async () => {
            reverter.revert();
          });

          it("Should execute created increase order", async () => {
            // check opened position
            expect(
              await lensContract.increaseOrdersIndex(
                traderWalletContract.address
              )
            ).to.equal(1); // first increase order

            const position = await lensContract.getPositions(
              traderWalletContract.address,
              [collateralToken],
              [indexToken],
              [isLong]
            );

            const [size, collateralUsdValue] = position;
            expect(size).to.equal(sizeDelta);
            expect(collateralUsdValue).to.be.gt(utils.parseUnits("900", 30));
            expect(collateralUsdValue).to.be.lt(utils.parseUnits("1000", 30));
          });
        });
      });

      describe("Partial Decrease limit order flow", function () {
        const isLong = true;
        const replicate = false;

        let indexToken: string;
        let collateralToken: string;
        let requestKey: string;
        let sizeDelta: BigNumber;
        let openPrice: BigNumber;
        let triggerPrice: BigNumber;
        let keeper: Signer;
        let limitOrderKeeper: Signer;

        before(async () => {
          // prepare - open new long position
          await trader.sendTransaction({
            to: traderWalletContract.address,
            value: utils.parseEther("0.5"),
          });
          await usdcTokenContract
            .connect(trader)
            .approve(traderWalletContract.address, amount);
          await traderWalletContract.connect(trader).traderDeposit(amount);

          const allowedTokens = [
            tokens.usdc,
            tokens.usdt,
            tokens.wbtc,
            tokens.weth,
          ];
          await contractsFactoryContract.setAllowedGlobalToken(
            allowedTokens,
            true
          );
          await traderWalletContract
            .connect(trader)
            .addAllowedTradeTokens(allowedTokens);

          const tokenIn = tokens.usdc;
          collateralToken = tokens.wbtc;
          indexToken = collateralToken;
          const path = [tokenIn, collateralToken];
          const amountIn = amount;
          const minOut = 0;
          sizeDelta = utils.parseUnits("2000", 30);
          openPrice = await gmxVault.getMaxPrice(indexToken);

          const tradeData = abiCoder.encode(
            ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
            [path, indexToken, amountIn, minOut, sizeDelta, isLong]
          );
          const operationId = 0; // increasePosition
          const traderOperation = { operationId, data: tradeData };

          txResult = await traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate);
          const txReceipt = await txResult.wait();
          const events = txReceipt.events?.filter(
            (event: any) => event.topics[0] === createIncreasePositionEvent
          )[0];
          requestKey = requestKeyFromEvent(events);

          // load keepers
          keeper = await ethers.getImpersonatedSigner(gmx.keeper);
          await setBalance(gmx.keeper, utils.parseEther("10"));
          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(requestKey, gmx.keeper);
          limitOrderKeeper = await ethers.getImpersonatedSigner(
            gmx.limitOrderKeeper
          );
          await setBalance(gmx.limitOrderKeeper, utils.parseEther("10"));
        });

        after(async () => {
          await reverter.revert();
        });

        it("Should return opened position from positions list", async () => {
          const position = await lensContract.getPositions(
            traderWalletContract.address,
            [collateralToken],
            [indexToken],
            [isLong]
          );
          const [size] = position;
          expect(size).to.equal(utils.parseUnits("2000", 30));
        });

        describe("Creating Partial decrease limit order", function () {
          const triggerAboveThreshold = true; // take part-profit
          const sizeDelta = utils.parseUnits("1000", 30); // decrease 50%
          const collateralDelta = utils.parseUnits("600", 30); // decrease collateral ~60%

          before(async () => {
            triggerPrice = openPrice.add(utils.parseUnits("100", 30));
            const tradeData = abiCoder.encode(
              [
                "address",
                "uint256",
                "address",
                "uint256",
                "bool",
                "uint256",
                "bool",
              ],
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
            const operationId = 5; // createDecreaseOrder
            const traderOperation = { operationId, data: tradeData };
            txResult = await traderWalletContract
              .connect(trader)
              .executeOnProtocol(protocolId, traderOperation, replicate);
            await txResult.wait();
          });

          it("Should create decrease order index for trader wallet account", async () => {
            expect(
              await lensContract.decreaseOrdersIndex(
                traderWalletContract.address
              )
            ).to.equal(1); // first decrease order
          });

          it("Should return correct data of created decrease limit order", async () => {
            const index = 0;

            const order = await lensContract.decreaseOrder(
              traderWalletContract.address,
              index
            );
            expect(order.account).to.equal(traderWalletContract.address);
            expect(order.collateralToken).to.equal(collateralToken);
            expect(order.collateralDelta).to.equal(collateralDelta);
            expect(order.indexToken).to.equal(indexToken);
            expect(order.sizeDelta).to.equal(sizeDelta);
            expect(order.triggerPrice).to.equal(triggerPrice);
          });

          describe("CANCEL the existing decrease limit order", function () {
            const orderIndex = 0;
            before(async () => {
              reverterLocal.snapshot();

              const operationId = 7; // cancelDecreaseOrder
              const walletIndex = orderIndex;
              const vaultIndex = orderIndex; // mocked value
              const tradeData = abiCoder.encode(
                ["uint256[]"],
                [[walletIndex, vaultIndex]]
              );
              const traderOperation = { operationId, data: tradeData };
              txResult = await traderWalletContract
                .connect(trader)
                .executeOnProtocol(protocolId, traderOperation, replicate);
            });

            after(async () => {
              reverterLocal.revert();
            });

            it("Should return empty data at zero limit order index", async () => {
              const index = 0;

              const order = await lensContract.decreaseOrder(
                traderWalletContract.address,
                index
              );
              expect(order.account).to.equal(constants.AddressZero);
              expect(order.collateralToken).to.equal(constants.AddressZero);
              expect(order.collateralDelta).to.equal(0);
              expect(order.indexToken).to.equal(constants.AddressZero);
              expect(order.sizeDelta).to.equal(0);
              expect(order.triggerPrice).to.equal(0);
            });
          });

          describe("Update existing decrease limit order", function () {
            const orderIndex = 0;
            let newSizeDelta: BigNumber;
            let newTriggerAboveThreshold: boolean;
            before(async () => {
              reverterLocal.snapshot();

              const operationId = 6; // updateDecreaseOrder
              const walletIndex = orderIndex;
              const vaultIndex = orderIndex; // mocked value

              newSizeDelta = sizeDelta.add(utils.parseUnits("53.21", 30));
              newTriggerAboveThreshold = false;
              const tradeData = abiCoder.encode(
                ["uint256[]", "uint256", "uint256", "uint256", "bool"],
                [
                  [walletIndex, vaultIndex],
                  collateralDelta,
                  newSizeDelta,
                  triggerPrice,
                  newTriggerAboveThreshold,
                ]
              );
              const traderOperation = { operationId, data: tradeData };
              txResult = await traderWalletContract
                .connect(trader)
                .executeOnProtocol(protocolId, traderOperation, replicate);
            });
            after(async () => {
              reverterLocal.revert();
            });

            it("Should return updated data at zero decrease limit order index", async () => {
              const index = 0;

              const order = await lensContract.decreaseOrder(
                traderWalletContract.address,
                index
              );
              expect(order.account).to.equal(traderWalletContract.address);
              expect(order.collateralToken).to.equal(collateralToken);
              expect(order.indexToken).to.equal(indexToken);
              expect(order.sizeDelta).to.equal(newSizeDelta);
              expect(order.triggerAboveThreshold).to.equal(
                newTriggerAboveThreshold
              );
            });
          });

          describe("Fail execution decrease limit order because price didn't reach trigger", function () {
            it("Should revert order execution because price didn't reach trigger", async () => {
              await expect(
                gmxPositionManager
                  .connect(limitOrderKeeper)
                  .executeDecreaseOrder(
                    traderWalletContract.address,
                    0,
                    gmx.limitOrderKeeper
                  )
              ).to.be.revertedWith("OrderBook: invalid price for execution");
            });
          });

          describe("Executing Long Decrease order by limitOrderKeeper", function () {
            before(async () => {
              // mock Gmx PriceFeed
              const gmxPriceFeedMockCode = await ethers.provider.getCode(
                gmxVaultPriceFeedMockContract.address
              );
              await setCode(gmx.vaultPriceFeedAddress, gmxPriceFeedMockCode);
              gmxVaultPriceFeedMock = await ethers.getContractAt(
                "GmxVaultPriceFeedMock",
                gmx.vaultPriceFeedAddress
              );

              // increase price
              await gmxVaultPriceFeedMock.setPrice(
                indexToken,
                triggerPrice.add(1)
              );
              // execute order
              txResult = await gmxPositionManager
                .connect(limitOrderKeeper)
                .executeDecreaseOrder(
                  traderWalletContract.address,
                  0,
                  gmx.limitOrderKeeper
                );
            });

            it("Should execute created decrease order", async () => {
              // check opened position
              const amountIn = utils.parseUnits("1000", 30);
              const position = await lensContract.getPositions(
                traderWalletContract.address,
                [collateralToken],
                [indexToken],
                [isLong]
              );

              const [size, collateralUsdValue] = position;
              expect(size).to.equal(sizeDelta); // position size in USD
              expect(collateralUsdValue).to.be.gt(
                amountIn.sub(collateralDelta).sub(utils.parseUnits("100", 30))
              ); // position collateral in USD
              expect(collateralUsdValue).to.be.lt(
                amountIn.sub(collateralDelta)
              );
            });

            it("Should update decrease order", async () => {
              expect(
                await lensContract.decreaseOrdersIndex(
                  traderWalletContract.address
                )
              ).to.equal(1); // first decrease order

              const order = await lensContract.decreaseOrder(
                traderWalletContract.address,
                0
              );
              expect(order.account).to.equal(constants.AddressZero);
              expect(order.collateralToken).to.equal(constants.AddressZero);
              expect(order.sizeDelta).to.equal(constants.Zero);
            });
          });
        });
      });

      describe("Full Decrease limit order flow", function () {
        const isLong = true;
        const replicate = false;

        let indexToken: string;
        let collateralToken: string;
        let requestKey: string;
        let sizeDelta: BigNumber;
        let openPrice: BigNumber;
        let triggerPrice: BigNumber;
        let keeper: Signer;
        let limitOrderKeeper: Signer;

        before(async () => {
          // prepare - open new long position
          await trader.sendTransaction({
            to: traderWalletContract.address,
            value: utils.parseEther("0.5"),
          });
          await usdcTokenContract
            .connect(trader)
            .approve(traderWalletContract.address, amount);
          await traderWalletContract.connect(trader).traderDeposit(amount);

          const allowedTokens = [
            tokens.usdc,
            tokens.usdt,
            tokens.wbtc,
            tokens.weth,
          ];
          await contractsFactoryContract.setAllowedGlobalToken(
            allowedTokens,
            true
          );
          await traderWalletContract
            .connect(trader)
            .addAllowedTradeTokens(allowedTokens);

          const tokenIn = tokens.usdc;
          collateralToken = tokens.wbtc;
          indexToken = collateralToken;
          const path = [tokenIn, collateralToken];
          const amountIn = amount;
          const minOut = 0;
          sizeDelta = utils.parseUnits("2000", 30);
          openPrice = await gmxVault.getMaxPrice(indexToken);

          const tradeData = abiCoder.encode(
            ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
            [path, indexToken, amountIn, minOut, sizeDelta, isLong]
          );
          const operationId = 0; // increasePosition
          const traderOperation = { operationId, data: tradeData };

          txResult = await traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate);
          const txReceipt = await txResult.wait();
          const events = txReceipt.events?.filter(
            (event: any) => event.topics[0] === createIncreasePositionEvent
          )[0];
          requestKey = requestKeyFromEvent(events);

          // load keepers
          keeper = await ethers.getImpersonatedSigner(gmx.keeper);
          await setBalance(gmx.keeper, utils.parseEther("10"));
          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(requestKey, gmx.keeper);
          limitOrderKeeper = await ethers.getImpersonatedSigner(
            gmx.limitOrderKeeper
          );
          await setBalance(gmx.limitOrderKeeper, utils.parseEther("10"));
        });

        after(async () => {
          await reverter.revert();
        });

        it("Should return opened position from positions list", async () => {
          const position = await lensContract.getPositions(
            traderWalletContract.address,
            [collateralToken],
            [indexToken],
            [isLong]
          );
          const [size] = position;
          expect(size).to.equal(utils.parseUnits("2000", 30));
        });

        describe("Creating Full decrease (close) limit order", function () {
          const triggerAboveThreshold = true; // take part-profit
          const sizeDelta = utils.parseUnits("2000", 30); // decrease 100%
          const collateralDelta = utils.parseUnits("0", 30); // doesn't matter when close position

          before(async () => {
            triggerPrice = openPrice.add(utils.parseUnits("100", 30));
            const tradeData = abiCoder.encode(
              [
                "address",
                "uint256",
                "address",
                "uint256",
                "bool",
                "uint256",
                "bool",
              ],
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
            const operationId = 5; // createDecreaseOrder
            const traderOperation = { operationId, data: tradeData };
            txResult = await traderWalletContract
              .connect(trader)
              .executeOnProtocol(protocolId, traderOperation, replicate);
            await txResult.wait();
          });

          it("Should create decrease order index for trader wallet account", async () => {
            expect(
              await lensContract.decreaseOrdersIndex(
                traderWalletContract.address
              )
            ).to.equal(1); // first decrease order
          });

          it("Should return correct data of created decrease limit order", async () => {
            const index = 0;

            const order = await lensContract.decreaseOrder(
              traderWalletContract.address,
              index
            );
            expect(order.account).to.equal(traderWalletContract.address);
            expect(order.collateralToken).to.equal(collateralToken);
            expect(order.collateralDelta).to.equal(collateralDelta);
            expect(order.indexToken).to.equal(indexToken);
            expect(order.sizeDelta).to.equal(sizeDelta);
            expect(order.triggerPrice).to.equal(triggerPrice);
          });

          describe("CANCEL the existing decrease limit order", function () {
            const orderIndex = 0;
            before(async () => {
              reverterLocal.snapshot();

              const operationId = 7; // cancelDecreaseOrder
              const walletIndex = orderIndex;
              const vaultIndex = orderIndex; // mocked value
              const tradeData = abiCoder.encode(
                ["uint256[]"],
                [[walletIndex, vaultIndex]]
              );
              const traderOperation = { operationId, data: tradeData };
              txResult = await traderWalletContract
                .connect(trader)
                .executeOnProtocol(protocolId, traderOperation, replicate);
            });

            after(async () => {
              reverterLocal.revert();
            });

            it("Should return empty data at zero limit order index", async () => {
              const index = 0;

              const order = await lensContract.decreaseOrder(
                traderWalletContract.address,
                index
              );
              expect(order.account).to.equal(constants.AddressZero);
              expect(order.collateralToken).to.equal(constants.AddressZero);
              expect(order.collateralDelta).to.equal(0);
              expect(order.indexToken).to.equal(constants.AddressZero);
              expect(order.sizeDelta).to.equal(0);
              expect(order.triggerPrice).to.equal(0);
            });
          });

          describe("Update existing decrease limit order", function () {
            const orderIndex = 0;
            let newSizeDelta: BigNumber;
            let newTriggerAboveThreshold: boolean;
            before(async () => {
              reverterLocal.snapshot();

              const operationId = 6; // updateDecreaseOrder
              const walletIndex = orderIndex;
              const vaultIndex = orderIndex; // mocked value

              newSizeDelta = sizeDelta.add(utils.parseUnits("53.21", 30));
              newTriggerAboveThreshold = false;
              const tradeData = abiCoder.encode(
                ["uint256[]", "uint256", "uint256", "uint256", "bool"],
                [
                  [walletIndex, vaultIndex],
                  collateralDelta,
                  newSizeDelta,
                  triggerPrice,
                  newTriggerAboveThreshold,
                ]
              );
              const traderOperation = { operationId, data: tradeData };
              txResult = await traderWalletContract
                .connect(trader)
                .executeOnProtocol(protocolId, traderOperation, replicate);
            });
            after(async () => {
              reverterLocal.revert();
            });

            it("Should return updated data at zero decrease limit order index", async () => {
              const index = 0;

              const order = await lensContract.decreaseOrder(
                traderWalletContract.address,
                index
              );
              expect(order.account).to.equal(traderWalletContract.address);
              expect(order.collateralToken).to.equal(collateralToken);
              expect(order.indexToken).to.equal(indexToken);
              expect(order.sizeDelta).to.equal(newSizeDelta);
              expect(order.triggerAboveThreshold).to.equal(
                newTriggerAboveThreshold
              );
            });
          });

          describe("Fail execution decrease limit order because price didn't reach trigger", function () {
            it("Should revert order execution because price didn't reach trigger", async () => {
              await expect(
                gmxPositionManager
                  .connect(limitOrderKeeper)
                  .executeDecreaseOrder(
                    traderWalletContract.address,
                    0,
                    gmx.limitOrderKeeper
                  )
              ).to.be.revertedWith("OrderBook: invalid price for execution");
            });
          });

          describe("Executing Long Decrease order by limitOrderKeeper", function () {
            before(async () => {
              // mock Gmx PriceFeed
              const gmxPriceFeedMockCode = await ethers.provider.getCode(
                gmxVaultPriceFeedMockContract.address
              );
              await setCode(gmx.vaultPriceFeedAddress, gmxPriceFeedMockCode);
              gmxVaultPriceFeedMock = await ethers.getContractAt(
                "GmxVaultPriceFeedMock",
                gmx.vaultPriceFeedAddress
              );

              // increase price
              await gmxVaultPriceFeedMock.setPrice(
                indexToken,
                triggerPrice.add(1)
              );
              // execute order
              await gmxPositionManager
                .connect(limitOrderKeeper)
                .executeDecreaseOrder(
                  traderWalletContract.address,
                  0,
                  gmx.limitOrderKeeper
                );
            });

            it("Should execute created decrease order", async () => {
              // check opened position
              expect(
                await lensContract.decreaseOrdersIndex(
                  traderWalletContract.address
                )
              ).to.equal(1); // first decrease order

              const position = await lensContract.getPositions(
                traderWalletContract.address,
                [collateralToken],
                [indexToken],
                [isLong]
              );

              const [size, collateralUsdValue] = position;
              expect(size).to.equal(0); // position size in USD
              expect(collateralUsdValue).to.equal(0);
            });

            it("Should return collateral tokens balance to contract", async () => {
              const initialAmountUsd = utils.parseUnits("1000", 6);

              const collateralPrice = await gmxVault.getMaxPrice(indexToken);
              const collateralReturn = await wbtcTokenContract.balanceOf(
                traderWalletContract.address
              );
              const returnedBalanceUsd = collateralReturn
                .mul(collateralPrice)
                .div(utils.parseUnits("1", 30));

              expect(returnedBalanceUsd).to.be.gt(initialAmountUsd);
            });
          });
        });
      });
    });

    describe("Unable to create more than 10 increase limit orders", function () {
      const amount = utils.parseUnits("100", 6);
      let currentPrice: BigNumber;
      before(async () => {
        reverterLocal.snapshot();
        // creating 9 more orders
        await usdcTokenContract
          .connect(usdcHolder0)
          .transfer(traderAddress, utils.parseUnits("1100", 6));
        await usdcTokenContract
          .connect(trader)
          .approve(traderWalletContract.address, amount.mul(11));
        await traderWalletContract
          .connect(trader)
          .traderDeposit(amount.mul(11));
        await setBalance(traderWalletContract.address, utils.parseEther("10"));

        const allowedTokens = [
          tokens.usdc,
          tokens.usdt,
          tokens.wbtc,
          tokens.weth,
        ];
        await contractsFactoryContract.setAllowedGlobalToken(
          allowedTokens,
          true
        );
        await traderWalletContract
          .connect(trader)
          .addAllowedTradeTokens(allowedTokens);

        const tokenIn = tokens.usdc;
        const collateralToken = tokens.weth;
        const indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        const amountIn = amount;

        const minOut = 0;
        const sizeDelta = utils.parseUnits("150", 30); // leverage x1.5
        const isLong = true;
        const triggerAboveThreshold = true;
        const operationId = 2; // createIncreaseOrder
        const replicate = false;

        currentPrice = await gmxVault.getMaxPrice(indexToken);
        const triggerPrices: BigNumber[] = [];
        for (let i = 1; i < 11; i++) {
          triggerPrices.push(currentPrice.add(i));
        }

        for (const triggerPrice of triggerPrices) {
          const tradeData = abiCoder.encode(
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
          const traderOperation = { operationId, data: tradeData };
          txResult = await traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate);
          await txResult.wait();
        }
      });

      after(async () => {
        reverterLocal.revert();
      });

      it("Should return incremented orderIndex", async () => {
        const latestOrder = await lensContract.increaseOrdersIndex(
          traderWalletContract.address
        );
        expect(
          await lensContract.increaseOrdersIndex(traderWalletContract.address)
        ).to.equal(10);
      });

      it("Should revert when trying to add 11th order ", async () => {
        const tokenIn = tokens.usdc;
        const collateralToken = tokens.weth;
        const indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        const amountIn = amount;
        const minOut = 0;
        const sizeDelta = utils.parseUnits("150", 30); // leverage x1.5
        const isLong = true;
        const triggerAboveThreshold = true;
        const triggerPrice = currentPrice.add(100);
        const operationId = 2; // createIncreaseOrder
        const replicate = false;

        const tradeData = abiCoder.encode(
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
        const traderOperation = { operationId, data: tradeData };

        await expect(
          traderWalletContract
            .connect(trader)
            .executeOnProtocol(protocolId, traderOperation, replicate)
        ).to.be.revertedWithCustomError(gmxAdapterLibrary, "TooManyOrders");
      });
    });
  });
});
