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
  ContractsFactory,
  ERC20Mock,
  IGmxPositionRouter,
  Lens,
  GmxVaultPriceFeedMock,
  GMXObserver,
} from "../../typechain-types";
import { setupContracts } from "../_helpers/setupFork";
import { tokens, gmx, tokenHolders } from "../_helpers/arbitrumAddresses";

// flow for unit-tests
// create GMX positions
// evaluate positions getValue

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
let contractsFactoryContract: ContractsFactory;
let gmxPositionRouter: IGmxPositionRouter;
let lensContract: Lens;
let gmxVaultPriceFeedMockContract: GmxVaultPriceFeedMock;
let gmxObserverFactory: ContractFactory;
let gmxObserver: GMXObserver;

let usdcTokenContract: ERC20Mock;
let wbtcTokenContract: ERC20Mock;
let usdtTokenContract: ERC20Mock;

let keeper: Signer;

describe("Emergency withdraw and closing positions tests", function () {
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

    usdtTokenContract = await ethers.getContractAt("ERC20Mock", tokens.usdt);

    trader = deployer;
    traderAddress = deployerAddress;

    const GmxPriceFeedFactory = await ethers.getContractFactory(
      "GmxVaultPriceFeedMock"
    );
    gmxVaultPriceFeedMockContract = await GmxPriceFeedFactory.deploy();
    await gmxVaultPriceFeedMockContract.deployed();

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

  describe("When created GMX position", function () {
    describe("Long position 1", function () {
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

      let walletSize: BigNumber;
      let vaultSize: BigNumber;

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
        expect(vaultSize).to.equal(sizeDelta.mul(5));
      });

      describe("Emergency closing positions", function () {
        before(async () => {
          const path = [tokens.wbtc, tokens.usdt];
          const indexToken = tokens.wbtc;
          isLong = true;

          // wallet closes
          const walletTxResult = await traderWalletContract
            .connect(trader)
            .emergencyDecreasePosition(path, indexToken, walletSize, isLong);
          const walletTxReceipt = await walletTxResult.wait();

          let events = walletTxReceipt.events?.filter(
            (event: any) => event.topics[0] === createDecreasePositionEvent
          );
          if (events) {
            walletRequestKey = requestKeyFromEvent(events[0]);
          }
          await gmxPositionRouter
            .connect(keeper)
            .executeDecreasePosition(walletRequestKey, gmx.keeper);

          // vault closes
          const vaultTxResult = await usersVaultContract
            .connect(trader)
            .emergencyDecreasePosition(path, indexToken, vaultSize, isLong);
          const vaultTxReceipt = await vaultTxResult.wait();
          events = vaultTxReceipt.events?.filter(
            (event: any) => event.topics[0] === createDecreasePositionEvent
          );
          if (events) {
            vaultRequestKey = requestKeyFromEvent(events[0]);
          }
          await gmxPositionRouter
            .connect(keeper)
            .executeDecreasePosition(vaultRequestKey, gmx.keeper);
        });

        it("Should close wallet's position", async () => {
          const walletPositions = await lensContract.getPositions(
            traderWalletContract.address,
            [collateralToken],
            [indexToken],
            [isLong]
          );
          const [walletSize] = walletPositions;
          expect(walletSize).to.equal(0);
        });

        it("Should close vault's position", async () => {
          const vaultPositions = await lensContract.getPositions(
            usersVaultContract.address,
            [collateralToken],
            [indexToken],
            [isLong]
          );

          [vaultSize] = vaultPositions;
          expect(vaultSize).to.equal(0);
        });

        it("Should USDT balance on wallet and vault contracts", async () => {
          expect(
            await usdtTokenContract.balanceOf(traderWalletContract.address)
          ).to.be.gt(1);
          expect(
            await usdtTokenContract.balanceOf(usersVaultContract.address)
          ).to.be.gt(2);
        });

        describe("Emergency USDT withdraw from wallet", function () {
          let usdtTraderBalanceBefore: BigNumber;
          let usdtWalletBalance: BigNumber;
          let usdtVaultBalance: BigNumber;

          before(async () => {
            usdtTraderBalanceBefore = await usdtTokenContract.balanceOf(
              traderAddress
            );
            usdtWalletBalance = await usdtTokenContract.balanceOf(
              traderWalletContract.address
            );
            usdtVaultBalance = await usdtTokenContract.balanceOf(
              usersVaultContract.address
            );

            await traderWalletContract
              .connect(trader)
              .emergencyWithdraw(tokens.usdt);
          });

          it("Should increase traders USDT Balance", async () => {
            expect(await usdtTokenContract.balanceOf(traderAddress)).to.equal(
              usdtWalletBalance
            );
            expect(await usdtTokenContract.balanceOf(traderAddress)).to.be.gt(
              usdtTraderBalanceBefore
            );
          });

          describe("Emergency USDT withdraw from vault", function () {
            before(async () => {
              await usersVaultContract
                .connect(trader)
                .emergencyWithdraw(tokens.usdt);
            });

            it("Should increase traders USDT Balance", async () => {
              expect(await usdtTokenContract.balanceOf(traderAddress)).to.equal(
                usdtWalletBalance.add(usdtVaultBalance)
              );
              expect(await usdtTokenContract.balanceOf(traderAddress)).to.be.gt(
                usdtTraderBalanceBefore.add(usdtWalletBalance)
              );
            });
          });

          describe("Emergency withdraw ether from TraderWallet", function () {
            let ethTraderBalanceBefore: BigNumber;
            let ethWalletBalanceBefore: BigNumber;

            before(async () => {
              ethTraderBalanceBefore = await ethers.provider.getBalance(
                traderAddress
              );
              ethWalletBalanceBefore = await ethers.provider.getBalance(
                traderWalletContract.address
              );
              await traderWalletContract
                .connect(trader)
                .emergencyWithdraw(tokens.eth);
            });

            it("Should increase trader's ether balance", async () => {
              expect(
                await ethers.provider.getBalance(traderWalletContract.address)
              ).to.equal(0);
              expect(await ethers.provider.getBalance(traderAddress)).to.be.gt(
                ethTraderBalanceBefore
              );
            });

            describe("Emergency withdraw ether from UsersVault", function () {
              before(async () => {
                await usersVaultContract
                  .connect(trader)
                  .emergencyWithdraw(tokens.eth);
              });

              it("Should increase trader's ether balance", async () => {
                expect(
                  await ethers.provider.getBalance(usersVaultContract.address)
                ).to.equal(0);
                expect(
                  await ethers.provider.getBalance(traderAddress)
                ).to.be.gt(ethTraderBalanceBefore.add(ethWalletBalanceBefore));
              });
            });
          });
        });
      });
    });
  });
});
