import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  Signer,
  ContractTransaction,
  BigNumber,
  utils,
  constants,
} from "ethers";
import {
  UniswapV3Adapter,
  ERC20Mock,
  IUniswapV3Pool,
  IAdapter,
  IUniswapV3Factory,
  TraderWalletMock,
} from "../../typechain-types";
import { tokens, uniswap } from "./../_helpers/arbitrumAddresses";
import Reverter from "../_helpers/reverter";
import { deployERC20 } from "../_helpers/ERC20Mock/ERC20Mock";
import {
  addLiquidity,
  createPool,
  initializePool,
} from "../_helpers/UniswapV3/createPool";

const reverter = new Reverter();
const abiCoder = new utils.AbiCoder();

let deployer: Signer;
let vault: Signer;
let trader: Signer;
let nonAuthorized: Signer;
let mockTraderWallet: Signer;
let mockUsersVault: Signer;

let deployerAddress: string;
let vaultAddress: string;
let traderAddress: string;
let mockTraderWalletAddress: string;
let mockUsersVaultAddress: string;

// let TraderWalletFactory: TraderWalletTest__factory;
let traderWalletContract: TraderWalletMock;

let txResult: ContractTransaction;

let uniswapAdapterContract: UniswapV3Adapter;
let uniswapFactory: IUniswapV3Factory;

let contractUSDT: ERC20Mock;
let contractUSDC: ERC20Mock;

