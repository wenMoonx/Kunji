/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import {
  Signer,
  ContractFactory,
  ContractTransaction,
  BigNumber,
  utils,
  constants,
} from "ethers";
import { setBalance, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  TraderWallet,
  UsersVault,
  ContractsFactory,
  ERC20Mock,
  IGmxPositionRouter,
  Lens,
  GmxVaultPriceFeedMock,
  GMXObserver,
  IUniswapV3Router,
} from "../../typechain-types";
import { setupContracts } from "../_helpers/setupFork";
import {
  tokens,
  gmx,
  tokenHolders,
  uniswap,
} from "../_helpers/arbitrumAddresses";
import Reverter from "../_helpers/reverter";

const reverter = new Reverter();

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
let user2: Signer;

let deployerAddress: string;
let traderAddress: string;
let user1Address: string;
let user2Address: string;
let usdcHolder0: Signer;

let txResult: ContractTransaction;
let traderWalletContract: TraderWallet;
let usersVaultContract: UsersVault;
let contractsFactoryContract: ContractsFactory;
let gmxPositionRouter: IGmxPositionRouter;
let lensContract: Lens;
let gmxVaultPriceFeedMockContract: GmxVaultPriceFeedMock;
let gmxObserverFactory: ContractFactory;
let gmxObserver: GMXObserver;

let usdcTokenContract: ERC20Mock;
let wbtcTokenContract: ERC20Mock;
let wethTokenContract: ERC20Mock;
let usdtTokenContract: ERC20Mock;

let keeper: Signer;

