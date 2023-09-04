import { ethers, upgrades } from "hardhat";
import {
  Signer,
  ContractFactory,
  ContractTransaction,
  BigNumber,
} from "ethers";
import {
  SnapshotRestorer,
  takeSnapshot,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  TraderWallet,
  TraderWalletV2,
  GMXAdapter,
  ContractsFactoryMock,
  AdaptersRegistryMock,
  AdapterMock,
  UsersVaultMock,
  ERC20Mock,
  DynamicValuationMock,
  TraderWalletTest__factory,
  TraderWalletTest,
  UniswapAdapterMock,
} from "../../typechain-types";
import {
  TEST_TIMEOUT,
  ZERO_AMOUNT,
  ZERO_ADDRESS,
  AMOUNT_1E18,
} from "./../_helpers/constants";

let snapshot: SnapshotRestorer;

let deployer: Signer;
let vault: Signer;
let trader: Signer;
let nonAuthorized: Signer;
let otherSigner: Signer;
let owner: Signer;

let deployerAddress: string;
let vaultAddress: string;
let underlyingTokenAddress: string;
let traderAddress: string;
let otherAddress: string;
let ownerAddress: string;

let txResult: ContractTransaction;
let ContractsFactoryFactory: ContractFactory;
let contractsFactoryContract: ContractsFactoryMock;
let TraderWalletFactory: TraderWalletTest__factory;
let traderWalletContract: TraderWalletTest;
let AdaptersRegistryFactory: ContractFactory;
let adaptersRegistryContract: AdaptersRegistryMock;
let uniswapAdapterMockContract: UniswapAdapterMock;
let dynamicValuationContract: DynamicValuationMock;
let AdapterFactory: ContractFactory;
let adapterContract: AdapterMock;
let UsersVaultFactory: ContractFactory;
let usersVaultContract: UsersVaultMock;
let GMXAdapterLibraryFactory: ContractFactory;
let gmxAdapterContract: GMXAdapter;

let usdcTokenContract: ERC20Mock;
let contractBalanceBefore: BigNumber;
let contractBalanceAfter: BigNumber;
let traderBalanceBefore: BigNumber;
let traderBalanceAfter: BigNumber;

const increaseRound = async (
  _traderWalletContract: TraderWallet,
  _usersVaultContract: UsersVaultMock
) => {
  // deposit so rollover can be executed
  await _traderWalletContract
    .connect(trader)
    .traderDeposit(AMOUNT_1E18.mul(100));

  // for rollover return ok
  await _usersVaultContract.setReturnValue(true);

  // increase users vault round
  await _usersVaultContract.setRound(1);

  // so the round is increased
  await _traderWalletContract.connect(trader).rollover();
};

