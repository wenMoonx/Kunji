import { ethers } from "hardhat";
import { setBalance, time } from "@nomicfoundation/hardhat-network-helpers";
import { Signer, BigNumber, utils, constants } from "ethers";
import { expect } from "chai";
import {
  TraderWallet,
  UsersVault,
  ContractsFactory,
  DynamicValuation,
  ERC20Mock,
  UniswapV3Adapter,
  IUniswapV3Router,
} from "../../typechain-types";
import { ZERO_AMOUNT, AMOUNT_1E18, AMOUNT_1E6 } from "../_helpers/constants";
import { setupContracts } from "../_helpers/setupFork";
import { uniswap, tokens, tokenHolders } from "../_helpers/arbitrumAddresses";

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
let wethHolder0: Signer;

let traderWalletContract: TraderWallet;
let usersVaultContract: UsersVault;
let contractsFactoryContract: ContractsFactory;
let dynamicValuationContract: DynamicValuation;

let usdcTokenContract: ERC20Mock;
let wethTokenContract: ERC20Mock;

let uniswapAdapterContract: UniswapV3Adapter;
let uniswapRouter: IUniswapV3Router;

let roundCounter: BigNumber;

describe("Vault and Wallet Flow Tests on Uniswap", function () {
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
    wethTokenContract = contract.wethTokenContract;
    contractsFactoryContract = contract.contractsFactoryContract;
    traderWalletContract = contract.traderWalletContract;
    usersVaultContract = contract.usersVaultContract;
    uniswapAdapterContract = contract.uniswapAdapterContract;
    dynamicValuationContract = contract.dynamicValuationContract;

    uniswapRouter = await ethers.getContractAt(
      "IUniswapV3Router",
      uniswap.routerAddress
    );

    // get uniswap contract
    await ethers.getContractAt("IUniswapV3Factory", uniswap.factoryAddress);

    trader = deployer;
    traderAddress = deployerAddress;
    ownerAddress = deployerAddress;
    underlyingTokenAddress = usdcTokenContract.address;

    // add investor
    await contractsFactoryContract.addInvestor(user1Address);

    roundCounter = BigNumber.from(0);
  });

  describe("WHEN Checking first Values", function () {
    it("THEN it should return correct ones after deployment", async () => {
      expect(await usersVaultContract.underlyingTokenAddress()).to.equal(
        underlyingTokenAddress
      );
      expect(await usersVaultContract.contractsFactoryAddress()).to.equal(
        contractsFactoryContract.address
      );
      expect(await usersVaultContract.traderWalletAddress()).to.equal(
        traderWalletContract.address
      );

      expect(await usersVaultContract.owner()).to.equal(ownerAddress);

      /////////////////////////////////////////////////////////////
      /////////////////////////////////////////////////////////////

      expect(await traderWalletContract.vaultAddress()).to.equal(
        usersVaultContract.address
      );
      expect(await traderWalletContract.underlyingTokenAddress()).to.equal(
        underlyingTokenAddress
      );
      expect(await traderWalletContract.contractsFactoryAddress()).to.equal(
        contractsFactoryContract.address
      );
      expect(await traderWalletContract.traderAddress()).to.equal(
        traderAddress
      );
      expect(await traderWalletContract.owner()).to.equal(ownerAddress);

      expect(await traderWalletContract.cumulativePendingDeposits()).to.equal(
        ZERO_AMOUNT
      );
      expect(
        await traderWalletContract.cumulativePendingWithdrawals()
      ).to.equal(ZERO_AMOUNT);
      expect(await traderWalletContract.currentRound()).to.equal(roundCounter);

      expect(await usersVaultContract.totalSupply()).to.equal(ZERO_AMOUNT);
      expect(await usersVaultContract.currentRound()).to.equal(roundCounter);
    });
  });

  describe("Initial deposits", function () {
    let traderInputAmount: BigNumber;
    let user1InputAmount: BigNumber;

    let traderInitialBalance: BigNumber;
    let user1InitialBalance: BigNumber;

    before(async () => {
      traderInputAmount = utils.parseUnits("1000", 6);
      user1InputAmount = utils.parseUnits("5000", 6);

      // initial funds
      usdcHolder0 = await ethers.getImpersonatedSigner(tokenHolders.usdc[0]);
      await usdcTokenContract
        .connect(usdcHolder0)
        .transfer(traderAddress, traderInputAmount);
      await usdcTokenContract
        .connect(usdcHolder0)
        .transfer(user1Address, user1InputAmount);

      traderInitialBalance = await usdcTokenContract.balanceOf(traderAddress);
      user1InitialBalance = await usdcTokenContract.balanceOf(user1Address);
      await usdcTokenContract
        .connect(trader)
        .approve(traderWalletContract.address, traderInputAmount);
      await usdcTokenContract
        .connect(user1)
        .approve(usersVaultContract.address, user1InputAmount);
      await traderWalletContract
        .connect(trader)
        .traderDeposit(traderInputAmount);
      await usersVaultContract.connect(user1).userDeposit(user1InputAmount);
    });

    it("Should updates trader's and user's deposits in the contracts", async () => {
      expect(await traderWalletContract.cumulativePendingDeposits()).to.equal(
        traderInputAmount
      );

      const { round, pendingDepositAssets, unclaimedDepositShares } =
        await usersVaultContract.userData(user1Address);
      expect(round).to.equal(ZERO_AMOUNT);
      expect(pendingDepositAssets).to.equal(user1InputAmount);
      expect(unclaimedDepositShares).to.equal(ZERO_AMOUNT);
    });

    describe("Executing first rollover", function () {
      before(async () => {
        roundCounter = roundCounter.add(1);

        await traderWalletContract.connect(trader).rollover();
      });

      it("Should increase current round counter", async () => {
        expect(await traderWalletContract.currentRound()).to.equal(
          roundCounter
        );
        expect(await usersVaultContract.currentRound()).to.equal(roundCounter);
      });

      it("Should increase Vault's totalSupply", async () => {
        const sharesToMint = await dynamicValuationContract.getOraclePrice(
          tokens.usdc,
          user1InputAmount
        );

        expect(await usersVaultContract.totalSupply()).to.equal(sharesToMint);
      });

      it("Should increase users shares preview", async () => {
        const sharesToMint = await dynamicValuationContract.getOraclePrice(
          tokens.usdc,
          user1InputAmount
        );

        expect(await usersVaultContract.previewShares(user1Address)).to.equal(
          sharesToMint
        );
      });

      describe("User claims shares after first rollover", function () {
        let shares: BigNumber;

        before(async () => {
          shares = await usersVaultContract.previewShares(user1Address);
          await usersVaultContract.connect(user1).claim();
        });

        it("Should increase User 1 share balance", async () => {
          expect(await usersVaultContract.balanceOf(user1Address)).to.equal(
            shares
          );
        });

        describe("User creates withdraw request", function () {
          before(async () => {
            const shares = await usersVaultContract.balanceOf(user1Address);

            await usersVaultContract.connect(user1).withdrawRequest(shares);
          });

          it("Should transfer users shares from user to vault contract", async () => {
            expect(await usersVaultContract.balanceOf(user1Address)).to.equal(
              ZERO_AMOUNT
            );
          });
        });
      });

      describe("Uniswap Trading Flow", function () {
        before(async () => {
          // initial funds for changing price
          await setBalance(tokenHolders.usdc[0], utils.parseEther("10"));
          await setBalance(tokenHolders.weth[0], utils.parseEther("10"));
          usdcHolder0 = await ethers.getImpersonatedSigner(
            tokenHolders.usdc[0]
          );
          await usdcTokenContract
            .connect(usdcHolder0)
            .transfer(deployerAddress, AMOUNT_1E6.mul(500000));
          wethHolder0 = await ethers.getImpersonatedSigner(
            tokenHolders.weth[0]
          );
          await wethTokenContract
            .connect(wethHolder0)
            .transfer(deployerAddress, AMOUNT_1E18.mul(5000));
        });

        describe("Sell execution for Wallet and Vault with whole balance", function () {
          const protocolId = 2;
          const operationId = 1;
          const replicate = true;
          const amountIn = utils.parseUnits("1000", 6);
          const fee = 500;

          let amountOutMin: BigNumber;
          let expectedAmountOutWallet: BigNumber;
          let expectedAmountOutVault: BigNumber;

          before(async () => {
            const path = utils.solidityPack(
              ["address", "uint24", "address"],
              [usdcTokenContract.address, fee, wethTokenContract.address]
            );

            [expectedAmountOutWallet] =
              await uniswapAdapterContract.callStatic.getAmountOut(
                path,
                amountIn
              );
            [expectedAmountOutVault] =
              await uniswapAdapterContract.callStatic.getAmountOut(
                path,
                amountIn.mul(5)
              );

            amountOutMin = expectedAmountOutWallet.mul(90).div(100);

            const tradeData = abiCoder.encode(
              ["bytes", "uint256", "uint256"],
              [path, amountIn, amountOutMin]
            );
            const traderOperation = { operationId, data: tradeData };

            await traderWalletContract
              .connect(trader)
              .executeOnProtocol(protocolId, traderOperation, replicate);
          });

          it("Should sell all USDC tokens", async () => {
            expect(
              await usdcTokenContract.balanceOf(traderWalletContract.address)
            ).to.equal(ZERO_AMOUNT);
            expect(
              await usdcTokenContract.balanceOf(usersVaultContract.address)
            ).to.equal(ZERO_AMOUNT);
          });

          it("Should buy WETH tokens and increase balances of Wallet and Vault", async () => {
            expect(
              await wethTokenContract.balanceOf(traderWalletContract.address)
            )
              .to.be.lte(expectedAmountOutWallet)
              .to.be.gt(expectedAmountOutWallet.mul(90).div(100))
              .to.be.gt(ZERO_AMOUNT);

            expect(
              await wethTokenContract.balanceOf(usersVaultContract.address)
            )
              .to.be.lte(expectedAmountOutVault)
              .to.be.gt(expectedAmountOutVault.mul(90).div(100))
              .to.be.gt(ZERO_AMOUNT);
          });

          describe("Sell WETH tokens after increasing price of WETH", function () {
            before(async () => {
              // increase weth price by swapping huge amount of USDC to WETH
              let path = utils.solidityPack(
                ["address", "uint24", "address"],
                [usdcTokenContract.address, fee, wethTokenContract.address]
              );
              const amountIn = utils.parseUnits("500000", 6);
              const deadline = 1746350000;
              const swapParams = {
                path,
                recipient: deployerAddress,
                deadline,
                amountIn,
                amountOutMinimum: 0,
              };
              await usdcTokenContract
                .connect(deployer)
                .approve(uniswapRouter.address, constants.MaxUint256);
              await uniswapRouter.connect(deployer).exactInput(swapParams);

              // sell all weth tokens
              const currentWethBalance = await wethTokenContract.balanceOf(
                traderWalletContract.address
              );
              path = utils.solidityPack(
                ["address", "uint24", "address"],
                [wethTokenContract.address, fee, usdcTokenContract.address]
              );
              const amountOutMin = 0;
              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, currentWethBalance, amountOutMin]
              );
              const traderOperation = { operationId, data: tradeData };

              await traderWalletContract
                .connect(trader)
                .executeOnProtocol(protocolId, traderOperation, replicate);
            });

            it("Should sell all WETH tokens", async () => {
              expect(
                await wethTokenContract.balanceOf(traderWalletContract.address)
              ).to.equal(ZERO_AMOUNT);
              expect(
                await wethTokenContract.balanceOf(usersVaultContract.address)
              ).to.equal(ZERO_AMOUNT);
            });

            it("Should close position with profit of USDC", async () => {
              expect(
                await usdcTokenContract.balanceOf(traderWalletContract.address)
              ).to.be.gt(traderInputAmount);
              expect(
                await usdcTokenContract.balanceOf(usersVaultContract.address)
              ).to.be.gt(user1InputAmount);
            });

            describe("Rollover after first trade", function () {
              let traderBalanceBefore: BigNumber;
              let walletBalance: BigNumber;

              before(async () => {
                await time.increase(10801);
                roundCounter = roundCounter.add(1);

                traderBalanceBefore = await usdcTokenContract.balanceOf(
                  traderAddress
                );
                walletBalance = await usdcTokenContract.balanceOf(
                  traderWalletContract.address
                );
                await traderWalletContract
                  .connect(trader)
                  .withdrawRequest(walletBalance);

                // Rollover after trade
                await traderWalletContract.connect(trader).rollover();
              });

              it("Should increase current round counter after first trade", async () => {
                expect(await traderWalletContract.currentRound()).to.equal(
                  roundCounter
                );
                expect(await usersVaultContract.currentRound()).to.equal(
                  roundCounter
                );
              });

              it("Should pay out whole profit to trader (increase trader balance)", async () => {
                expect(
                  await usdcTokenContract.balanceOf(
                    traderWalletContract.address
                  )
                ).to.equal(ZERO_AMOUNT);
                expect(
                  await usdcTokenContract.balanceOf(traderAddress)
                ).to.equal(traderBalanceBefore.add(walletBalance));

                expect(
                  await usdcTokenContract.balanceOf(traderAddress)
                ).to.be.gt(traderInitialBalance);
              });

              describe("User withdraws profit after trading", function () {
                let user1BalanceBefore: BigNumber;
                let vaultBalanceBefore: BigNumber;

                before(async () => {
                  user1BalanceBefore = await usdcTokenContract.balanceOf(
                    user1Address
                  );
                  vaultBalanceBefore = await usdcTokenContract.balanceOf(
                    usersVaultContract.address
                  );

                  await usersVaultContract.connect(user1).claim();
                });

                it("Should withdraw all tokens from Vault contract", async () => {
                  expect(
                    await usdcTokenContract.balanceOf(
                      usersVaultContract.address
                    )
                  ).approximately(
                    await usersVaultContract.kunjiFeesAssets(),
                    1
                  );
                });

                it("Should return profitable user1 balance after trading", async () => {
                  const userBalance = await usdcTokenContract.balanceOf(
                    user1Address
                  );

                  expect(userBalance).to.approximately(
                    user1BalanceBefore
                      .add(vaultBalanceBefore)
                      .sub(await usersVaultContract.kunjiFeesAssets()),
                    1
                  );
                  expect(userBalance).to.be.gt(user1InitialBalance);
                });
              });
            });
          });
        });
      });
    });
  });
});