describe("Emergency closing positions by users tests", function () {
  let traderInputAmount: BigNumber;
  let user1InputAmount: BigNumber;
  let user2InputAmount: BigNumber;

  before(async () => {
    // get signers
    [deployer, user1, user2] = await ethers.getSigners();

    // get addresses
    [deployerAddress, user1Address, user2Address] = await Promise.all([
      deployer.getAddress(),
      user1.getAddress(),
      user2.getAddress(),
    ]);

    // deploy contracts
    const contract = await setupContracts(deployer, deployerAddress);
    usdcTokenContract = contract.usdcTokenContract;
    wbtcTokenContract = contract.wbtcTokenContract;
    wethTokenContract = contract.wethTokenContract;
    contractsFactoryContract = contract.contractsFactoryContract;
    traderWalletContract = contract.traderWalletContract;
    usersVaultContract = contract.usersVaultContract;
    lensContract = contract.lensContract;
    gmxPositionRouter = await ethers.getContractAt(
      "IGmxPositionRouter",
      gmx.positionRouterAddress
    );
    await ethers.getContractAt("IGmxVault", gmx.vaultAddress);

    gmxObserverFactory = await ethers.getContractFactory("GMXObserver");
    gmxObserver = (await gmxObserverFactory.deploy()) as GMXObserver;
    await gmxObserver.deployed();

    await contractsFactoryContract.addInvestor(user1Address);
    await contractsFactoryContract.addInvestor(user2Address);

    usdtTokenContract = await ethers.getContractAt("ERC20Mock", tokens.usdt);

    trader = deployer;
    traderAddress = deployerAddress;

    const GmxPriceFeedFactory = await ethers.getContractFactory(
      "GmxVaultPriceFeedMock"
    );
    gmxVaultPriceFeedMockContract = await GmxPriceFeedFactory.deploy();
    await gmxVaultPriceFeedMockContract.deployed();

    // initial deposits
    traderInputAmount = utils.parseUnits("4000", 6);
    user1InputAmount = utils.parseUnits("8000", 6);
    user2InputAmount = utils.parseUnits("8000", 6);

    // initial funds
    usdcHolder0 = await ethers.getImpersonatedSigner(tokenHolders.usdc[0]);
    await usdcTokenContract
      .connect(usdcHolder0)
      .transfer(traderAddress, traderInputAmount);
    await usdcTokenContract
      .connect(usdcHolder0)
      .transfer(user1Address, user1InputAmount);
    await usdcTokenContract
      .connect(usdcHolder0)
      .transfer(user2Address, user2InputAmount);

    await usdcTokenContract
      .connect(trader)
      .approve(traderWalletContract.address, traderInputAmount);
    await usdcTokenContract
      .connect(user1)
      .approve(usersVaultContract.address, user1InputAmount);
    await usdcTokenContract
      .connect(user2)
      .approve(usersVaultContract.address, user2InputAmount);

    await traderWalletContract.connect(trader).traderDeposit(traderInputAmount);
    await usersVaultContract.connect(user1).userDeposit(user1InputAmount);
    await usersVaultContract.connect(user2).userDeposit(user2InputAmount);

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

  describe("When positions were created", function () {
    describe("Initial states", function () {
      it("Should has defaultSlippagePercent", async () => {
        expect(await usersVaultContract.defaultSlippagePercent()).to.equal(150);
      });

      it("Should has correct slippageStepPercent", async () => {
        expect(await usersVaultContract.slippageStepPercent()).to.equal(100);
      });

      it("Should has same value for currentSlippage as defaultSlippagePercent", async () => {
        const defaultSlippage =
          await usersVaultContract.defaultSlippagePercent();
        expect(await usersVaultContract.currentSlippage()).to.equal(
          defaultSlippage
        );
      });

      it("Should has correct emergencyPeriod", async () => {
        const hours15 = BigNumber.from(15).mul(60).mul(60);
        expect(await usersVaultContract.emergencyPeriod()).to.equal(hours15);
      });

      it("Should has closed 'isEmergencyOpen' flag", async () => {
        expect(await usersVaultContract.isEmergencyOpen()).to.equal(false);
      });
    });

    describe("#1 - GMX Long position 1", function () {
      const replicate = true;

      let collateralToken: string;
      let indexToken: string;
      let sizeDelta: BigNumber;
      let isLong: boolean;

      let walletRequestKey: string;
      let vaultRequestKey: string;
      const positionOneAmountIn = utils.parseUnits("1000", 6);
      const leverageOne = 2;

      let walletSize: BigNumber;
      let vaultSize: BigNumber;

      before(async () => {
        await traderWalletContract.connect(trader).addProtocolToUse(1);
        const protocolId = 1;
        const tokenIn = usdcTokenContract.address;
        collateralToken = wbtcTokenContract.address;
        indexToken = collateralToken;
        const path = [tokenIn, collateralToken];
        const amountIn = positionOneAmountIn;
        const minOut = 0;
        sizeDelta = utils.parseUnits("1000", 30).mul(leverageOne); // leverage x2
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

      it("Should return existing TraderWallet position", async () => {
        const walletPositions = await lensContract.getPositions(
          traderWalletContract.address,
          [collateralToken],
          [indexToken],
          [isLong]
        );
        [walletSize] = walletPositions;
        expect(walletSize).to.equal(sizeDelta);
      });

      it("Should return existing UsersVault position", async () => {
        const vaultPositions = await lensContract.getPositions(
          usersVaultContract.address,
          [collateralToken],
          [indexToken],
          [isLong]
        );

        [vaultSize] = vaultPositions;
        expect(vaultSize).to.equal(sizeDelta.mul(2).mul(2)); // lev 2 for 2 users
      });

      describe("#2 - GMX Short position 2", function () {
        const leverageTwo = 2;
        const positionTwoAmountIn = utils.parseUnits("1000", 6);

        before(async () => {
          const shortCollaterals = [tokens.usdc];
          const shortIndexTokens = [tokens.weth];
          await traderWalletContract
            .connect(deployer)
            .addGmxShortPairs(shortCollaterals, shortIndexTokens);

          const protocolId = 1;
          const tokenIn = usdcTokenContract.address;
          collateralToken = tokenIn;
          indexToken = tokens.weth;
          const path = [tokenIn];
          const amountIn = positionTwoAmountIn;
          const minOut = 0;
          sizeDelta = utils.parseUnits("1000", 30).mul(leverageTwo); // leverage x2
          isLong = false;
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

        it("Should return 2 existing TraderWallet position", async () => {
          const walletPositions = await lensContract.getAllPositionsProcessed(
            traderWalletContract.address
          );
          expect(walletPositions.length).to.equal(2);
        });

        it("Should return 2 existing UsersVault position", async () => {
          const vaultPositions = await lensContract.getAllPositionsProcessed(
            usersVaultContract.address
          );
          expect(vaultPositions.length).to.equal(2);
        });

        describe("Failing close positions", function () {
          it("Should fail closing positions due to 15h after rollover doesn't pass", async () => {
            await expect(
              usersVaultContract.connect(user2).emergencyClose()
            ).to.be.revertedWithCustomError(usersVaultContract, "TooEarly");
          });
        });

        describe("Close all GMX positions", function () {
          let walletRequestKey1: string;
          let walletRequestKey2: string;
          let vaultRequestKey1: string;
          let vaultRequestKey2: string;

          before(async () => {
            // add snapshot
            await reverter.snapshot();
            await time.increase(15 * 60 * 60 + 1);

            txResult = await usersVaultContract.connect(user2).emergencyClose();

            // handle closing request by a keeper
            const txReceipt = await txResult.wait();
            const events = txReceipt.events?.filter(
              (event: any) => event.topics[0] === createDecreasePositionEvent
            );
            if (events) {
              walletRequestKey1 = requestKeyFromEvent(events[0]);
              walletRequestKey2 = requestKeyFromEvent(events[1]);
              vaultRequestKey1 = requestKeyFromEvent(events[2]);
              vaultRequestKey2 = requestKeyFromEvent(events[3]);
            }

            await gmxPositionRouter
              .connect(keeper)
              .executeDecreasePosition(walletRequestKey1, gmx.keeper);
            await gmxPositionRouter
              .connect(keeper)
              .executeDecreasePosition(walletRequestKey2, gmx.keeper);
            await gmxPositionRouter
              .connect(keeper)
              .executeDecreasePosition(vaultRequestKey1, gmx.keeper);
            await gmxPositionRouter
              .connect(keeper)
              .executeDecreasePosition(vaultRequestKey2, gmx.keeper);
          });

          after(async () => {
            // revert snapshot
            await reverter.revert();
          });

          it("Should return 0 existing Wallet position", async () => {
            const walletPositions = await lensContract.getAllPositionsProcessed(
              traderWalletContract.address
            );
            expect(walletPositions.length).to.equal(0);
          });

          it("Should return 0 existing UsersVault position", async () => {
            const vaultPositions = await lensContract.getAllPositionsProcessed(
              usersVaultContract.address
            );
            expect(vaultPositions.length).to.equal(0);
          });
        });

        describe("#3 - Open uniswap WBTC position", function () {
          const protocolId = 2; // uniswap
          const operationId = 1; // sell

          before(async () => {
            const amountIn = positionOneAmountIn;
            const fee = 500;
            const path = utils.solidityPack(
              ["address", "uint24", "address"],
              [tokens.usdc, fee, tokens.wbtc]
            );
            const amountOutMin = 1; // don't care here
            const tradeData = abiCoder.encode(
              ["bytes", "uint256", "uint256"],
              [path, amountIn, amountOutMin]
            );
            const traderOperation = { operationId, data: tradeData };
            await traderWalletContract
              .connect(trader)
              .executeOnProtocol(protocolId, traderOperation, replicate);
          });

          it("Should increase WBTC balance on wallet and userVault", async () => {
            const walletBalance = await wbtcTokenContract.balanceOf(
              traderWalletContract.address
            );
            expect(walletBalance).to.be.gt(100);
            expect(
              await wbtcTokenContract.balanceOf(usersVaultContract.address)
            ).to.be.gt(walletBalance);
          });

          describe("#4 - Open uniswap WETH position", function () {
            const protocolId = 2; // uniswap
            const operationId = 1; // sell

            before(async () => {
              const amountIn = positionOneAmountIn;
              const fee = 500;
              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [tokens.usdc, fee, tokens.weth]
              );
              const amountOutMin = 1; // don't care here
              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountIn, amountOutMin]
              );
              const traderOperation = { operationId, data: tradeData };
              await traderWalletContract
                .connect(trader)
                .executeOnProtocol(protocolId, traderOperation, replicate);
            });

            it("Should increase WETH balance on wallet and userVault", async () => {
              const walletBalance = await wethTokenContract.balanceOf(
                traderWalletContract.address
              );
              expect(walletBalance).to.be.gt(100);
              expect(
                await wethTokenContract.balanceOf(usersVaultContract.address)
              ).to.be.gt(walletBalance);
            });

            it("Should become underlying token balance Zero", async () => {
              expect(
                await usdtTokenContract.balanceOf(traderWalletContract.address)
              ).to.equal(0);
              expect(
                await usdtTokenContract.balanceOf(usersVaultContract.address)
              ).to.equal(0);
            });

            describe("Close all positions", function () {
              let walletRequestKey1: string;
              let walletRequestKey2: string;
              let vaultRequestKey1: string;
              let vaultRequestKey2: string;

              before(async () => {
                // add snapshot
                await reverter.snapshot();
                await time.increase(15 * 60 * 60 + 1);
                txResult = await usersVaultContract
                  .connect(user2)
                  .emergencyClose();

                // handle closing request by a keeper
                const txReceipt = await txResult.wait();
                const events = txReceipt.events?.filter(
                  (event: any) =>
                    event.topics[0] === createDecreasePositionEvent
                );
                if (events) {
                  walletRequestKey1 = requestKeyFromEvent(events[0]);
                  walletRequestKey2 = requestKeyFromEvent(events[1]);
                  vaultRequestKey1 = requestKeyFromEvent(events[2]);
                  vaultRequestKey2 = requestKeyFromEvent(events[3]);
                }

                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(walletRequestKey1, gmx.keeper);
                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(walletRequestKey2, gmx.keeper);
                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(vaultRequestKey1, gmx.keeper);
                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(vaultRequestKey2, gmx.keeper);
              });

              after(async () => {
                // revert snapshot
                await reverter.revert();
              });

              it("Should return 0 existing Wallet position", async () => {
                const walletPositions =
                  await lensContract.getAllPositionsProcessed(
                    traderWalletContract.address
                  );
                expect(walletPositions.length).to.equal(0);
              });

              it("Should return 0 existing UsersVault position", async () => {
                const vaultPositions =
                  await lensContract.getAllPositionsProcessed(
                    usersVaultContract.address
                  );
                expect(vaultPositions.length).to.equal(0);
              });

              it("Should sell all wbtc tokens", async () => {
                expect(
                  await wbtcTokenContract.balanceOf(
                    traderWalletContract.address
                  )
                ).to.equal(0);
                expect(
                  await wbtcTokenContract.balanceOf(usersVaultContract.address)
                ).to.equal(0);
              });

              it("Should sell all weth tokens", async () => {
                expect(
                  await wethTokenContract.balanceOf(
                    traderWalletContract.address
                  )
                ).to.equal(0);
                expect(
                  await wethTokenContract.balanceOf(usersVaultContract.address)
                ).to.equal(0);
              });

              it("Should return almost all usdc tokens", async () => {
                const traderNewBalance = await usdcTokenContract.balanceOf(
                  traderWalletContract.address
                );
                const usersNewBalance = await usdcTokenContract.balanceOf(
                  usersVaultContract.address
                );

                expect(traderNewBalance).to.be.gt(
                  traderInputAmount.mul(80).div(100)
                );
                expect(usersNewBalance).to.be.gt(
                  user1InputAmount.add(user2InputAmount).mul(80).div(100)
                );
              });
            });

            describe("Partially closing when high price impact", () => {
              let wethWalletBalanceBefore: BigNumber;
              let wethVaultBalanceBefore: BigNumber;

              let walletRequestKey1: string;
              let walletRequestKey2: string;
              let vaultRequestKey1: string;
              let vaultRequestKey2: string;

              let wethHolder: Signer;
              let deadline: number;
              let router: IUniswapV3Router;

              before(async () => {
                await reverter.snapshot();

                wethWalletBalanceBefore = await wethTokenContract.balanceOf(
                  traderWalletContract.address
                );
                wethVaultBalanceBefore = await wethTokenContract.balanceOf(
                  usersVaultContract.address
                );
                const path = utils.solidityPack(
                  ["address", "uint24", "address"],
                  [tokens.weth, 3000, tokens.usdc]
                );

                // fake swap weth -> usdc to decrease weth price
                wethHolder = await ethers.getImpersonatedSigner(
                  tokenHolders.weth[2]
                );
                await setBalance(tokenHolders.weth[2], utils.parseEther("10"));

                const swapAmount = utils.parseUnits("92.3", 18);
                router = await ethers.getContractAt(
                  "IUniswapV3Router",
                  uniswap.routerAddress
                );
                await wethTokenContract
                  .connect(wethHolder)
                  .approve(router.address, constants.MaxUint256);

                const defaultPoolFee = 3000;
                const fakeSwapPath = utils.solidityPack(
                  ["address", "uint24", "address"],
                  [tokens.weth, defaultPoolFee, tokens.usdc]
                );
                deadline = (await time.latest()) + 500000;
                const fakeSwapParams = {
                  path: fakeSwapPath,
                  recipient: tokenHolders.weth[2],
                  deadline: deadline,
                  amountIn: swapAmount,
                  amountOutMinimum: 0,
                };
                await router.connect(wethHolder).exactInput(fakeSwapParams);

                await time.increase(15 * 60 * 60 + 1);
                txResult = await usersVaultContract
                  .connect(user2)
                  .emergencyClose();

                // handle closing request by a keeper
                const txReceipt = await txResult.wait();
                const events = txReceipt.events?.filter(
                  (event: any) =>
                    event.topics[0] === createDecreasePositionEvent
                );
                if (events) {
                  walletRequestKey1 = requestKeyFromEvent(events[0]);
                  walletRequestKey2 = requestKeyFromEvent(events[1]);
                  vaultRequestKey1 = requestKeyFromEvent(events[2]);
                  vaultRequestKey2 = requestKeyFromEvent(events[3]);
                }

                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(walletRequestKey1, gmx.keeper);
                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(walletRequestKey2, gmx.keeper);
                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(vaultRequestKey1, gmx.keeper);
                await gmxPositionRouter
                  .connect(keeper)
                  .executeDecreasePosition(vaultRequestKey2, gmx.keeper);
              });

              after(async () => {
                await reverter.revert();
              });

              it("Should not close all uniswap positions (weth stays in the contracts)", async () => {
                const wethWalletBalance = await wethTokenContract.balanceOf(
                  traderWalletContract.address
                );
                expect(wethWalletBalance).to.be.lt(wethWalletBalanceBefore);
                expect(wethWalletBalance).to.be.gt(1);
              });

              it("Should not close all uniswap positions (weth stays in the contracts)", async () => {
                const wethVaultBalance = await wethTokenContract.balanceOf(
                  usersVaultContract.address
                );
                expect(wethVaultBalance).to.be.lt(wethVaultBalanceBefore);
                expect(wethVaultBalance).to.be.gt(1);
              });

              it("Close wbtc uniswap position GMX positions", async () => {
                const wbtcWalletBalance = await wbtcTokenContract.balanceOf(
                  traderWalletContract.address
                );
                const wbtcVaultBalance = await wbtcTokenContract.balanceOf(
                  usersVaultContract.address
                );
                expect(wbtcWalletBalance).to.equal(0);
                expect(wbtcVaultBalance).to.equal(0);
              });

              it("Should return zero active GMX positions", async () => {
                const walletPositions =
                  await lensContract.getAllPositionsProcessed(
                    traderWalletContract.address
                  );
                const vaultPositions =
                  await lensContract.getAllPositionsProcessed(
                    usersVaultContract.address
                  );

                expect(walletPositions.length).to.equal(0);
                expect(vaultPositions.length).to.equal(0);
              });

              it("Should return open value for isEmergencyOpen", async () => {
                expect(await usersVaultContract.isEmergencyOpen()).to.equal(
                  true
                );
              });

              it("Should return increased value for currentSlippage", async () => {
                const defaultSlippagePercent = 150;
                const slippageStepPercent = 100;
                expect(await usersVaultContract.currentSlippage()).to.equal(
                  defaultSlippagePercent + slippageStepPercent
                );
              });

              describe("Close rest position", function () {
                before(async () => {
                  const holderUsdcBalance = await usdcTokenContract.balanceOf(
                    tokenHolders.weth[2]
                  );
                  const defaultPoolFee = 3000;
                  const fakeSwapPath = utils.solidityPack(
                    ["address", "uint24", "address"],
                    [tokens.usdc, defaultPoolFee, tokens.weth]
                  );
                  const fakeSwapBackParams = {
                    path: fakeSwapPath,
                    recipient: tokenHolders.weth[2],
                    deadline: deadline,
                    amountIn: holderUsdcBalance,
                    amountOutMinimum: 0,
                  };

                  await usdcTokenContract
                    .connect(wethHolder)
                    .approve(router.address, constants.MaxUint256);
                  await router
                    .connect(wethHolder)
                    .exactInput(fakeSwapBackParams);

                  await usersVaultContract.connect(user2).emergencyClose();
                });

                it("Should close all uniswap positions (weth balance becomes zero)", async () => {
                  const wethWalletBalance = await wethTokenContract.balanceOf(
                    traderWalletContract.address
                  );
                  expect(wethWalletBalance).to.equal(0);
                });

                it("Should close all uniswap positions (weth balance becomes zero)", async () => {
                  const wethVaultBalance = await wethTokenContract.balanceOf(
                    usersVaultContract.address
                  );
                  expect(wethVaultBalance).to.equal(0);
                });

                it("Should return open value for isEmergencyOpen", async () => {
                  expect(await usersVaultContract.isEmergencyOpen()).to.equal(
                    false
                  );
                });

                it("Should return default value for currentSlippage", async () => {
                  const defaultSlippagePercent = 150;
                  expect(await usersVaultContract.currentSlippage()).to.equal(
                    defaultSlippagePercent
                  );
                });
              });
            });
          });
        });
      });
    });
  });
});