describe("Trader Wallet Contract Tests", function () {
  this.timeout(TEST_TIMEOUT);

  before(async () => {
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    usdcTokenContract = (await ERC20MockFactory.deploy(
      "USDC",
      "USDC",
      6
    )) as ERC20Mock;
    await usdcTokenContract.deployed();
    underlyingTokenAddress = usdcTokenContract.address;

    [deployer, vault, trader, nonAuthorized, otherSigner, owner] =
      await ethers.getSigners();

    [deployerAddress, vaultAddress, traderAddress, otherAddress, ownerAddress] =
      await Promise.all([
        deployer.getAddress(),
        vault.getAddress(),
        trader.getAddress(),
        otherSigner.getAddress(),
        owner.getAddress(),
      ]);
  });

  describe("TraderWallet contract Deployment Tests", function () {
    describe("GIVEN a Trader Wallet Factory", function () {
      before(async () => {
        owner = deployer;
        ownerAddress = deployerAddress;

        GMXAdapterLibraryFactory = await ethers.getContractFactory(
          "GMXAdapter"
        );
        gmxAdapterContract =
          (await GMXAdapterLibraryFactory.deploy()) as GMXAdapter;
        await gmxAdapterContract.deployed();

        TraderWalletFactory = await ethers.getContractFactory(
          "TraderWalletTest",
          {
            libraries: {
              GMXAdapter: gmxAdapterContract.address,
            },
          }
        );

        // deploy mocked Vault
        UsersVaultFactory = await ethers.getContractFactory("UsersVaultMock");
        usersVaultContract =
          (await UsersVaultFactory.deploy()) as UsersVaultMock;
        await usersVaultContract.deployed();

        // deploy mocked adaptersRegistry
        AdaptersRegistryFactory = await ethers.getContractFactory(
          "AdaptersRegistryMock"
        );
        adaptersRegistryContract = (await upgrades.deployProxy(
          AdaptersRegistryFactory,
          []
        )) as AdaptersRegistryMock;
        await adaptersRegistryContract.deployed();

        // deploy mocked DynamicValuation
        const DynamicValuationfactory = await ethers.getContractFactory(
          "DynamicValuationMock"
        );
        dynamicValuationContract = (await DynamicValuationfactory.deploy(
          AMOUNT_1E18.mul(1000)
        )) as DynamicValuationMock;
        await dynamicValuationContract.deployed();

        // set mock oracle price 1 to avoid division by zero error
        await dynamicValuationContract.setOraclePrice(1);

        // deploy ContractsFactory
        ContractsFactoryFactory = await ethers.getContractFactory(
          "ContractsFactoryMock"
        );
        contractsFactoryContract = (await upgrades.deployProxy(
          ContractsFactoryFactory,
          []
        )) as ContractsFactoryMock;
        await contractsFactoryContract.deployed();

        // set TRUE for response
        await contractsFactoryContract.setReturnValue(true);
        // set index of the address to return
        await contractsFactoryContract.setIndexToReturn(0);
        // set the dynamic valuation address
        await contractsFactoryContract.setDynamicValuationAddress(
          dynamicValuationContract.address
        );
        await contractsFactoryContract.setAdaptersRegistryAddress(
          adaptersRegistryContract.address
        );

        const UniswapAdapterMockFactory = await ethers.getContractFactory(
          "UniswapAdapterMock"
        );
        uniswapAdapterMockContract = await UniswapAdapterMockFactory.deploy();
      });

      describe("WHEN trying to deploy TraderWallet contract with invalid parameters", function () {
        it("THEN it should FAIL when _underlyingTokenAddress is ZERO", async () => {
          await expect(
            upgrades.deployProxy(
              TraderWalletFactory,
              [ZERO_ADDRESS, traderAddress, ownerAddress],
              {
                initializer: "initialize",
                unsafeAllowLinkedLibraries: true,
              }
            )
          )
            .to.be.revertedWithCustomError(TraderWalletFactory, "ZeroAddress")
            .withArgs("_underlyingTokenAddress");
        });

        it("THEN it should FAIL when _traderAddress is ZERO", async () => {
          await expect(
            upgrades.deployProxy(
              TraderWalletFactory,
              [underlyingTokenAddress, ZERO_ADDRESS, ownerAddress],
              {
                initializer: "initialize",
                unsafeAllowLinkedLibraries: true,
              }
            )
          )
            .to.be.revertedWithCustomError(TraderWalletFactory, "ZeroAddress")
            .withArgs("_traderAddress");
        });

        it("THEN it should FAIL when ownerAddress, is ZERO", async () => {
          await expect(
            upgrades.deployProxy(
              TraderWalletFactory,
              [underlyingTokenAddress, traderAddress, ZERO_ADDRESS],
              {
                initializer: "initialize",
                unsafeAllowLinkedLibraries: true,
              }
            )
          )
            .to.be.revertedWithCustomError(TraderWalletFactory, "ZeroAddress")
            .withArgs("_ownerAddress");
        });
      });

      describe("WHEN trying to deploy TraderWallet contract with correct parameters", function () {
        before(async () => {
          const traderWalletProxy = await upgrades.deployProxy(
            TraderWalletFactory,
            [underlyingTokenAddress, traderAddress, ownerAddress],
            {
              initializer: "initialize",
              unsafeAllowLinkedLibraries: true,
            }
          );
          await traderWalletProxy.deployed();
          traderWalletContract = TraderWalletFactory.attach(
            traderWalletProxy.address
          );

          await traderWalletContract.setContractsFactoryAddress(
            contractsFactoryContract.address
          );

          // set the vault in the trader wallet contract
          await traderWalletContract
            .connect(owner)
            .setVaultAddress(usersVaultContract.address);

          // deploy mocked adapter
          AdapterFactory = await ethers.getContractFactory("AdapterMock");
          adapterContract = (await AdapterFactory.deploy()) as AdapterMock;
          await adapterContract.deployed();

          // mint to trader
          await usdcTokenContract.mint(traderAddress, AMOUNT_1E18.mul(100));
          await usdcTokenContract
            .connect(trader)
            .approve(traderWalletContract.address, AMOUNT_1E18.mul(100));

          contractBalanceBefore = await usdcTokenContract.balanceOf(
            traderWalletContract.address
          );
          traderBalanceBefore = await usdcTokenContract.balanceOf(
            traderAddress
          );

          // take a snapshot
          snapshot = await takeSnapshot();
        });

        it("THEN it should return the same ones after deployment", async () => {
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

          expect(
            await traderWalletContract.cumulativePendingDeposits()
          ).to.equal(ZERO_AMOUNT);
          expect(
            await traderWalletContract.cumulativePendingWithdrawals()
          ).to.equal(ZERO_AMOUNT);
        });

        describe("WHEN trying to set the vaultAddress", async () => {
          describe("WHEN calling twice", function () {
            it("THEN it should fail", async () => {
              await expect(
                traderWalletContract.setVaultAddress(otherAddress)
              ).to.be.revertedWithCustomError(
                traderWalletContract,
                "DoubleSet"
              );
            });
          });
        });

        describe("WHEN trying to set the traderAddress", async () => {
          let FactoryOfContractsFactory: ContractFactory;
          let contractsFactoryContract: ContractsFactoryMock;

          before(async () => {
            // deploy mocked factory
            FactoryOfContractsFactory = await ethers.getContractFactory(
              "ContractsFactoryMock"
            );
            contractsFactoryContract =
              (await FactoryOfContractsFactory.deploy()) as ContractsFactoryMock;
            await contractsFactoryContract.deployed();

            // change address to mocked factory
            await traderWalletContract
              .connect(owner)
              .setContractsFactoryAddress(contractsFactoryContract.address);
          });
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not trader", function () {
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(nonAuthorized)
                    .setTraderAddress(otherAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN trader is not allowed", function () {
              before(async () => {
                // change returnValue to return false on function call
                await contractsFactoryContract.setReturnValue(false);
              });
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(owner)
                    .setTraderAddress(otherAddress)
                ).to.be.revertedWithCustomError(
                  traderWalletContract,
                  "TraderNotAllowed"
                );
              });
            });
          });

          describe("WHEN calling with correct caller and address", function () {
            before(async () => {
              // change returnValue to return true on function call
              await contractsFactoryContract.setReturnValue(true);

              txResult = await traderWalletContract
                .connect(owner)
                .setTraderAddress(otherAddress);
            });
            after(async () => {
              await snapshot.restore();
            });

            it("THEN new address should be stored", async () => {
              expect(await traderWalletContract.traderAddress()).to.equal(
                otherAddress
              );
            });
            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(traderWalletContract, "TraderAddressSet")
                .withArgs(otherAddress);
            });
          });
        });

        describe("WHEN trying to add/remove adapter to be used by trader", async () => {
          after(async () => {
            await snapshot.restore();
          });

          describe("WHEN trying to add an adapter to use (addAdapterToUse)", async () => {
            describe("WHEN calling with invalid caller or parameters", function () {
              describe("WHEN caller is not trader", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(nonAuthorized)
                      .addProtocolToUse(1)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "CallerNotAllowed"
                  );
                });
              });
              describe("WHEN protocol does not exist in registry", function () {
                before(async () => {
                  // change returnValue to adapter registry to fail on function call
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnValue(false);
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnAddress(otherAddress);
                });
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract.connect(trader).addProtocolToUse(2)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "InvalidAdapter"
                  );
                });
              });
            });

            describe("WHEN calling with correct caller and protocol", function () {
              let adapter1Address: string;

              before(async () => {
                // change returnValue to return true on function call
                adapter1Address = otherAddress;
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnValue(true);
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnAddress(adapter1Address);

                // set return value to false so the adapter is not found
                await contractsFactoryContract.setReturnValue(false);
                await contractsFactoryContract.setIndexToReturn(0);

                txResult = await traderWalletContract
                  .connect(trader)
                  .addProtocolToUse(1);
              });

              it("THEN new adapter should be added to the trader array", async () => {
                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(0)
                ).to.equal(1);
              });

              it("THEN it should emit an Event", async () => {
                await expect(txResult)
                  .to.emit(traderWalletContract, "ProtocolToUseAdded")
                  .withArgs(1);
              });

              it("THEN it should be added to the adaptersPerProtocol mapping", async () => {
                expect(
                  await traderWalletContract.getAdapterAddressPerProtocol(1)
                ).to.equal(adapter1Address);
              });

              describe("WHEN adapter already exists in traderArray ", function () {
                before(async () => {
                  // set return value to true so the adapter seems present
                  await contractsFactoryContract.setReturnValue(true);
                  await contractsFactoryContract.setIndexToReturn(0);
                });
                it("THEN adding the same one should fail", async () => {
                  await expect(
                    traderWalletContract.connect(trader).addProtocolToUse(1)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "ProtocolIdPresent"
                  );
                });
              });
            });
          });

          describe("WHEN trying to remove an adapter (removeAdapterToUse)", async () => {
            // otherAddress is already added from previous flow (addAdapterToUse)
            // to add now deployerAddress, contractsFactoryAddress, ownerAddress
            // just to store something and test the function
            let adapter1Address: string;
            let adapter2Address: string;
            let adapter3Address: string;
            let adapter4Address: string;
            let adapter10Address: string;

            before(async () => {
              adapter1Address = otherAddress;
              adapter2Address = deployerAddress;
              adapter3Address = contractsFactoryContract.address;
              adapter4Address = underlyingTokenAddress;
              adapter10Address = vaultAddress;

              // set return value to false so the adapter is not found
              await contractsFactoryContract.setReturnValue(false);
              await contractsFactoryContract.setIndexToReturn(0);

              await adaptersRegistryContract
                .connect(deployer)
                .setReturnValue(true);

              await adaptersRegistryContract
                .connect(deployer)
                .setReturnAddress(adapter2Address);
              await traderWalletContract.connect(trader).addProtocolToUse(2);

              await adaptersRegistryContract
                .connect(deployer)
                .setReturnAddress(adapter3Address);
              await traderWalletContract.connect(trader).addProtocolToUse(3);

              await adaptersRegistryContract
                .connect(deployer)
                .setReturnAddress(adapter4Address);
              await traderWalletContract.connect(trader).addProtocolToUse(4);
            });
            describe("WHEN checking adapters", function () {
              it("THEN it should return correct values", async () => {
                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(0)
                ).to.equal(1);

                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(1)
                ).to.equal(2);

                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(2)
                ).to.equal(3);

                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(3)
                ).to.equal(4);
              });
              it("THEN it should return correct array length", async () => {
                expect(
                  await traderWalletContract.traderSelectedProtocolIdsLength()
                ).to.equal(BigNumber.from(4));
              });
            });

            describe("WHEN calling with invalid caller or parameters", function () {
              describe("WHEN caller is not owner", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(nonAuthorized)
                      .removeProtocolToUse(1)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "CallerNotAllowed"
                  );
                });
              });
              describe("WHEN protocol does not exist in registry", function () {
                before(async () => {
                  // change returnValue to adapter registry to fail on function call
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnValue(false);
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnAddress(otherAddress);
                });
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract.connect(trader).removeProtocolToUse(10)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "ProtocolIdNotPresent"
                  );
                });
              });

              describe("WHEN adapter does not exist in array", function () {
                before(async () => {
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnValue(true);
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnAddress(adapter10Address);
                });
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract.connect(trader).removeProtocolToUse(10)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "ProtocolIdNotPresent"
                  );
                });
              });
            });

            describe("WHEN calling with correct caller and address", function () {
              before(async () => {
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnValue(true);
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnAddress(adapter3Address);

                // set return value to true so the adapter seems present
                await contractsFactoryContract.setReturnValue(true);
                await contractsFactoryContract.setIndexToReturn(2);

                txResult = await traderWalletContract
                  .connect(trader)
                  .removeProtocolToUse(3);
              });

              it("THEN adapter should be removed from array", async () => {
                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(0)
                ).to.equal(1);

                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(1)
                ).to.equal(2);

                expect(
                  await traderWalletContract.traderSelectedProtocolIdsAt(2)
                ).to.equal(4);
              });

              it("THEN it should return correct array length", async () => {
                expect(
                  await traderWalletContract.traderSelectedProtocolIdsLength()
                ).to.equal(BigNumber.from(3));
              });
              it("THEN it should emit an Event", async () => {
                await expect(txResult)
                  .to.emit(traderWalletContract, "ProtocolToUseRemoved")
                  .withArgs(3);
              });
            });
          });
        });

        describe("WHEN trying to add/remove token to be used by trader", async () => {
          let token1Address: string;
          let token2Address: string;
          let token3Address: string;
          let token4Address: string;
          let token5Address: string;

          before(async () => {
            token1Address = otherAddress;
            token2Address = deployerAddress;
            token3Address = contractsFactoryContract.address;
            token4Address = underlyingTokenAddress;
            token5Address = vaultAddress;
          });
          after(async () => {
            await snapshot.restore();
          });

          describe("WHEN trying to add a token to use (addAllowedTradeTokens)", async () => {
            describe("WHEN calling with invalid caller or parameters", function () {
              describe("WHEN caller is not trader", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(nonAuthorized)
                      .addAllowedTradeTokens([token1Address])
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "CallerNotAllowed"
                  );
                });
              });
              describe("WHEN token does not exist in global allowed list", function () {
                before(async () => {
                  // change returnValue to factory so it returns token does not exists
                  await contractsFactoryContract.setReturnValue(false);

                  await adaptersRegistryContract.setReturnValue(true);
                  await adaptersRegistryContract.setReturnAddress(
                    uniswapAdapterMockContract.address
                  );
                });
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(trader)
                      .addAllowedTradeTokens([token1Address])
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "InvalidToken"
                  );
                });
              });
            });

            describe("WHEN calling with correct params", function () {
              before(async () => {
                // change returnValue to factory so it returns token does exists
                await contractsFactoryContract.setReturnValue(true);

                await contractsFactoryContract.setAllowedGlobalToken(
                  [
                    token1Address,
                    token2Address,
                    token3Address,
                    token4Address,
                    token5Address,
                  ],
                  true
                );

                txResult = await traderWalletContract
                  .connect(trader)
                  .addAllowedTradeTokens([
                    token1Address,
                    token2Address,
                    token3Address,
                    token4Address,
                    token5Address,
                  ]);
              });
              after(async () => {
                await snapshot.restore();
              });

              it("THEN new token should be added to the trader array", async () => {
                expect(
                  await traderWalletContract.allowedTradeTokensAt(0)
                ).to.equal(underlyingTokenAddress);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(1)
                ).to.equal(token1Address);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(2)
                ).to.equal(token2Address);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(3)
                ).to.equal(token3Address);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(4)
                ).to.equal(token5Address);
              });

              it("THEN it should emit 5 Events", async () => {
                await expect(txResult)
                  .to.emit(traderWalletContract, "TradeTokenAdded")
                  .withArgs(token1Address);

                await expect(txResult)
                  .to.emit(traderWalletContract, "TradeTokenAdded")
                  .withArgs(token2Address);

                await expect(txResult)
                  .to.emit(traderWalletContract, "TradeTokenAdded")
                  .withArgs(token3Address);

                await expect(txResult)
                  .to.emit(traderWalletContract, "TradeTokenAdded")
                  .withArgs(token4Address);

                await expect(txResult)
                  .to.emit(traderWalletContract, "TradeTokenAdded")
                  .withArgs(token5Address);
              });

              it("THEN it should be added to the mapping", async () => {
                expect(
                  await traderWalletContract.isAllowedTradeToken(token1Address)
                ).to.be.true;
                expect(
                  await traderWalletContract.isAllowedTradeToken(token2Address)
                ).to.be.true;
                expect(
                  await traderWalletContract.isAllowedTradeToken(token3Address)
                ).to.be.true;
                expect(
                  await traderWalletContract.isAllowedTradeToken(token4Address)
                ).to.be.true;
                expect(
                  await traderWalletContract.isAllowedTradeToken(token5Address)
                ).to.be.true;
              });

              it("THEN it should return correct array length", async () => {
                expect(
                  await traderWalletContract.allowedTradeTokensLength()
                ).to.equal(BigNumber.from(5));
              });
            });
          });

          describe("WHEN trying to remove token from the trader allowed list (removeAllowedTradeToken)", async () => {
            let token1Address: string;
            let token2Address: string;
            let token3Address: string;
            let token4Address: string;
            let token5Address: string;

            before(async () => {
              token1Address = otherAddress;
              token2Address = deployerAddress;
              token3Address = contractsFactoryContract.address;
              token4Address = underlyingTokenAddress;
              token5Address = vaultAddress;

              // set return value to false so the token is allowed globally
              await contractsFactoryContract.setReturnValue(true);

              await adaptersRegistryContract.setReturnValue(true);
              await adaptersRegistryContract.setReturnAddress(
                uniswapAdapterMockContract.address
              );

              await contractsFactoryContract.setAllowedGlobalToken(
                [token1Address, token2Address, token3Address, token4Address],
                true
              );

              // add the tokens to the contract
              await traderWalletContract
                .connect(trader)
                .addAllowedTradeTokens([
                  token1Address,
                  token2Address,
                  token3Address,
                  token4Address,
                ]);
            });
            describe("WHEN checking adapters", function () {
              it("THEN it should return correct values", async () => {
                expect(
                  await traderWalletContract.allowedTradeTokensAt(0)
                ).to.equal(underlyingTokenAddress);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(1)
                ).to.equal(token1Address);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(2)
                ).to.equal(token2Address);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(3)
                ).to.equal(token3Address);
              });

              it("THEN it should return correct array length", async () => {
                expect(
                  await traderWalletContract.allowedTradeTokensLength()
                ).to.equal(BigNumber.from(4));
              });

              it("THEN it should be added to the allowed tokens mapping", async () => {
                expect(
                  await traderWalletContract.isAllowedTradeToken(token1Address)
                ).to.be.true;

                expect(
                  await traderWalletContract.isAllowedTradeToken(token2Address)
                ).to.be.true;

                expect(
                  await traderWalletContract.isAllowedTradeToken(token3Address)
                ).to.be.true;

                expect(
                  await traderWalletContract.isAllowedTradeToken(token4Address)
                ).to.be.true;
              });
            });

            describe("WHEN calling with invalid caller or parameters", function () {
              describe("WHEN caller is not owner", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(nonAuthorized)
                      .removeAllowedTradeToken(token1Address)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "CallerNotAllowed"
                  );
                });
              });

              describe("WHEN token does not exist in array", function () {
                before(async () => {
                  // set return value to false so the factory returns token does not present
                  await contractsFactoryContract.setReturnValue(false);
                });
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(trader)
                      .removeAllowedTradeToken(token5Address)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "InvalidToken"
                  );
                });
              });
            });

            describe("WHEN calling with correct caller and address", function () {
              before(async () => {
                // set return value to true so the adapter seems present
                await contractsFactoryContract.setReturnValue(true);
                await contractsFactoryContract.setIndexToReturn(1);

                txResult = await traderWalletContract
                  .connect(trader)
                  .removeAllowedTradeToken(token2Address);
              });

              it("THEN token should be removed from array", async () => {
                expect(
                  await traderWalletContract.allowedTradeTokensAt(0)
                ).to.equal(underlyingTokenAddress);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(1)
                ).to.equal(token1Address);

                expect(
                  await traderWalletContract.allowedTradeTokensAt(2)
                ).to.equal(token3Address);
              });

              it("THEN it should return correct array length", async () => {
                expect(
                  await traderWalletContract.allowedTradeTokensLength()
                ).to.equal(3);
              });

              it("THEN it should emit an Event", async () => {
                await expect(txResult)
                  .to.emit(traderWalletContract, "TradeTokenRemoved")
                  .withArgs(token2Address);
              });
              it("THEN it should be removed from allowedTradeTokens mapping", async () => {
                expect(
                  await traderWalletContract.isAllowedTradeToken(token2Address)
                ).to.be.false;
              });
            });
          });
        });

        describe("WHEN trying to make a traderDeposit", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not trader", function () {
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(nonAuthorized)
                    .traderDeposit(AMOUNT_1E18)
                ).to.be.revertedWithCustomError(
                  traderWalletContract,
                  "CallerNotAllowed"
                );
              });
            });

            describe("WHEN trader does not have the amount", function () {
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(trader)
                    .traderDeposit(AMOUNT_1E18.mul(100000))
                ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
              });
            });

            describe("WHEN amount is ZERO", function () {
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(trader)
                    .traderDeposit(ZERO_AMOUNT)
                ).to.be.revertedWithCustomError(
                  traderWalletContract,
                  "ZeroAmount"
                );
              });
            });

            describe("WHEN transferFrom fails", function () {
              before(async () => {
                await usdcTokenContract.setReturnBoolValue(false);
              });
              after(async () => {
                await snapshot.restore();
              });
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(trader)
                    .traderDeposit(AMOUNT_1E18)
                ).to.be.revertedWith(
                  "SafeERC20: ERC20 operation did not succeed"
                );
              });
            });
          });

          describe("WHEN calling with correct caller and amount", function () {
            const AMOUNT = AMOUNT_1E18.mul(100).div(2);

            before(async () => {
              txResult = await traderWalletContract
                .connect(trader)
                .traderDeposit(AMOUNT);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN contract should return correct vaules", async () => {
              expect(
                await traderWalletContract.cumulativePendingDeposits()
              ).to.equal(AMOUNT);
              expect(
                await traderWalletContract.cumulativePendingDeposits()
              ).to.equal(AMOUNT);
            });
            it("THEN it should emit an Event", async () => {
              const currentRound = await traderWalletContract.currentRound();
              await expect(txResult)
                .to.emit(traderWalletContract, "TraderDeposit")
                .withArgs(traderAddress, AMOUNT, currentRound);
            });
            it("THEN contract balance should increase", async () => {
              contractBalanceAfter = await usdcTokenContract.balanceOf(
                traderWalletContract.address
              );
              expect(contractBalanceAfter).to.equal(
                contractBalanceBefore.add(AMOUNT)
              );
            });
            it("THEN trader balance should decrease", async () => {
              traderBalanceAfter = await usdcTokenContract.balanceOf(
                traderAddress
              );
              expect(traderBalanceAfter).to.equal(
                traderBalanceBefore.sub(AMOUNT)
              );
            });

            describe("WHEN calling again with correct caller and amount", function () {
              before(async () => {
                txResult = await traderWalletContract
                  .connect(trader)
                  .traderDeposit(AMOUNT);
              });

              it("THEN contract should return correct vaules", async () => {
                expect(
                  await traderWalletContract.cumulativePendingDeposits()
                ).to.equal(AMOUNT_1E18.mul(100));
                expect(
                  await traderWalletContract.cumulativePendingDeposits()
                ).to.equal(AMOUNT_1E18.mul(100));
              });
              it("THEN it should emit an Event", async () => {
                const currentRound = await traderWalletContract.currentRound();
                await expect(txResult)
                  .to.emit(traderWalletContract, "TraderDeposit")
                  .withArgs(traderAddress, AMOUNT, currentRound);
              });
              it("THEN contract balance should increase", async () => {
                contractBalanceAfter = await usdcTokenContract.balanceOf(
                  traderWalletContract.address
                );
                expect(contractBalanceAfter).to.equal(
                  contractBalanceBefore.add(AMOUNT_1E18.mul(100))
                );
              });
              it("THEN trader balance should decrease", async () => {
                traderBalanceAfter = await usdcTokenContract.balanceOf(
                  traderAddress
                );
                expect(traderBalanceAfter).to.equal(
                  traderBalanceBefore.sub(AMOUNT_1E18.mul(100))
                );
              });
            });
          });
        });

        describe("WHEN trying to make a withdrawRequest", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            after(async () => {
              await snapshot.restore();
            });
            describe("WHEN round is ZERO", function () {
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(trader)
                    .withdrawRequest(AMOUNT_1E18.mul(100))
                ).to.be.revertedWithCustomError(
                  traderWalletContract,
                  "InvalidRound"
                );
              });
            });
            describe("WHEN round is not ZERO", function () {
              before(async () => {
                await increaseRound(traderWalletContract, usersVaultContract);
              });
              describe("WHEN caller is not trader", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(nonAuthorized)
                      .withdrawRequest(AMOUNT_1E18.mul(100))
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "CallerNotAllowed"
                  );
                });
              });
              describe("WHEN amount is ZERO", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(trader)
                      .withdrawRequest(ZERO_AMOUNT)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "ZeroAmount"
                  );
                });
              });
            });
          });

          describe("WHEN calling with correct caller and amount", function () {
            const AMOUNT = AMOUNT_1E18.mul(100).div(2);

            before(async () => {
              await increaseRound(traderWalletContract, usersVaultContract);

              txResult = await traderWalletContract
                .connect(trader)
                .withdrawRequest(AMOUNT);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN contract should return correct vaules", async () => {
              expect(
                await traderWalletContract.cumulativePendingWithdrawals()
              ).to.equal(AMOUNT);
              expect(
                await traderWalletContract.cumulativePendingWithdrawals()
              ).to.equal(AMOUNT);
            });
            it("THEN it should emit an Event", async () => {
              const currentRound = await traderWalletContract.currentRound();
              await expect(txResult)
                .to.emit(traderWalletContract, "WithdrawRequest")
                .withArgs(traderAddress, AMOUNT, currentRound);
            });

            describe("WHEN calling again with correct caller and amount", function () {
              before(async () => {
                txResult = await traderWalletContract
                  .connect(trader)
                  .withdrawRequest(AMOUNT);
              });

              it("THEN contract should return correct vaules", async () => {
                expect(
                  await traderWalletContract.cumulativePendingWithdrawals()
                ).to.equal(AMOUNT_1E18.mul(100));
                expect(
                  await traderWalletContract.cumulativePendingWithdrawals()
                ).to.equal(AMOUNT_1E18.mul(100));
              });
              it("THEN it should emit an Event", async () => {
                const currentRound = await traderWalletContract.currentRound();
                await expect(txResult)
                  .to.emit(traderWalletContract, "WithdrawRequest")
                  .withArgs(traderAddress, AMOUNT, currentRound);
              });
            });
          });
        });

        describe("WHEN trying to make an executeOnProtocol call", async () => {
          const traderOperation = {
            operationId: 10,
            data: ethers.utils.hexlify("0x1234"),
          };

          describe("WHEN calling with invalid caller or parameters", function () {
            after(async () => {
              await snapshot.restore();
            });

            describe("WHEN caller is not trader", function () {
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(nonAuthorized)
                    .executeOnProtocol(1, traderOperation, false)
                ).to.be.revertedWithCustomError(
                  traderWalletContract,
                  "CallerNotAllowed"
                );
              });
            });

            describe("WHEN round is ZERO", function () {
              it("THEN it should fail", async () => {
                await expect(
                  traderWalletContract
                    .connect(trader)
                    .executeOnProtocol(1, traderOperation, false)
                ).to.be.revertedWithCustomError(
                  traderWalletContract,
                  "InvalidRound"
                );
              });
            });

            describe("WHEN round is not ZERO", function () {
              before(async () => {
                await increaseRound(traderWalletContract, usersVaultContract);
              });
              describe("WHEN Adapter does not exist in registry", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(trader)
                      .executeOnProtocol(11, traderOperation, false)
                  ).to.be.revertedWithCustomError(
                    traderWalletContract,
                    "InvalidProtocol"
                  );
                });
              });

              describe("WHEN Adapter exists but execution fails", function () {
                before(async () => {
                  // change returnValue to return true on function call
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnValue(true);
                  await adaptersRegistryContract
                    .connect(deployer)
                    .setReturnAddress(adapterContract.address);

                  // add the adapter into the array and mapping
                  // so the call to the executeOnProtocol returns the adapter address
                  // set return value to false so the adapter is not found
                  await contractsFactoryContract.setReturnValue(false);
                  await contractsFactoryContract.setIndexToReturn(0);
                  await traderWalletContract
                    .connect(trader)
                    .addProtocolToUse(2);

                  // change returnValue to return true on function call on allowed operation
                  await adapterContract.setExecuteOperationReturn(false, 1);
                });
                it("THEN it should fail", async () => {
                  await expect(
                    traderWalletContract
                      .connect(trader)
                      .executeOnProtocol(2, traderOperation, false)
                  )
                    .to.be.revertedWithCustomError(
                      traderWalletContract,
                      "AdapterOperationFailed"
                    )
                    .withArgs(adapterContract.address);
                });
              });
            });
          });

          describe("WHEN calling with correct parameters", function () {
            describe("WHEN executed correctly no replication needed", function () {
              before(async () => {
                // increase round so not be zero
                await increaseRound(traderWalletContract, usersVaultContract);

                // change returnValue to return true on function call
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnValue(true);
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnAddress(adapterContract.address);

                // add the adapter into the array and mapping
                // so the call to the executeOnProtocol returns the adapter address
                // set return value to false so the adapter is not found
                await contractsFactoryContract.setReturnValue(false);
                await contractsFactoryContract.setIndexToReturn(0);
                await traderWalletContract.connect(trader).addProtocolToUse(2);

                // change returnValue to return true on function call on allowed operation
                await adapterContract.setExecuteOperationReturn(true, 1);

                txResult = await traderWalletContract
                  .connect(trader)
                  .executeOnProtocol(2, traderOperation, false);
              });
              after(async () => {
                await snapshot.restore();
              });
              it("THEN it should emit an Event", async () => {
                // await expect(txResult)
                //   .to.emit(traderWalletContract, "OperationExecuted")
                //   .withArgs(
                //     adapterContract.address,
                //     { _timestamp: undefined } as any,
                //     "trader wallet",
                //     false,
                //     { _initialBalance: undefined } as any,
                //     BigNumber.from("1000000000000000000")
                //   );
                await expect(txResult).to.emit(
                  traderWalletContract,
                  "OperationExecuted"
                );
              });
            });

            describe("WHEN replication is issued", function () {
              before(async () => {
                // increase round so not be zero
                await increaseRound(traderWalletContract, usersVaultContract);

                // change returnValue to return true on function call
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnValue(true);
                await adaptersRegistryContract
                  .connect(deployer)
                  .setReturnAddress(adapterContract.address);

                // add the adapter into the array and mapping
                // so the call to the executeOnProtocol returns the adapter address
                // set return value to false so the adapter is not found
                await contractsFactoryContract.setReturnValue(false);
                await contractsFactoryContract.setIndexToReturn(0);
                await traderWalletContract.connect(trader).addProtocolToUse(2);
              });
              after(async () => {
                await snapshot.restore();
              });

              describe("WHEN executed on wallet ok and also in users vault", function () {
                before(async () => {
                  // change returnValue to return true on function call on allowed operation
                  await adapterContract.setExecuteOperationReturn(true, 1);

                  // change returnValue to return true on function call on result of execute on vault
                  await usersVaultContract.setExecuteOnProtocol(true);

                  txResult = await traderWalletContract
                    .connect(trader)
                    .executeOnProtocol(2, traderOperation, true);
                });
                it("THEN it should emit an Event", async () => {
                  await expect(txResult).to.emit(
                    traderWalletContract,
                    "OperationExecuted"
                  );
                });
              });
            });
          });
        });

        describe("WHEN trying to make a rollover", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            before(async () => {
              await increaseRound(traderWalletContract, usersVaultContract);
            });
            after(async () => {
              await snapshot.restore();
            });

            describe("WHEN no cumulatives pending", async () => {
              it("THEN it should fail", async () => {
                await time.increase(60 * 60 * 3);
                await expect(
                  traderWalletContract.connect(trader).rollover()
                ).to.be.revertedWithCustomError(
                  traderWalletContract,
                  "InvalidRollover"
                );
              });
            });

            describe("WHEN external contract operations fail", async () => {
              before(async () => {
                // mint to trader
                await usdcTokenContract.mint(
                  traderAddress,
                  AMOUNT_1E18.mul(100).mul(4)
                );
                await usdcTokenContract
                  .connect(trader)
                  .approve(
                    traderWalletContract.address,
                    AMOUNT_1E18.mul(100).mul(4)
                  );

                // mint to vault
                await usdcTokenContract.mint(
                  usersVaultContract.address,
                  AMOUNT_1E18.mul(100).mul(10).mul(8)
                );

                await traderWalletContract
                  .connect(trader)
                  .traderDeposit(AMOUNT_1E18.mul(100).mul(4));
              });

              describe("WHEN transfer to trader fails after users vault rollover", async () => {
                before(async () => {
                  // for rollover return ok
                  await usersVaultContract.setReturnValue(true);

                  // request withdraw so the transfer can take place
                  await traderWalletContract
                    .connect(trader)
                    .withdrawRequest(AMOUNT_1E18.mul(100).mul(5));

                  // for transfer return error
                  await usdcTokenContract.setReturnBoolValue(false);
                });
                after(async () => {
                  await snapshot.restore();
                });
                it("THEN rollover should fail", async () => {
                  await expect(
                    traderWalletContract.connect(trader).rollover()
                  ).to.be.revertedWith(
                    "SafeERC20: ERC20 operation did not succeed"
                  );
                });
              });
            });
          });

          describe("WHEN calling with correct parameters on round ZERO", function () {
            before(async () => {
              // mint to trader 400
              await usdcTokenContract.mint(
                traderAddress,
                AMOUNT_1E18.mul(100).mul(4)
              );
              await usdcTokenContract
                .connect(trader)
                .approve(
                  traderWalletContract.address,
                  AMOUNT_1E18.mul(100).mul(4)
                );

              // mint to vault 8000
              await usdcTokenContract.mint(
                usersVaultContract.address,
                AMOUNT_1E18.mul(100).mul(10).mul(8)
              );

              await traderWalletContract
                .connect(trader)
                .traderDeposit(AMOUNT_1E18.mul(100).mul(4));
            });

            it("THEN before rollover all round balance variables should be ZERO", async () => {
              expect(await usersVaultContract.afterRoundBalance()).to.equal(
                ZERO_AMOUNT
              );
              expect(await traderWalletContract.afterRoundBalance()).to.equal(
                ZERO_AMOUNT
              );
            });

            describe("WHEN rollover on users vault succeed", function () {
              before(async () => {
                // for rollover return ok
                await usersVaultContract.setReturnValue(true);
                // increase users vault round
                await usersVaultContract.setRound(1);
                // set valuation for wallet
                await dynamicValuationContract.setValuation(
                  AMOUNT_1E18.mul(400)
                );
                await dynamicValuationContract.setOraclePrice(
                  AMOUNT_1E18.mul(400)
                );
                // set valuation for vault
                await usersVaultContract.setVaultValues(
                  AMOUNT_1E18.mul(8000),
                  AMOUNT_1E18.mul(8000)
                );

                txResult = await traderWalletContract
                  .connect(trader)
                  .rollover();
              });

              it("THEN after rollover afterRoundBalance should be plain underlying balances", async () => {
                expect(await traderWalletContract.afterRoundBalance()).to.equal(
                  AMOUNT_1E18.mul(100).mul(4)
                );
              });
              it("THEN it should emit an Event", async () => {
                await expect(txResult).to.emit(
                  traderWalletContract,
                  "TraderWalletRolloverExecuted"
                );
                // .withArgs(BLOCK TIME STAMP, 0);
              });
              it("THEN currentRound should be increased", async () => {
                expect(await traderWalletContract.currentRound()).to.equal(1);
              });
              it("THEN cumulativePendingDeposits/traderProfit/vaultProfit should be ZERO", async () => {
                expect(
                  await traderWalletContract.cumulativePendingDeposits()
                ).to.equal(ZERO_AMOUNT);
              });
              // it("THEN ratio should be the expected one", async () => {
              //   const expectedRatio = AMOUNT_1E18.mul(8000)
              //     .mul(AMOUNT_1E18)
              //     .div(AMOUNT_1E18.mul(400));
              //   expect(await traderWalletContract.ratioProportions()).to.equal(
              //     expectedRatio
              //   );
              // });
            });
          });
        });

        /// UPGRADABILITY TESTS
        /// UPGRADABILITY TESTS
        /// UPGRADABILITY TESTS
        /// UPGRADABILITY TESTS
        describe("WHEN trying to UPGRADE the contract", async () => {
          let TraderWalletV2Factory: ContractFactory;
          let traderWalletV2Contract: TraderWalletV2;
          before(async () => {
            TraderWalletV2Factory = await ethers.getContractFactory(
              "TraderWalletV2",
              {
                libraries: {
                  GMXAdapter: gmxAdapterContract.address,
                },
              }
            );
            traderWalletV2Contract = (await upgrades.upgradeProxy(
              traderWalletContract.address,
              TraderWalletV2Factory,
              { unsafeAllowLinkedLibraries: true }
            )) as TraderWalletV2;
            await traderWalletV2Contract.deployed();
          });
          it("THEN it should maintain previous storage", async () => {
            expect(await traderWalletV2Contract.vaultAddress()).to.equal(
              usersVaultContract.address
            );
            expect(
              await traderWalletV2Contract.underlyingTokenAddress()
            ).to.equal(underlyingTokenAddress);
            expect(
              await traderWalletV2Contract.contractsFactoryAddress()
            ).to.equal(contractsFactoryContract.address);
            expect(await traderWalletV2Contract.traderAddress()).to.equal(
              traderAddress
            );
            expect(await traderWalletV2Contract.owner()).to.equal(ownerAddress);
          });

          it("THEN it should contains the new function to set the added variable", async () => {
            await traderWalletV2Contract.addedMethod(AMOUNT_1E18.mul(100));

            expect(await traderWalletV2Contract.addedVariable()).to.equal(
              AMOUNT_1E18.mul(100)
            );
          });
        });
      });
    });
  });
});
