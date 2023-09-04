/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import {
  Signer,
  ContractFactory,
  ContractTransaction,
  BigNumber,
  utils,
} from "ethers";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  TraderWallet,
  UsersVault,
  ERC20Mock,
  IGmxPositionRouter,
  GmxVaultPriceFeedMock,
  GMXObserver,
  ContractsFactory,
  Lens,
} from "../../typechain-types";
import { setupContracts } from "../_helpers/setupFork";
import { tokens, gmx, tokenHolders } from "../_helpers/arbitrumAddresses";

const createIncreasePositionEvent = utils.keccak256(
  utils.toUtf8Bytes("CreateIncreasePosition(address,bytes32)")
);
const createDecreasePositionEvent = utils.keccak256(
  utils.toUtf8Bytes("CreateDecreasePosition(address,bytes32)")
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
let user1Address: string;
let usdcHolder0: Signer;

let txResult: ContractTransaction;
let traderWalletContract: TraderWallet;
let usersVaultContract: UsersVault;
let gmxPositionRouter: IGmxPositionRouter;
let gmxVaultPriceFeedMockContract: GmxVaultPriceFeedMock;
let gmxObserverFactory: ContractFactory;
let gmxObserver: GMXObserver;
let contractsFactoryContract: ContractsFactory;
let usdcTokenContract: ERC20Mock;
let wbtcTokenContract: ERC20Mock;
let lensContract: Lens;

let keeper: Signer;

describe("GMX Observer unit tests", function () {
  let traderInputAmount: BigNumber;
  let user1InputAmount: BigNumber;

  before(async () => {
    // get signers
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
    traderWalletContract = contract.traderWalletContract;
    usersVaultContract = contract.usersVaultContract;
    contractsFactoryContract = contract.contractsFactoryContract;
    lensContract = contract.lensContract;

    gmxPositionRouter = await ethers.getContractAt(
      "IGmxPositionRouter",
      gmx.positionRouterAddress
    );
    await ethers.getContractAt("IGmxVault", gmx.vaultAddress);

    gmxObserverFactory = await ethers.getContractFactory("GMXObserver");
    gmxObserver = (await gmxObserverFactory.deploy()) as GMXObserver;
    await gmxObserver.deployed();

    trader = deployer;
    traderAddress = deployerAddress;

    const GmxPriceFeedFactory = await ethers.getContractFactory(
      "GmxVaultPriceFeedMock"
    );
    gmxVaultPriceFeedMockContract = await GmxPriceFeedFactory.deploy();
    await gmxVaultPriceFeedMockContract.deployed();

    // adding more trade tokens
    // usdc, usdt, wbtc, weth already in the setup()
    // const allowedTokens = [tokens.dai, tokens.frax, tokens.uni, tokens.link];
    const shortCollaterals = [tokens.usdc, tokens.usdc];
    const shortIndexTokens = [tokens.uni, tokens.link];
    // await traderWalletContract.addAllowedTradeTokens(allowedTokens);
    await traderWalletContract.addGmxShortPairs(
      shortCollaterals,
      shortIndexTokens
    );

    // initial deposits
    traderInputAmount = utils.parseUnits("5000", 6);
    user1InputAmount = utils.parseUnits("25000", 6);

    // initial funds
    usdcHolder0 = await ethers.getImpersonatedSigner(tokenHolders.usdc[0]);
    await usdcTokenContract
      .connect(usdcHolder0)
      .transfer(traderAddress, traderInputAmount);
    await usdcTokenContract
      .connect(usdcHolder0)
      .transfer(user1Address, user1InputAmount);

    await usdcTokenContract
      .connect(trader)
      .approve(traderWalletContract.address, traderInputAmount);
    await usdcTokenContract
      .connect(user1)
      .approve(usersVaultContract.address, user1InputAmount);

    await contractsFactoryContract.addInvestor(user1Address);

    await traderWalletContract.connect(trader).traderDeposit(traderInputAmount);
    await usersVaultContract.connect(user1).userDeposit(user1InputAmount);
    await traderWalletContract.connect(trader).rollover();

    // top-up ether balances to pay execution fee
    await trader.sendTransaction({
      to: traderWalletContract.address,
      value: utils.parseEther("0.2"),
    });
    await trader.sendTransaction({
      to: usersVaultContract.address,
      value: utils.parseEther("0.2"),
    });

    // keeper
    keeper = await ethers.getImpersonatedSigner(gmx.keeper);
    await setBalance(gmx.keeper, utils.parseEther("10"));
  });

  describe("Checking deployed initial parameters", function () {
    it("Should has all trade tokens", async () => {
      const allowedTradeTokens = [
        tokens.usdc,
        tokens.usdt,
        tokens.dai,
        tokens.frax,
        tokens.wbtc,
        tokens.weth,
        tokens.uni,
        tokens.link,
      ];
      expect(
        await traderWalletContract.getAllowedTradeTokens()
      ).to.have.ordered.members(allowedTradeTokens);
    });

    it("Should has all collateral tokens for gmx short positions", async () => {
      const shortCollaterals = [
        tokens.usdc,
        tokens.usdt,
        tokens.dai,
        tokens.frax,
        tokens.usdc,
        tokens.usdc,
      ];
      expect(
        await traderWalletContract.getGmxShortCollaterals()
      ).to.have.ordered.members(shortCollaterals);
    });

    it("Should has all index tokens for gmx short positions", async () => {
      const shortIndexTokens = [
        tokens.wbtc,
        tokens.weth,
        tokens.uni,
        tokens.link,
        tokens.uni,
        tokens.link,
      ];
      expect(
        await traderWalletContract.getGmxShortIndexTokens()
      ).to.have.ordered.members(shortIndexTokens);
    });
  });

  describe("When created positions", function () {
    describe("Add Long position 1", function () {
      const protocolId = 1; // GMX
      const replicate = true;

      let collateralToken: string;
      let indexToken: string;
      let sizeDelta: BigNumber;
      let isLong: boolean;

      let walletRequestKey: string;
      let vaultRequestKey: string;
      const positionOneAmountIn = utils.parseUnits("1000", 6);
      const leverageOne = 10;

      before(async () => {
        const tokenIn = usdcTokenContract.address;
        collateralToken = wbtcTokenContract.address;
        indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        const amountIn = positionOneAmountIn;
        const minOut = 0;
        sizeDelta = utils.parseUnits("1000", 30).mul(leverageOne); // leverage x10
        isLong = true;
        const tradeData = abiCoder.encode(
          ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
          [path, indexToken, amountIn, minOut, sizeDelta, isLong]
        );
        const operationId = 0; // increasePosition
        const traderOperation = { operationId, data: tradeData };

        await traderWalletContract.connect(trader).addProtocolToUse(protocolId);

        txResult = await traderWalletContract
          .connect(trader)
          .executeOnProtocol(protocolId, traderOperation, replicate);
        const txReceipt = await txResult.wait();
        const events = txReceipt.events?.filter(
          (event: any) => event.topics[0] === createIncreasePositionEvent
        );
        if (events) {
          walletRequestKey = requestKeyFromEvent(events[0]);
          vaultRequestKey = requestKeyFromEvent(events[1]);
        }

        await gmxPositionRouter
          .connect(keeper)
          .executeIncreasePosition(walletRequestKey, gmx.keeper);
        await gmxPositionRouter
          .connect(keeper)
          .executeIncreasePosition(vaultRequestKey, gmx.keeper);
      });

      it("Should evaluate one wallet's position", async () => {
        const walletValue = await gmxObserver.getValue(
          traderWalletContract.address
        );
        // console.log("wallet", walletValue);
        const usdcScaleRatio = utils.parseUnits("1", 24);
        expect(walletValue).to.be.gte(
          positionOneAmountIn.mul(usdcScaleRatio).mul(95).div(100)
        );
        expect(walletValue).to.be.lte(utils.parseUnits("1000", 30));
      });

      it("Should evaluate one users' position", async () => {
        const vaultValue = await gmxObserver.getValue(
          usersVaultContract.address
        );
        // console.log("vault", vaultValue);
        const usdcScaleRatio = utils.parseUnits("1", 24);
        expect(vaultValue).to.be.gte(
          positionOneAmountIn.mul(5).mul(usdcScaleRatio).mul(95).div(100)
        );
        expect(vaultValue).to.be.lte(utils.parseUnits("5000", 30));
      });

      describe("Add Long position 2", function () {
        const positionTwoAmountIn = utils.parseUnits("2000", 6);
        const leverageTwo = 10;

        before(async () => {
          const tokenIn = usdcTokenContract.address;
          collateralToken = tokens.weth;
          indexToken = collateralToken;
          const path = [tokenIn, collateralToken];
          const amountIn = positionTwoAmountIn;
          const minOut = 0;
          sizeDelta = utils.parseUnits("2000", 30).mul(leverageTwo); // leverage x10
          isLong = true;
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
          );
          if (events) {
            walletRequestKey = requestKeyFromEvent(events[0]);
            vaultRequestKey = requestKeyFromEvent(events[1]);
          }

          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(walletRequestKey, gmx.keeper);
          await gmxPositionRouter
            .connect(keeper)
            .executeIncreasePosition(vaultRequestKey, gmx.keeper);
        });

        it("Should evaluate two wallet's position", async () => {
          const walletValue = await gmxObserver.getValue(
            traderWalletContract.address
          );
          // console.log("wallet", walletValue);
          const usdcScaleRatio = utils.parseUnits("1", 24);
          expect(walletValue).to.be.gte(
            positionOneAmountIn
              .add(positionTwoAmountIn)
              .mul(usdcScaleRatio)
              .mul(95)
              .div(100)
          );
          expect(walletValue).to.be.lte(utils.parseUnits("3000", 30));
        });

        it("Should evaluate two users' position", async () => {
          const vaultValue = await gmxObserver.getValue(
            usersVaultContract.address
          );
          // console.log("vault", vaultValue);
          const usdcScaleRatio = utils.parseUnits("1", 24);
          expect(vaultValue).to.be.gte(
            positionOneAmountIn
              .add(positionTwoAmountIn)
              .mul(5)
              .mul(usdcScaleRatio)
              .mul(95)
              .div(100)
          );
          expect(vaultValue).to.be.lte(utils.parseUnits("15000", 30));
        });

        describe("Add Short position 1 (total 3 positions)", function () {
          const positionThreeAmountIn = utils.parseUnits("1000", 6);
          const leverageThree = 5;

          before(async () => {
            const tokenIn = usdcTokenContract.address;
            collateralToken = tokenIn;
            indexToken = tokens.wbtc;
            const path = [tokenIn];
            const amountIn = positionThreeAmountIn;
            const minOut = 0;
            sizeDelta = utils.parseUnits("1000", 30).mul(leverageThree);
            isLong = false;
            const tradeData = abiCoder.encode(
              ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
              [path, indexToken, amountIn, minOut, sizeDelta, isLong]
            );
            const operationId = 0; // increasePosition
            const tradeOperation = { operationId, data: tradeData };

            txResult = await traderWalletContract
              .connect(trader)
              .executeOnProtocol(protocolId, tradeOperation, replicate);
            const txReceipt = await txResult.wait();
            const events = txReceipt.events?.filter(
              (event: any) => event.topics[0] === createIncreasePositionEvent
            );
            if (events) {
              walletRequestKey = requestKeyFromEvent(events[0]);
              vaultRequestKey = requestKeyFromEvent(events[1]);
            }

            await gmxPositionRouter
              .connect(keeper)
              .executeIncreasePosition(walletRequestKey, gmx.keeper);
            await gmxPositionRouter
              .connect(keeper)
              .executeIncreasePosition(vaultRequestKey, gmx.keeper);
          });

          it("Should evaluate three wallet's position", async () => {
            const walletValue = await gmxObserver.getValue(
              traderWalletContract.address
            );
            // console.log("wallet", walletValue);
            const usdcScaleRatio = utils.parseUnits("1", 24);
            expect(walletValue).to.be.gte(
              positionOneAmountIn
                .add(positionTwoAmountIn)
                .add(positionThreeAmountIn)
                .mul(usdcScaleRatio)
                .mul(95)
                .div(100)
            );
            expect(walletValue).to.be.lte(utils.parseUnits("4000", 30));
          });

          it("Should evaluate three users' position", async () => {
            const vaultValue = await gmxObserver.getValue(
              usersVaultContract.address
            );
            // console.log("vault", vaultValue);
            const usdcScaleRatio = utils.parseUnits("1", 24);
            expect(vaultValue).to.be.gte(
              positionOneAmountIn
                .add(positionTwoAmountIn)
                .add(positionThreeAmountIn)
                .mul(5)
                .mul(usdcScaleRatio)
                .mul(95)
                .div(100)
            );
            expect(vaultValue).to.be.lte(utils.parseUnits("20000", 30));
          });

          describe("Decrease one of long positions", function () {
            const positionThreeAmountIn = utils.parseUnits("1000", 6);
            let collateralDelta: BigNumber;

            before(async () => {
              const tokenOut = usdcTokenContract.address;
              collateralToken = tokens.weth;
              indexToken = collateralToken;
              const path = [collateralToken, tokenOut];
              sizeDelta = utils.parseUnits("1000", 30).mul(leverageTwo);
              collateralDelta = utils.parseUnits("1000", 30); // decrease 50% of position
              const minOut = 0;
              isLong = true;

              const tradeData = abiCoder.encode(
                [
                  "address[]",
                  "address",
                  "uint256",
                  "uint256",
                  "bool",
                  "uint256",
                ],
                [path, indexToken, collateralDelta, sizeDelta, isLong, minOut]
              );
              const operationId = 1; // decrease Position
              const tradeOperation = { operationId, data: tradeData };

              txResult = await traderWalletContract
                .connect(trader)
                .executeOnProtocol(protocolId, tradeOperation, replicate);

              const txReceipt = await txResult.wait();
              const events = txReceipt.events?.filter(
                (event: any) => event.topics[0] === createDecreasePositionEvent
              );
              if (events) {
                walletRequestKey = requestKeyFromEvent(events[0]);
                vaultRequestKey = requestKeyFromEvent(events[1]);
              }

              await gmxPositionRouter
                .connect(keeper)
                .executeDecreasePosition(walletRequestKey, gmx.keeper);
              await gmxPositionRouter
                .connect(keeper)
                .executeDecreasePosition(vaultRequestKey, gmx.keeper);
            });

            it("Should evaluate three wallet's position", async () => {
              const walletValue = await gmxObserver.getValue(
                traderWalletContract.address
              );
              // console.log("wallet", walletValue);
              const usdcScaleRatio = utils.parseUnits("1", 24);
              expect(walletValue).to.be.gte(
                positionOneAmountIn
                  .add(positionTwoAmountIn)
                  .add(positionThreeAmountIn)
                  .sub(collateralDelta)
                  .mul(usdcScaleRatio)
                  .mul(95)
                  .div(100)
              );
              expect(walletValue).to.be.lte(utils.parseUnits("3000", 30));
            });

            it("Should evaluate three users' position", async () => {
              const vaultValue = await gmxObserver.getValue(
                usersVaultContract.address
              );
              // console.log("vault", vaultValue);
              const usdcScaleRatio = utils.parseUnits("1", 24);
              expect(vaultValue).to.be.gte(
                positionOneAmountIn
                  .add(positionTwoAmountIn)
                  .add(positionThreeAmountIn)
                  .sub(collateralDelta)
                  .mul(5) // ration
                  .mul(usdcScaleRatio)
                  .mul(95)
                  .div(100)
              );
              expect(vaultValue).to.be.lte(utils.parseUnits("15000", 30));
            });

            describe("With created increase order", function () {
              const tokenIn = tokens.usdc;
              const collateralToken = tokens.weth;
              const indexToken = collateralToken;
              const path = [tokenIn, collateralToken];
              const amountInOrder = utils.parseUnits("500", 6);
              const minOut = 0;
              const sizeDelta = utils.parseUnits("1000", 30); // leverage x2
              const isLong = true;
              const triggerAboveThreshold = true;
              const operationId = 2; // createIncreaseOrder
              const replicate = true;
              before(async () => {
                const currentPrice = await lensContract.getGmxMaxPrice(
                  indexToken
                );
                const triggerPrice = currentPrice.add(100);

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
                    amountInOrder,
                    indexToken,
                    minOut,
                    sizeDelta,
                    isLong,
                    triggerPrice,
                    triggerAboveThreshold,
                  ]
                );
                const traderOperation = { operationId, data: tradeData };

                await traderWalletContract
                  .connect(trader)
                  .executeOnProtocol(protocolId, traderOperation, replicate);
              });
              it("Should increase value", async () => {
                const walletValue = await gmxObserver.getValue(
                  traderWalletContract.address
                );

                // console.log("wallet", walletValue);
                const usdcScaleRatio = utils.parseUnits("1", 24);
                expect(walletValue).to.be.gte(
                  positionOneAmountIn
                    .add(positionTwoAmountIn)
                    .add(positionThreeAmountIn)
                    .sub(collateralDelta)
                    .add(amountInOrder)
                    .mul(usdcScaleRatio)
                    .mul(95)
                    .div(100)
                );
                expect(walletValue).to.be.lte(utils.parseUnits("3500", 30));
              });
            });
          });
        });
      });
    });
  });
});