describe("UniswapAdapter", function () {
  async function deploy() {
    const UniswapAdapterF = await ethers.getContractFactory("UniswapV3Adapter");
    const uniswapAdapter: UniswapV3Adapter = (await upgrades.deployProxy(
      UniswapAdapterF,
      [],
      {
        initializer: "initialize",
      }
    )) as UniswapV3Adapter;
    await uniswapAdapter.deployed();

    return uniswapAdapter;
  }

  before(async () => {
    const traderWalletMockFactory = await ethers.getContractFactory(
      "TraderWalletMock"
    );
    traderWalletContract = await traderWalletMockFactory.deploy();
    await traderWalletContract.setIsAllowedTradeToken(tokens.usdc, true);

    await ethers.getContractAt("IUniswapV3Router", uniswap.routerAddress);
    await ethers.getContractAt("IQuoterV2", uniswap.quoterAddress);
    uniswapFactory = await ethers.getContractAt(
      "IUniswapV3Factory",
      uniswap.factoryAddress
    );
    await ethers.getContractAt(
      "INonfungiblePositionManager",
      uniswap.positionManagerAddress
    );

    [deployer, vault, trader, nonAuthorized, mockTraderWallet, mockUsersVault] =
      await ethers.getSigners();

    [
      deployerAddress,
      vaultAddress,
      traderAddress,
      mockTraderWalletAddress,
      mockUsersVaultAddress,
    ] = await Promise.all([
      deployer.getAddress(),
      vault.getAddress(),
      trader.getAddress(),
      mockTraderWallet.getAddress(),
      mockUsersVault.getAddress(),
    ]);
  });

  describe("Adapter functionality", function () {
    describe("Deploy with correct parameters", function () {
      before(async () => {
        uniswapAdapterContract = await loadFixture(deploy);
      });

      it("Should return correct uniswap router address", async () => {
        expect(await uniswapAdapterContract.uniswapV3Router()).to.equal(
          uniswap.routerAddress
        );
      });

      it("Should return correct quoter address", async () => {
        expect(await uniswapAdapterContract.quoter()).to.equal(
          uniswap.quoterAddress
        );
      });

      it("Should return correct ratio denominator value", async () => {
        const ratioDenominator = ethers.utils.parseUnits("1", 18);
        expect(await uniswapAdapterContract.ratioDenominator()).to.equal(
          ratioDenominator
        );
      });

      it("Should return correct min slippage allowance", async () => {
        const slippageAllowanceMin = ethers.utils.parseUnits("0.001", 18); // 0.1%
        expect(await uniswapAdapterContract.slippageAllowanceMin()).to.equal(
          slippageAllowanceMin
        );
      });

      it("Should return correct max slippage allowance", async () => {
        const slippageAllowanceMax = ethers.utils.parseUnits("0.3", 18); // 30%
        expect(await uniswapAdapterContract.slippageAllowanceMax()).to.equal(
          slippageAllowanceMax
        );
      });

      it("Should return correct initial slippage allowance value", async () => {
        const slippageAllowance = ethers.utils.parseUnits("0.04", 18); // 4%
        expect(await uniswapAdapterContract.slippage()).to.equal(
          slippageAllowance
        );
      });
    });

    describe("Setting slippage allowance", function () {
      before(async () => {
        uniswapAdapterContract = await loadFixture(deploy);
      });

      describe("With incorrect parameters or callers", function () {
        it("Should revert if slippage lower than minimum", async () => {
          const newSlippage = utils.parseUnits("1", 10);
          await expect(
            uniswapAdapterContract.setSlippageAllowance(newSlippage)
          ).to.be.revertedWithCustomError(
            uniswapAdapterContract,
            "InvalidSlippage"
          );
        });

        it("Should revert if slippage a bit lower than min limit", async () => {
          const newSlippage = utils.parseUnits("0.00099", 18);
          await expect(
            uniswapAdapterContract.setSlippageAllowance(newSlippage)
          ).to.be.revertedWithCustomError(
            uniswapAdapterContract,
            "InvalidSlippage"
          );
        });

        it("Should revert if slippage greater than maximum", async () => {
          const newSlippage = utils.parseUnits("1", 18);
          await expect(
            uniswapAdapterContract.setSlippageAllowance(newSlippage)
          ).to.be.revertedWithCustomError(
            uniswapAdapterContract,
            "InvalidSlippage"
          );
        });

        it("Should revert if slippage a bit greater than maximum", async () => {
          const newSlippage = utils.parseUnits("0.30001", 18);
          await expect(
            uniswapAdapterContract.setSlippageAllowance(newSlippage)
          ).to.be.revertedWithCustomError(
            uniswapAdapterContract,
            "InvalidSlippage"
          );
        });

        it("Should revert caller is not the owner", async () => {
          const newSlippage = utils.parseUnits("0.2", 18);
          await expect(
            uniswapAdapterContract
              .connect(nonAuthorized)
              .setSlippageAllowance(newSlippage)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      describe("With correct parameters", function () {
        const newSlippage = utils.parseUnits("0.2", 18);

        before(async () => {
          await reverter.snapshot();
          txResult = await uniswapAdapterContract.setSlippageAllowance(
            newSlippage
          );
        });
        after(async () => {
          await reverter.revert();
        });

        it("Should return new slippage allowance value", async () => {
          expect(await uniswapAdapterContract.slippage()).to.equal(newSlippage);
        });
        it("Should emit an Event", async () => {
          await expect(txResult)
            .to.emit(uniswapAdapterContract, "SlippageAllowance")
            .withArgs(newSlippage);
        });
      });
    });

    describe("Getting expected amounts (view) from dex", function () {
      before(async () => {
        uniswapAdapterContract = await loadFixture(deploy);
      });

      it("Should return amountOut from uniswap", async () => {
        const fee = 100;
        const path = utils.solidityPack(
          ["address", "uint24", "address"],
          [tokens.usdc, fee, tokens.usdt]
        );
        const amountIn = utils.parseUnits("1", 6);
        const [amountOut] =
          await uniswapAdapterContract.callStatic.getAmountOut(path, amountIn);

        expect(amountOut).to.be.lt(amountIn.add(utils.parseUnits("1", 5)));
        expect(amountOut).to.be.gt(amountIn.sub(utils.parseUnits("1", 5)));
      });

      it("Should return amountIn from uniswap", async () => {
        const fee = 100;
        const path = utils.solidityPack(
          ["address", "uint24", "address"],
          [tokens.usdc, fee, tokens.usdt]
        );
        const amountOut = utils.parseUnits("1", 6);
        const [amountIn] = await uniswapAdapterContract.callStatic.getAmountIn(
          path,
          amountOut
        );

        expect(amountIn).to.be.lt(amountOut.add(utils.parseUnits("1", 5)));
        expect(amountIn).to.be.gt(amountOut.sub(utils.parseUnits("1", 5)));
      });
    });

    describe("Trade operations", async () => {
      let pool: IUniswapV3Pool;
      const fee = 100;

      before(async () => {
        contractUSDT = (await deployERC20("USDT_Mock", "USDT", 6)) as ERC20Mock;
        contractUSDC = (await deployERC20("USDC_Mock", "USDC", 6)) as ERC20Mock;
        await contractUSDT.mint(
          deployerAddress,
          utils.parseUnits("5000000", 6)
        );
        await contractUSDC.mint(
          deployerAddress,
          utils.parseUnits("5000000", 6)
        );

        await createPool(contractUSDC.address, contractUSDT.address, fee);
        const poolAddress = await uniswapFactory.getPool(
          contractUSDT.address,
          contractUSDC.address,
          fee
        );
        pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);

        const initSqrtPrice = BigNumber.from("79207954401793479052443056521");
        await initializePool(poolAddress, initSqrtPrice);

        // token order is important when adding liquidity
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const tickLower = -5000;
        const tickUpper = 5000;
        const amountDesired = utils.parseUnits("100000", 6);
        await addLiquidity(
          token0,
          token1,
          tickLower,
          tickUpper,
          fee,
          amountDesired,
          amountDesired
        );

        await contractUSDT.mint(
          traderWalletContract.address,
          utils.parseUnits("1000", 6)
        );
        await contractUSDC.mint(
          mockUsersVaultAddress,
          utils.parseUnits("2000", 6)
        );
      });

      describe("Executing trade operations", function () {
        describe("Trade with non allowed operation", function () {
          it("Should revert if operation 3 is not allowed for adapter", async () => {
            const isTraderWallet = true;
            const ratio = 0;
            const operationId = 3;
            const tradeData = utils.hexlify("0x12345678");
            const traderOperation = { operationId, data: tradeData };
            await expect(
              uniswapAdapterContract.executeOperation(
                isTraderWallet,
                traderWalletContract.address,
                mockUsersVaultAddress,
                ratio,
                traderOperation
              )
            ).to.be.revertedWithCustomError(
              uniswapAdapterContract,
              "InvalidOperationId"
            );
          });
          it("Should revert if operation 6 is not allowed for adapter", async () => {
            const isTraderWallet = true;
            const ratio = 0;
            const operationId = 6;
            const tradeData = utils.hexlify("0x12345678");
            const traderOperation = { operationId, data: tradeData };
            await expect(
              uniswapAdapterContract.executeOperation(
                isTraderWallet,
                traderWalletContract.address,
                mockUsersVaultAddress,
                ratio,
                traderOperation
              )
            ).to.be.revertedWithCustomError(
              uniswapAdapterContract,
              "InvalidOperationId"
            );
          });
        });

        describe("Trade with not allowed trade tokens", function () {
          const isTraderWallet = true;
          const operationId = 1; // sell
          const ratio = utils.parseUnits("1", 18);
          const amountIn = utils.parseUnits("500", 6);
          let traderOperation: IAdapter.AdapterOperationStruct;

          before(async () => {
            const path = utils.solidityPack(
              ["address", "uint24", "address"],
              [contractUSDT.address, fee, contractUSDC.address]
            );
            const [expectedAmountOut] =
              await uniswapAdapterContract.callStatic.getAmountOut(
                path,
                amountIn
              );
            const amountOutMin = expectedAmountOut.add(1);

            const tradeData = abiCoder.encode(
              ["bytes", "uint256", "uint256"],
              [path, amountIn, amountOutMin]
            );
            traderOperation = { operationId, data: tradeData };

            await reverter.snapshot();
          });

          after(async () => {
            await reverter.revert();
          });

          it("should revert due to not allowed USDT token", async () => {
            await contractUSDT.connect(trader).mint(traderAddress, amountIn);
            await contractUSDT
              .connect(trader)
              .approve(uniswapAdapterContract.address, amountIn);

            await expect(
              uniswapAdapterContract
                .connect(trader)
                .executeOperation(
                  isTraderWallet,
                  traderWalletContract.address,
                  mockUsersVaultAddress,
                  ratio,
                  traderOperation
                )
            ).to.be.revertedWithCustomError(
              uniswapAdapterContract,
              "NotSupportedTokens"
            );
          });
        });

        describe("Sell execution WITHOUT scaling (ratio 1e18)", function () {
          describe("Failing sell operation due to slippage 0%", function () {
            const isTraderWallet = true;
            const operationId = 1; // sell
            const ratio = utils.parseUnits("1", 18);
            const amountIn = utils.parseUnits("500", 6);
            let traderOperation: IAdapter.AdapterOperationStruct;

            before(async () => {
              await traderWalletContract.setIsAllowedTradeToken(
                contractUSDT.address,
                true
              );
              await traderWalletContract.setIsAllowedTradeToken(
                contractUSDC.address,
                true
              );
              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDT.address, fee, contractUSDC.address]
              );
              const [expectedAmountOut] =
                await uniswapAdapterContract.callStatic.getAmountOut(
                  path,
                  amountIn
                );
              const amountOutMin = expectedAmountOut.add(1);

              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountIn, amountOutMin]
              );
              traderOperation = { operationId, data: tradeData };

              await reverter.snapshot();
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should revert swap due to slippage", async () => {
              await contractUSDT.connect(trader).mint(traderAddress, amountIn);
              await contractUSDT
                .connect(trader)
                .approve(uniswapAdapterContract.address, amountIn);

              await expect(
                uniswapAdapterContract
                  .connect(trader)
                  .executeOperation(
                    isTraderWallet,
                    traderWalletContract.address,
                    mockUsersVaultAddress,
                    ratio,
                    traderOperation
                  )
              ).to.be.revertedWith("Too little received");
            });
          });

          describe("Sell execution without scaling (only for trader)", function () {
            const isTraderWallet = true;
            const operationId = 1;
            const ratio = utils.parseUnits("1", 18);
            const amountIn = utils.parseUnits("500", 6);
            const amountOutMin = utils.parseUnits("450", 6);

            let balanceUsdt: BigNumber;
            // let balanceUsdc: BigNumber;
            let expectedAmountOut: BigNumber;

            before(async () => {
              await reverter.snapshot();

              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDT.address, fee, contractUSDC.address]
              );
              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountIn, amountOutMin]
              );
              const traderOperation = { operationId, data: tradeData };

              await contractUSDT.connect(trader).mint(traderAddress, amountIn);
              await contractUSDT
                .connect(trader)
                .approve(uniswapAdapterContract.address, amountIn);
              balanceUsdt = await contractUSDT.balanceOf(traderAddress);
              // balanceUsdc = await contractUSDC.balanceOf(traderAddress);

              [expectedAmountOut] =
                await uniswapAdapterContract.callStatic.getAmountOut(
                  path,
                  amountIn
                );
              txResult = await uniswapAdapterContract
                .connect(trader)
                .executeOperation(
                  isTraderWallet,
                  traderWalletContract.address,
                  mockUsersVaultAddress,
                  ratio,
                  traderOperation
                );
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should sell all USDT tokens of the trader", async () => {
              const balanceUsdtNew = await contractUSDT.balanceOf(
                traderAddress
              );
              expect(balanceUsdtNew).to.be.lt(balanceUsdt);
              expect(balanceUsdtNew).to.equal(0);
            });

            it("Should increase trader USDC balance", async () => {
              const balanceUsdcNew = await contractUSDC.balanceOf(
                traderAddress
              );
              expect(balanceUsdcNew).to.be.gte(amountOutMin);
              expect(balanceUsdcNew).to.equal(expectedAmountOut);
            });
          });
        });

        describe("Sell execution WITH scaling (ratio > 1e18)", function () {
          describe("Failing sell operation due to slippage 0%", function () {
            const isTraderWallet = false;
            const operationId = 1; // sell
            const multiplier = "3";
            const ratio = utils.parseUnits(multiplier, 18);
            const amountIn = utils.parseUnits("500", 6);
            let traderOperation: IAdapter.AdapterOperationStruct;

            before(async () => {
              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDT.address, fee, contractUSDC.address]
              );
              const [expectedAmountOut] =
                await uniswapAdapterContract.callStatic.getAmountOut(
                  path,
                  amountIn
                );
              const amountOutMin = expectedAmountOut.mul(110).div(100);

              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountIn, amountOutMin]
              );
              traderOperation = { operationId, data: tradeData };

              await reverter.snapshot();
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should revert vault swap due to slippage", async () => {
              await contractUSDT
                .connect(vault)
                .mint(vaultAddress, amountIn.mul(multiplier));
              await contractUSDT
                .connect(vault)
                .approve(uniswapAdapterContract.address, constants.MaxUint256);
              await expect(
                uniswapAdapterContract
                  .connect(vault)
                  .executeOperation(
                    isTraderWallet,
                    traderWalletContract.address,
                    mockUsersVaultAddress,
                    ratio,
                    traderOperation
                  )
              ).to.be.revertedWith("Too little received");
            });
          });

          describe("Sell execution with vault ratio", function () {
            const isTraderWallet = false;
            const operationId = 1;
            const multiplier = "3";
            const ratio = utils.parseUnits(multiplier, 18);
            const amountIn = utils.parseUnits("500", 6);
            // will be executed due to slippage increase in the contract
            const amountOutMin = utils.parseUnits("500", 6);

            let balanceUsdt: BigNumber;
            let expectedAmountOut: BigNumber;

            before(async () => {
              await reverter.snapshot();

              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDT.address, fee, contractUSDC.address]
              );
              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountIn, amountOutMin]
              );
              const traderOperation = { operationId, data: tradeData };

              await contractUSDT
                .connect(vault)
                .mint(vaultAddress, amountIn.mul(multiplier));
              await contractUSDT
                .connect(vault)
                .approve(uniswapAdapterContract.address, constants.MaxUint256);
              balanceUsdt = await contractUSDT.balanceOf(vaultAddress);

              [expectedAmountOut] =
                await uniswapAdapterContract.callStatic.getAmountOut(
                  path,
                  amountIn.mul(multiplier)
                );
              txResult = await uniswapAdapterContract
                .connect(vault)
                .executeOperation(
                  isTraderWallet,
                  traderWalletContract.address,
                  mockUsersVaultAddress,
                  ratio,
                  traderOperation
                );
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should sell all USDT tokens of the vault", async () => {
              const balanceUsdtNew = await contractUSDT.balanceOf(vaultAddress);
              expect(balanceUsdtNew).to.be.lt(balanceUsdt);
              expect(balanceUsdtNew).to.equal(0);
            });

            it("Should increase trader USDC balance", async () => {
              const balanceUsdcNew = await contractUSDC.balanceOf(vaultAddress);
              expect(balanceUsdcNew).to.be.gte(amountOutMin);
              expect(balanceUsdcNew).to.equal(expectedAmountOut);
            });
          });
        });

        describe("Buy execution WITHOUT scaling (ratio 1e18)", function () {
          let traderOperation: IAdapter.AdapterOperationStruct;
          let amountInMaximum: BigNumber;
          const isTraderWallet = true;
          const operationId = 0; // buy

          describe("Failing buy operation due to slippage 0%", function () {
            const ratio = utils.parseUnits("1", 18);
            const amountOut = utils.parseUnits("500", 6);

            before(async () => {
              // exact amount out requires reverse path order
              // since we're going to swap USDT to USDC, path should be [usdc, fee, usdt]
              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDC.address, fee, contractUSDT.address]
              );
              const [expectedAmountIn] =
                await uniswapAdapterContract.callStatic.getAmountIn(
                  path,
                  amountOut
                );
              amountInMaximum = expectedAmountIn.sub(1);
              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountOut, amountInMaximum]
              );
              traderOperation = { operationId, data: tradeData };

              await reverter.snapshot();
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should revert swap due to slippage", async () => {
              await contractUSDT
                .connect(trader)
                .mint(traderAddress, amountInMaximum.add(1));
              await contractUSDT
                .connect(trader)
                .approve(uniswapAdapterContract.address, constants.MaxUint256);

              await expect(
                uniswapAdapterContract
                  .connect(trader)
                  .executeOperation(
                    isTraderWallet,
                    traderWalletContract.address,
                    mockUsersVaultAddress,
                    ratio,
                    traderOperation
                  )
              ).to.be.revertedWith("STF"); // "STF" due to adapter additional transfer
            });
          });

          describe("Buy execution with trader ratio (ratio == 1e18)", function () {
            const ratio = utils.parseUnits("1", 18);
            const amountOut = utils.parseUnits("500", 6);

            let balanceUsdt: BigNumber;
            let balanceUsdc: BigNumber;

            before(async () => {
              await reverter.snapshot();

              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDC.address, fee, contractUSDT.address]
              );
              const [expectedAmountIn] =
                await uniswapAdapterContract.callStatic.getAmountIn(
                  path,
                  amountOut
                );
              amountInMaximum = expectedAmountIn;

              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountOut, amountInMaximum]
              );
              const traderOperation = { operationId, data: tradeData };

              await contractUSDT
                .connect(trader)
                .mint(traderAddress, amountInMaximum);
              await contractUSDT
                .connect(trader)
                .approve(uniswapAdapterContract.address, amountInMaximum);
              balanceUsdt = await contractUSDT.balanceOf(traderAddress);
              balanceUsdc = await contractUSDC.balanceOf(traderAddress);

              txResult = await uniswapAdapterContract
                .connect(trader)
                .executeOperation(
                  isTraderWallet,
                  traderWalletContract.address,
                  mockUsersVaultAddress,
                  ratio,
                  traderOperation
                );
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should spend all minted amountInMaximum of USDT tokens of the trader to buy exact 500 USDC", async () => {
              const balanceUsdtNew = await contractUSDT.balanceOf(
                traderAddress
              );
              expect(balanceUsdtNew).to.be.lt(balanceUsdt);
              expect(balanceUsdtNew).to.equal(0);
            });

            it("Should increase trader USDC balance for 500 tokens (buy exact 500 USDC)", async () => {
              const balanceUsdcNew = await contractUSDC.balanceOf(
                traderAddress
              );
              expect(balanceUsdcNew).to.gt(balanceUsdc);
              expect(balanceUsdcNew).to.equal(amountOut);
            });

            it("Should change trader token balances in the correct way (USDC+; USDT-)", async () => {
              await expect(() => txResult).to.changeTokenBalance(
                contractUSDC,
                traderAddress,
                utils.parseUnits("500", 6)
              );

              await expect(() => txResult).to.changeTokenBalance(
                contractUSDT,
                traderAddress,
                amountInMaximum.mul(-1)
              );
            });
          });
        });

        describe("Buy execution WITH scaling (ratio > 1e18)", function () {
          let traderOperation: IAdapter.AdapterOperationStruct;
          const operationId = 0; // buy
          const multiplier = 3;
          const isTraderWallet = false;

          describe("Failing buy operation due to slippage 0%", function () {
            const ratio = utils.parseUnits(multiplier.toString(), 18);
            const amountOut = utils.parseUnits("500", 6);
            let amountInMaximum: BigNumber;

            before(async () => {
              // exact amount out requires reverse path order
              // since we're going to swap USDT to USDC, path should be [usdc, fee, usdt]
              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDC.address, fee, contractUSDT.address]
              );
              const [expectedAmountIn] =
                await uniswapAdapterContract.callStatic.getAmountIn(
                  path,
                  amountOut
                );
              amountInMaximum = expectedAmountIn.mul(90).div(100);

              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountOut, amountInMaximum]
              );
              traderOperation = { operationId, data: tradeData };

              await reverter.snapshot();
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should revert vault swap due to slippage", async () => {
              await contractUSDT
                .connect(vault)
                .mint(vaultAddress, amountInMaximum.mul(2).mul(multiplier));
              await contractUSDT
                .connect(vault)
                .approve(uniswapAdapterContract.address, constants.MaxUint256);
              await expect(
                uniswapAdapterContract
                  .connect(vault)
                  .executeOperation(
                    isTraderWallet,
                    traderWalletContract.address,
                    mockUsersVaultAddress,
                    ratio,
                    traderOperation
                  )
              ).to.be.revertedWith("STF");
            });
          });

          describe("Buy execution with Vault ratio (ratio > 1e18)", function () {
            const ratio = utils.parseUnits(multiplier.toString(), 18);
            const amountOut = utils.parseUnits("500", 6);
            let amountInMaximum: BigNumber;

            let balanceUsdt: BigNumber;
            let expectedAmountIn: BigNumber;
            let amountInScaled: BigNumber;

            before(async () => {
              await reverter.snapshot();

              const path = utils.solidityPack(
                ["address", "uint24", "address"],
                [contractUSDC.address, fee, contractUSDT.address]
              );
              [expectedAmountIn] =
                await uniswapAdapterContract.callStatic.getAmountIn(
                  path,
                  amountOut
                );
              amountInMaximum = expectedAmountIn;

              const tradeData = abiCoder.encode(
                ["bytes", "uint256", "uint256"],
                [path, amountOut, amountInMaximum]
              );
              const traderOperation = { operationId, data: tradeData };

              [amountInScaled] =
                await uniswapAdapterContract.callStatic.getAmountIn(
                  path,
                  amountOut.mul(multiplier)
                );
              await contractUSDT
                .connect(vault)
                .mint(vaultAddress, amountInScaled);
              await contractUSDT
                .connect(vault)
                .approve(uniswapAdapterContract.address, constants.MaxUint256);
              balanceUsdt = await contractUSDT.balanceOf(vaultAddress);

              txResult = await uniswapAdapterContract
                .connect(vault)
                .executeOperation(
                  isTraderWallet,
                  traderWalletContract.address,
                  mockUsersVaultAddress,
                  ratio,
                  traderOperation
                );
            });

            after(async () => {
              await reverter.revert();
            });

            it("Should spend all minted amountIn of USDT tokens of the trader to buy exact 1500 USDC", async () => {
              const balanceUsdtNew = await contractUSDT.balanceOf(vaultAddress);
              expect(balanceUsdtNew).to.be.lt(balanceUsdt);
              expect(balanceUsdtNew).to.equal(0);
            });

            it("Should increase Vault USDC balance", async () => {
              const balanceUsdcNew = await contractUSDC.balanceOf(vaultAddress);
              expect(balanceUsdcNew).to.be.gte(amountOut);
              expect(balanceUsdcNew).to.equal(amountOut.mul(multiplier));
            });

            it("Should change Vault token balances in the correct way (USDC+; USDT-)", async () => {
              await expect(() => txResult).to.changeTokenBalance(
                contractUSDC,
                vaultAddress,
                amountOut.mul(multiplier)
              );

              await expect(() => txResult).to.changeTokenBalance(
                contractUSDT,
                vaultAddress,
                amountInScaled.mul(-1)
              );
            });
          });
        });
      });
    });
  });
});

// @todo add tests with ratio < 1e18
