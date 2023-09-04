/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import {
  Signer,
  ContractTransaction,
  BigNumber,
  utils,
  constants,
} from "ethers";
import {
  setBalance,
  setCode,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  TraderWallet,
  UsersVault,
  ContractsFactory,
  ERC20Mock,
  IGmxPositionRouter,
  Lens,
  GmxVaultPriceFeedMock,
  IGmxVault,
} from "../../typechain-types";
import { ZERO_AMOUNT, ZERO_ADDRESS } from "../_helpers/constants";
import { setupContracts } from "../_helpers/setupFork";
import { tokens, gmx, tokenHolders } from "../_helpers/arbitrumAddresses";

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

let usdcTokenContract: ERC20Mock;
let wbtcTokenContract: ERC20Mock;

let roundCounter: BigNumber;

describe("Vault and Wallet Flow Tests on GMX", function () {
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

    it("Should increase USDC balances of the Wallet and Vault", async () => {
      expect(
        await usdcTokenContract.balanceOf(traderWalletContract.address)
      ).to.equal(traderInputAmount);

      expect(
        await usdcTokenContract.balanceOf(usersVaultContract.address)
      ).to.equal(user1InputAmount);
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
        expect(await usersVaultContract.totalSupply()).to.be.gte(
          user1InputAmount.mul(utils.parseUnits("1", 24))
        );
      });
    });

    describe("GMX Trading Flow", function () {
      describe("Create Long Increase position for Wallet and Vault with whole balance", function () {
        const protocolId = 1; // GMX
        const replicate = true;
        let collateralToken: string;
        let indexToken: string;
        let sizeDelta: BigNumber;
        let isLong: boolean;

        let keeper: Signer;
        let walletRequestKey: string;
        let vaultRequestKey: string;

        before(async () => {
          // top-up ether balances to pay execution fee
          await trader.sendTransaction({
            to: traderWalletContract.address,
            value: utils.parseEther("0.2"),
          });
          await trader.sendTransaction({
            to: usersVaultContract.address,
            value: utils.parseEther("0.2"),
          });

          const tokenIn = usdcTokenContract.address;
          collateralToken = wbtcTokenContract.address;
          indexToken = collateralToken;
          const path = [tokenIn, collateralToken];
          const amountIn = traderInputAmount;
          const minOut = 0;
          sizeDelta = utils.parseUnits("10000", 30); // leverage x10
          isLong = true;
          const tradeData = abiCoder.encode(
            ["address[]", "address", "uint256", "uint256", "uint256", "bool"],
            [path, indexToken, amountIn, minOut, sizeDelta, isLong]
          );
          const operationId = 0; // increasePosition
          const traderOperation = { operationId, data: tradeData };

          await traderWalletContract
            .connect(trader)
            .addProtocolToUse(protocolId);

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
        });

        it("Should sell all USDC tokens", async () => {
          expect(
            await usdcTokenContract.balanceOf(traderWalletContract.address)
          ).to.equal(ZERO_AMOUNT);
          expect(
            await usdcTokenContract.balanceOf(usersVaultContract.address)
          ).to.equal(ZERO_AMOUNT);
        });

        it("Should create IncreasePositionRequest in GMX.PositionRouter contract for Wallet ", async () => {
          const walletCreatedRequest =
            await gmxPositionRouter.increasePositionRequests(walletRequestKey);
          expect(walletCreatedRequest.account).to.equal(
            traderWalletContract.address
          );
          expect(walletCreatedRequest.amountIn).to.equal(traderInputAmount);
        });

        it("Should create IncreasePositionRequest in GMX.PositionRouter contract for Vault ", async () => {
          const vaultCreatedRequest =
            await gmxPositionRouter.increasePositionRequests(vaultRequestKey);
          expect(vaultCreatedRequest.account).to.equal(
            usersVaultContract.address
          );
          expect(vaultCreatedRequest.amountIn).to.equal(user1InputAmount);
        });

        describe("Execute increasing positions by a keeper", function () {
          before(async () => {
            keeper = await ethers.getImpersonatedSigner(gmx.keeper);
            await setBalance(gmx.keeper, utils.parseEther("10"));
            await gmxPositionRouter
              .connect(keeper)
              .executeIncreasePosition(walletRequestKey, gmx.keeper);
            await gmxPositionRouter
              .connect(keeper)
              .executeIncreasePosition(vaultRequestKey, gmx.keeper);
          });

          it("Should remove Wallet's IncreasePositionRequest after executing ", async () => {
            const createdRequest =
              await gmxPositionRouter.increasePositionRequests(
                walletRequestKey
              );
            expect(createdRequest.account).to.equal(constants.AddressZero);
            expect(createdRequest.indexToken).to.equal(constants.AddressZero);
            expect(createdRequest.amountIn).to.equal(constants.Zero);
          });

          it("Should remove Vault's IncreasePositionRequest after executing ", async () => {
            const createdRequest =
              await gmxPositionRouter.increasePositionRequests(vaultRequestKey);
            expect(createdRequest.account).to.equal(constants.AddressZero);
            expect(createdRequest.indexToken).to.equal(constants.AddressZero);
            expect(createdRequest.amountIn).to.equal(constants.Zero);
          });

          it("Should check all opened positions for Wallet", async () => {
            const positions = await lensContract.getAllPositionsProcessed(
              traderWalletContract.address
            );
            expect(positions.length).to.equal(1); // only one current position
            const position = positions[0];

            expect(position.size).to.equal(sizeDelta);
            expect(position.isLong).to.equal(true);
            expect(position.collateralToken).to.equal(collateralToken);
            expect(position.indexToken).to.equal(indexToken);
          });

          it("Should return opened position from positions list for Wallet", async () => {
            const position = await lensContract.getPositions(
              traderWalletContract.address,
              [collateralToken],
              [indexToken],
              [isLong]
            );
            const [size] = position;
            expect(size).to.equal(sizeDelta);
          });

          it("Should return opened position from positions list for Vault", async () => {
            const position = await lensContract.getPositions(
              usersVaultContract.address,
              [collateralToken],
              [indexToken],
              [isLong]
            );
            const [size] = position;
            expect(size).to.equal(sizeDelta.mul(5));
          });

          describe("When indexToken price rose up (+1000 USD)", function () {
            let currentPriceWbtc: BigNumber;
            let newPriceWbtc: BigNumber;

            before(async () => {
              // local snapshot?

              // get current price
              const usdcPrice = await gmxVault.getMaxPrice(
                usdcTokenContract.address
              );
              currentPriceWbtc = await gmxVault.getMaxPrice(indexToken);
              newPriceWbtc = currentPriceWbtc.add(utils.parseUnits("1000", 30));

              const gmxPriceFeedMockCode = await ethers.provider.getCode(
                gmxVaultPriceFeedMockContract.address
              );
              await setCode(gmx.vaultPriceFeedAddress, gmxPriceFeedMockCode);
              gmxVaultPriceFeedMock = await ethers.getContractAt(
                "GmxVaultPriceFeedMock",
                gmx.vaultPriceFeedAddress
              );

              // increase price
              await gmxVaultPriceFeedMock.setPrice(indexToken, newPriceWbtc);
              // and set price for swap back token
              await gmxVaultPriceFeedMock.setPrice(
                usdcTokenContract.address,
                usdcPrice
              );
            });

            after(async () => {
              // revert local snapshot
            });

            describe("Closing position", function () {
              before(async () => {
                const tokenOut = tokens.usdc;
                const path = [collateralToken, tokenOut];
                const collateralDelta = 0;
                const minOut = 0;

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
                const operationId = 1; // decrease position
                const traderOperation = { operationId, data: tradeData };
                txResult = await traderWalletContract
                  .connect(trader)
                  .executeOnProtocol(protocolId, traderOperation, replicate);
                await txResult.wait();
              });

              it("Should create decrease requests for Wallet", async () => {
                const walletRequest =
                  await lensContract.getLatestDecreaseRequest(
                    traderWalletContract.address
                  );
                expect(walletRequest.sizeDelta).to.equal(sizeDelta);
                expect(walletRequest.indexToken).to.equal(
                  wbtcTokenContract.address
                );
              });

              it("Should create decrease requests for Vault", async () => {
                const vaultRequest =
                  await lensContract.getLatestDecreaseRequest(
                    usersVaultContract.address
                  );
                expect(vaultRequest.sizeDelta).to.equal(sizeDelta.mul(5));
                expect(vaultRequest.indexToken).to.equal(
                  wbtcTokenContract.address
                );
              });

              describe("Execute decreasing position by a keeper", function () {
                let walletDecreaseRequestKey: string;
                let vaultDecreaseRequestKey: string;
                before(async () => {
                  walletDecreaseRequestKey = await lensContract.getRequestKey(
                    traderWalletContract.address,
                    1
                  );
                  vaultDecreaseRequestKey = await lensContract.getRequestKey(
                    usersVaultContract.address,
                    1
                  );

                  await gmxPositionRouter
                    .connect(keeper)
                    .executeDecreasePosition(
                      walletDecreaseRequestKey,
                      gmx.keeper
                    );
                  await gmxPositionRouter
                    .connect(keeper)
                    .executeDecreasePosition(
                      vaultDecreaseRequestKey,
                      gmx.keeper
                    );
                });
                it("Should remove trader's DecreasePositionRequest after executing", async () => {
                  const walletRequest =
                    await lensContract.getLatestDecreaseRequest(
                      traderWalletContract.address
                    );
                  expect(walletRequest.sizeDelta).to.equal(ZERO_AMOUNT);
                  expect(walletRequest.indexToken).to.equal(ZERO_ADDRESS);
                });
                it("Should remove vault's DecreasePositionRequest after executing", async () => {
                  const vaultRequest =
                    await lensContract.getLatestDecreaseRequest(
                      usersVaultContract.address
                    );
                  expect(vaultRequest.sizeDelta).to.equal(ZERO_AMOUNT);
                  expect(vaultRequest.indexToken).to.equal(ZERO_ADDRESS);
                });
                it("Should return nothing for traderWallet position from positions list", async () => {
                  const position = await lensContract.getPositions(
                    traderWalletContract.address,
                    [collateralToken],
                    [indexToken],
                    [isLong]
                  );
                  const [size] = position;
                  expect(size).to.equal(ZERO_AMOUNT);
                });
                it("Should return nothing for Vault position from positions list", async () => {
                  const position = await lensContract.getPositions(
                    usersVaultContract.address,
                    [collateralToken],
                    [indexToken],
                    [isLong]
                  );
                  const [size] = position;
                  expect(size).to.equal(ZERO_AMOUNT);
                });
                it("Should increase Wallet USDC balance", async () => {
                  const walletNewBalance = await usdcTokenContract.balanceOf(
                    usersVaultContract.address
                  );
                  expect(walletNewBalance).to.be.gt(traderInputAmount);
                });
                it("Should increase Vault USDC balance", async () => {
                  const vaultNewBalance = await usdcTokenContract.balanceOf(
                    usersVaultContract.address
                  );
                  expect(vaultNewBalance).to.be.gt(user1InputAmount);
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

                    const shares = await usersVaultContract.previewShares(
                      user1Address
                    );
                    await usersVaultContract.connect(user1).claim();
                    await usersVaultContract
                      .connect(user1)
                      .withdrawRequest(shares);

                    await traderWalletContract.connect(trader).rollover();
                  });

                  it("Should increase current round counter", async () => {
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

                      const claimableAssets =
                        await usersVaultContract.previewAssets(user1Address);
                      await usersVaultContract.connect(user1).claim();
                    });

                    it("Should withdraw all tokens from Vault contract", async () => {
                      expect(
                        await usdcTokenContract.balanceOf(
                          usersVaultContract.address
                        )
                      ).to.approximately(
                        await usersVaultContract.kunjiFeesAssets(),
                        1
                      );
                    });

                    it("Should return profitable user1 balance after trading", async () => {
                      const userBalance = await usdcTokenContract.balanceOf(
                        user1Address
                      );

                      expect(userBalance).to.approximately(
                        user1BalanceBefore.add(
                          vaultBalanceBefore.sub(
                            await usersVaultContract.kunjiFeesAssets()
                          )
                        ),
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
  });
});
