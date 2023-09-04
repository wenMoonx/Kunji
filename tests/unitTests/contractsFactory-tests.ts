import { ethers, upgrades } from "hardhat";
import {
  ContractFactory,
  ContractReceipt,
  ContractTransaction,
  BigNumber,
} from "ethers";
import {
  SnapshotRestorer,
  takeSnapshot,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  AdaptersRegistryMock,
  ContractsFactory,
  TraderWallet,
  UsersVault__factory,
  UsersVault,
  ERC20Mock,
  GMXAdapter,
  TraderWallet__factory,
  TraderWalletV2,
  UsersVaultV2,
} from "../../typechain-types";
import {
  TEST_TIMEOUT,
  ZERO_AMOUNT,
  ZERO_ADDRESS,
  AMOUNT_1E18,
} from "./../_helpers/constants";
import { decodeEvent } from "./../_helpers/functions";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

let snapshot: SnapshotRestorer;

let deployer: SignerWithAddress;
let trader: SignerWithAddress;
let nonAuthorized: SignerWithAddress;
let otherSigner: SignerWithAddress;
let owner: SignerWithAddress;
let feeReceiver: SignerWithAddress;

let deployerAddress: string;
let underlyingTokenAddress: string;
let traderAddress: string;
let traderWalletAddress: string;
let usersVaultAddress: string;
let otherAddress: string;
let ownerAddress: string;

let txResult: ContractTransaction;
let txReceipt: ContractReceipt;

let GMXAdapterLibraryFactory: ContractFactory;
let gmxAdapterContract: GMXAdapter;
let traderWalletFactory: TraderWallet__factory;
let traderWalletImplementation: TraderWallet;
let traderWalletImplementationV2: TraderWalletV2;
let usersVaultFactory: UsersVault__factory;
let usersVaultImplementation: UsersVault;
let usersVaultImplementationV2: UsersVaultV2;
let ContractsFactoryFactory: ContractFactory;
let contractsFactoryContract: ContractsFactory;
let traderWalletContract: TraderWallet;
let usersVaultContract: UsersVault;
let usdcTokenContract: ERC20Mock;
let adaptersRegistryContract: AdaptersRegistryMock;

const FEE_RATE: BigNumber = BigNumber.from("30000000000000000"); //

describe("ContractsFactory Tests", function () {
  this.timeout(TEST_TIMEOUT);

  before(async () => {
    [deployer, trader, nonAuthorized, otherSigner, owner, feeReceiver] =
      await ethers.getSigners();
    [deployerAddress, traderAddress, otherAddress, ownerAddress] =
      await Promise.all([
        deployer.getAddress(),
        trader.getAddress(),
        otherSigner.getAddress(),
        owner.getAddress(),
      ]);

    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    usdcTokenContract = (await ERC20MockFactory.deploy(
      "USDC",
      "USDC",
      6
    )) as ERC20Mock;
    await usdcTokenContract.deployed();
    underlyingTokenAddress = usdcTokenContract.address;

    const AdapterRegistryFactory = await ethers.getContractFactory(
      "AdaptersRegistryMock"
    );
    adaptersRegistryContract = (await upgrades.deployProxy(
      AdapterRegistryFactory,
      []
    )) as AdaptersRegistryMock;
    await adaptersRegistryContract.deployed();

    // deploy library
    GMXAdapterLibraryFactory = await ethers.getContractFactory("GMXAdapter");
    gmxAdapterContract =
      (await GMXAdapterLibraryFactory.deploy()) as GMXAdapter;
    await gmxAdapterContract.deployed();

    ContractsFactoryFactory = await ethers.getContractFactory(
      "ContractsFactory"
    );

    traderWalletFactory = await ethers.getContractFactory("TraderWallet", {
      libraries: {
        GMXAdapter: gmxAdapterContract.address,
      },
    });
    traderWalletImplementation = await traderWalletFactory.deploy();

    const traderWalletV2Factory = await ethers.getContractFactory(
      "TraderWalletV2",
      {
        libraries: {
          GMXAdapter: gmxAdapterContract.address,
        },
      }
    );
    traderWalletImplementationV2 = await traderWalletV2Factory.deploy();

    usersVaultFactory = await ethers.getContractFactory("UsersVault", {
      libraries: {
        GMXAdapter: gmxAdapterContract.address,
      },
    });
    usersVaultImplementation = await usersVaultFactory.deploy();

    const usersVaultV2Factory = await ethers.getContractFactory(
      "UsersVaultV2",
      {
        libraries: {
          GMXAdapter: gmxAdapterContract.address,
        },
      }
    );
    usersVaultImplementationV2 = await usersVaultV2Factory.deploy();
  });

  describe("Contracts Factory tests: ", function () {
    describe("Given a scenario to create Trader Wallet and Users Vault", function () {
      before(async () => {
        owner = deployer;
        ownerAddress = deployerAddress;
      });

      describe("WHEN trying to deploy ContractsFactory contract with invalid parameters", function () {
        it("THEN it should FAIL when feeRate is greater than 100% (1e18)", async () => {
          await expect(
            upgrades.deployProxy(ContractsFactoryFactory, [
              AMOUNT_1E18.mul(100).add(1),
              feeReceiver.address,
              traderWalletImplementation.address,
              usersVaultImplementation.address,
            ])
          ).to.be.revertedWithCustomError(
            ContractsFactoryFactory,
            "FeeRateError"
          );
        });
      });

      describe("WHEN trying to deploy ContractsFactory contract with correct parameters", function () {
        before(async () => {
          contractsFactoryContract = (await upgrades.deployProxy(
            ContractsFactoryFactory,
            [
              FEE_RATE,
              feeReceiver.address,
              traderWalletImplementation.address,
              usersVaultImplementation.address,
            ],
            { initializer: "initialize", verifySourceCode: true }
          )) as ContractsFactory;
          await contractsFactoryContract.deployed();

          await contractsFactoryContract.addGlobalAllowedTokens([
            usdcTokenContract.address,
          ]);

          // take a snapshot
          snapshot = await takeSnapshot();
        });

        describe("WHEN trying to set the adaptersRegistryAddress", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(nonAuthorized)
                    .setAdaptersRegistryAddress(otherAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN address is invalid", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .setAdaptersRegistryAddress(ZERO_ADDRESS)
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_adaptersRegistryAddress");
              });
            });
          });

          describe("WHEN calling with correct caller and address", function () {
            before(async () => {
              txResult = await contractsFactoryContract
                .connect(owner)
                .setAdaptersRegistryAddress(otherAddress);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN new address should be stored", async () => {
              expect(
                await contractsFactoryContract.adaptersRegistryAddress()
              ).to.equal(otherAddress);
            });
            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "AdaptersRegistryAddressSet")
                .withArgs(otherAddress);
            });
          });
        });

        describe("WHEN trying to set the feeRate", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(nonAuthorized)
                    .setFeeRate(FEE_RATE)
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN value is invalid", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .setFeeRate(AMOUNT_1E18.mul(100).add(1))
                ).to.be.revertedWithCustomError(
                  ContractsFactoryFactory,
                  "FeeRateError"
                );
              });
            });
          });

          describe("WHEN calling with correct caller and parameter", function () {
            const NEW_FEE_RATE = AMOUNT_1E18.mul(20).div(100);
            before(async () => {
              txResult = await contractsFactoryContract
                .connect(owner)
                .setFeeRate(NEW_FEE_RATE);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN new feeRate should be stored", async () => {
              expect(await contractsFactoryContract.feeRate()).to.equal(
                NEW_FEE_RATE
              );
            });
            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "FeeRateSet")
                .withArgs(NEW_FEE_RATE);
            });
          });
        });

        describe("WHEN trying to add an investor", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(nonAuthorized)
                    .addInvestor(otherAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN address is invalid", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .addInvestor(ZERO_ADDRESS)
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_investorAddress");
              });
            });
          });
          describe("WHEN calling with correct caller and parameter", function () {
            before(async () => {
              txResult = await contractsFactoryContract
                .connect(owner)
                .addInvestor(otherAddress);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN allowedInvestors should contain new investor", async () => {
              expect(
                await contractsFactoryContract.allowedInvestors(otherAddress)
              ).to.be.true;
            });
            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "InvestorAdded")
                .withArgs(otherAddress);
            });
          });
        });

        describe("WHEN trying to remove an investor", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(nonAuthorized)
                    .removeInvestor(otherAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN address is invalid", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .removeInvestor(ZERO_ADDRESS)
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_investorAddress");
              });
            });
            describe("WHEN investor is not present", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .removeInvestor(otherAddress)
                ).to.be.revertedWithCustomError(
                  contractsFactoryContract,
                  "InvestorNotExists"
                );
              });
            });
          });
          describe("WHEN calling with correct caller and parameter", function () {
            before(async () => {
              // add an investor to delete it afterwards
              await contractsFactoryContract
                .connect(owner)
                .addInvestor(otherAddress);

              txResult = await contractsFactoryContract
                .connect(owner)
                .removeInvestor(otherAddress);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN allowedInvestors should NOT contain removed investor", async () => {
              expect(
                await contractsFactoryContract.allowedInvestors(otherAddress)
              ).to.be.false;
            });
            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "InvestorRemoved")
                .withArgs(otherAddress);
            });
          });
        });

        describe("WHEN trying to add a trader", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(nonAuthorized)
                    .addTrader(otherAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN address is invalid", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .addTrader(ZERO_ADDRESS)
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_traderAddress");
              });
            });
          });
          describe("WHEN calling with correct caller and parameter", function () {
            before(async () => {
              txResult = await contractsFactoryContract
                .connect(owner)
                .addTrader(otherAddress);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN allowedTraders should contain new investor", async () => {
              expect(
                await contractsFactoryContract.allowedTraders(otherAddress)
              ).to.be.true;
            });
            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "TraderAdded")
                .withArgs(otherAddress);
            });
          });
        });

        describe("WHEN trying to remove a trader", async () => {
          describe("WHEN calling with invalid caller or parameters", function () {
            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(nonAuthorized)
                    .removeTrader(otherAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN address is invalid", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .removeTrader(ZERO_ADDRESS)
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_traderAddress");
              });
            });
            describe("WHEN trader is not present", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .removeTrader(otherAddress)
                ).to.be.revertedWithCustomError(
                  contractsFactoryContract,
                  "TraderNotExists"
                );
              });
            });
          });
          describe("WHEN calling with correct caller and parameter", function () {
            before(async () => {
              // add a trader to delete it afterwards
              await contractsFactoryContract
                .connect(owner)
                .addTrader(otherAddress);

              txResult = await contractsFactoryContract
                .connect(owner)
                .removeTrader(otherAddress);
            });
            after(async () => {
              await snapshot.restore();
            });
            it("THEN allowedTraders should NOT contain removed trader", async () => {
              expect(
                await contractsFactoryContract.allowedTraders(otherAddress)
              ).to.be.false;
            });
            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "TraderRemoved")
                .withArgs(otherAddress);
            });
          });
        });

        describe("WHEN trying to add/remove token to be used in plataform", async () => {
          let token1Address: string;
          let token2Address: string;
          let token3Address: string;
          let token4Address: string;

          before(async () => {
            token1Address = otherAddress;
            token2Address = deployerAddress;
            token3Address = contractsFactoryContract.address;
            token4Address = underlyingTokenAddress;
          });
          after(async () => {
            await snapshot.restore();
          });

          describe("WHEN trying to add a token to use (addGlobalAllowedTokens)", async () => {
            describe("WHEN calling with invalid caller or parameters", function () {
              describe("WHEN caller is not owner", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    contractsFactoryContract
                      .connect(nonAuthorized)
                      .addGlobalAllowedTokens([token1Address])
                  ).to.be.revertedWith("Ownable: caller is not the owner");
                });
              });
              describe("WHEN token is ZERO address", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    contractsFactoryContract
                      .connect(owner)
                      .addGlobalAllowedTokens([token1Address, ZERO_ADDRESS])
                  )
                    .to.be.revertedWithCustomError(
                      contractsFactoryContract,
                      "ZeroAddress"
                    )
                    .withArgs("_tokens");
                });
              });
            });

            describe("WHEN calling with correct params", function () {
              before(async () => {
                txResult = await contractsFactoryContract
                  .connect(owner)
                  .addGlobalAllowedTokens([
                    token1Address,
                    token2Address,
                    token3Address,
                    token4Address,
                  ]);
              });
              after(async () => {
                await snapshot.restore();
              });

              it("THEN new token should be added to the trader array", async () => {
                expect(
                  await contractsFactoryContract.allowedGlobalTokensAt(0)
                ).to.equal(usdcTokenContract.address);

                expect(
                  await contractsFactoryContract.allowedGlobalTokensAt(1)
                ).to.equal(token1Address);

                expect(
                  await contractsFactoryContract.allowedGlobalTokensAt(2)
                ).to.equal(token2Address);

                expect(
                  await contractsFactoryContract.allowedGlobalTokensAt(3)
                ).to.equal(token3Address);
              });

              it("THEN it should emit 4 Events", async () => {
                await expect(txResult)
                  .to.emit(contractsFactoryContract, "GlobalTokenAdded")
                  .withArgs(token1Address);

                await expect(txResult)
                  .to.emit(contractsFactoryContract, "GlobalTokenAdded")
                  .withArgs(token2Address);

                await expect(txResult)
                  .to.emit(contractsFactoryContract, "GlobalTokenAdded")
                  .withArgs(token3Address);

                await expect(txResult)
                  .to.emit(contractsFactoryContract, "GlobalTokenAdded")
                  .withArgs(token4Address);
              });

              it("THEN it should be added to the mapping", async () => {
                expect(
                  await contractsFactoryContract.isAllowedGlobalToken(
                    token1Address
                  )
                ).to.be.true;
                expect(
                  await contractsFactoryContract.isAllowedGlobalToken(
                    token2Address
                  )
                ).to.be.true;
                expect(
                  await contractsFactoryContract.isAllowedGlobalToken(
                    token3Address
                  )
                ).to.be.true;
                expect(
                  await contractsFactoryContract.isAllowedGlobalToken(
                    token4Address
                  )
                ).to.be.true;
              });

              it("THEN it should return correct array length", async () => {
                const globalAllowedTokens =
                  await contractsFactoryContract.getAllowedGlobalTokens();
                expect(globalAllowedTokens.length).to.equal(BigNumber.from(4));
              });
            });
          });

          describe("WHEN trying to remove token from the global allowed list (removeGlobalToken)", async () => {
            let token1Address: string;
            let token2Address: string;
            let token3Address: string;
            let token4Address: string;

            before(async () => {
              token1Address = otherAddress;
              token2Address = deployerAddress;
              token3Address = contractsFactoryContract.address;
              token4Address = underlyingTokenAddress;

              txResult = await contractsFactoryContract
                .connect(owner)
                .addGlobalAllowedTokens([token1Address, token2Address]);
            });

            describe("WHEN calling with invalid caller or parameters", function () {
              describe("WHEN caller is not owner", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    contractsFactoryContract
                      .connect(nonAuthorized)
                      .removeGlobalToken(token1Address)
                  ).to.be.revertedWith("Ownable: caller is not the owner");
                });
              });

              describe("WHEN token does not exist in array", function () {
                it("THEN it should fail", async () => {
                  await expect(
                    contractsFactoryContract
                      .connect(owner)
                      .removeGlobalToken(token3Address)
                  ).to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "InvalidToken"
                  );
                });
              });
            });

            describe("WHEN calling with correct caller and address", function () {
              before(async () => {
                txResult = await contractsFactoryContract
                  .connect(owner)
                  .removeGlobalToken(token2Address);
              });

              it("THEN token should be removed from array", async () => {
                expect(
                  await contractsFactoryContract.allowedGlobalTokensAt(0)
                ).to.equal(underlyingTokenAddress);

                expect(
                  await contractsFactoryContract.allowedGlobalTokensAt(1)
                ).to.equal(token1Address);
              });

              it("THEN it should return correct array length", async () => {
                const globalAllowedTokens =
                  await contractsFactoryContract.getAllowedGlobalTokens();
                expect(globalAllowedTokens.length).to.equal(BigNumber.from(2));
              });

              it("THEN it should emit an Event", async () => {
                await expect(txResult)
                  .to.emit(contractsFactoryContract, "GlobalTokenRemoved")
                  .withArgs(token2Address);
              });
              it("THEN it should be removed from allowedGlobalTokensArray mapping", async () => {
                expect(
                  await contractsFactoryContract.isAllowedGlobalToken(
                    token2Address
                  )
                ).to.be.false;
              });
            });
          });
        });

        describe("WHEN trying to create a trader wallet", async () => {
          describe("WHEN calling with incorrect caller and parameter", function () {
            before(async () => {
              // set adapters registry on factory to deploy wallet and vault
              await contractsFactoryContract.setAdaptersRegistryAddress(
                adaptersRegistryContract.address
              );

              await contractsFactoryContract.addTrader(traderAddress);

              txResult = await contractsFactoryContract
                .connect(deployer)
                .deployTraderWallet(
                  usdcTokenContract.address,
                  traderAddress,
                  ownerAddress
                );
            });
            after(async () => {
              await snapshot.restore();
            });

            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(otherSigner)
                    .deployTraderWallet(
                      usdcTokenContract.address,
                      traderAddress,
                      ownerAddress
                    )
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });
            describe("WHEN _underlyingTokenAddress is zero address", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(deployer)
                    .deployTraderWallet(
                      ZERO_ADDRESS,
                      traderAddress,
                      ownerAddress
                    )
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_underlyingTokenAddress");
              });
            });
            describe("WHEN _traderAddress is zero address", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(deployer)
                    .deployTraderWallet(
                      usdcTokenContract.address,
                      ZERO_ADDRESS,
                      ownerAddress
                    )
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_traderAddress");
              });
            });
            describe("WHEN _owner address is zero address", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(deployer)
                    .deployTraderWallet(
                      usdcTokenContract.address,
                      traderAddress,
                      ZERO_ADDRESS
                    )
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_owner");
              });
            });
          });

          describe("WHEN calling with correct caller and parameter", function () {
            before(async () => {
              // set adapters registry on factory to deploy wallet and vault
              await contractsFactoryContract.setAdaptersRegistryAddress(
                adaptersRegistryContract.address
              );

              await contractsFactoryContract.addTrader(traderAddress);

              txResult = await contractsFactoryContract
                .connect(deployer)
                .deployTraderWallet(
                  usdcTokenContract.address,
                  traderAddress,
                  ownerAddress
                );

              const abi = [
                "event TraderWalletDeployed(address indexed traderWalletAddress, address indexed traderAddress, address indexed underlyingTokenAddress)",
              ];
              const signature = "TraderWalletDeployed(address,address,address)";

              txReceipt = await txResult.wait();
              const decodedEvent = await decodeEvent(abi, signature, txReceipt);
              traderWalletAddress = decodedEvent.args.traderWalletAddress;

              traderWalletContract = (await ethers.getContractAt(
                "TraderWallet",
                traderWalletAddress
              )) as TraderWallet;
            });

            it("THEN Trader Wallet contract should be deployed with correct parameters", async () => {
              expect(await traderWalletContract.vaultAddress()).to.equal(
                ZERO_ADDRESS
              );
              expect(
                await traderWalletContract.underlyingTokenAddress()
              ).to.equal(usdcTokenContract.address);
              expect(
                await traderWalletContract.contractsFactoryAddress()
              ).to.equal(contractsFactoryContract.address);

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

            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "TraderWalletDeployed")
                .withArgs(
                  traderWalletAddress,
                  traderAddress,
                  usdcTokenContract.address
                );
            });

            it("THEN tradersWallets mapping on factory should have the new wallet", async () => {
              expect(
                await contractsFactoryContract.isTraderWallet(
                  traderWalletContract.address
                )
              ).to.be.true;
            });

            it("THEN traderWallets array on factory should have the new wallet", async () => {
              const numOfTraderWallets =
                await contractsFactoryContract.numOfTraderWallets();
              expect(numOfTraderWallets).equals(1);
              expect(
                await contractsFactoryContract.traderWalletsArray(0)
              ).equals(traderWalletAddress);
            });

            describe("WHEN transferring ownership on traderWallet contract", function () {
              before(async () => {
                await traderWalletContract
                  .connect(owner)
                  .transferOwnership(otherAddress);
              });
              it("THEN it should return the correct owner", async () => {
                expect(await traderWalletContract.owner()).to.equal(
                  otherAddress
                );
              });
            });
          });
        });

        describe("WHEN trying to create a users vault", async () => {
          const SHARES_NAME = "USV";
          const SHARES_SYMBOL = "USV";

          before(async () => {
            // set adapters registry on factory to deploy wallet and vault
            await contractsFactoryContract.setAdaptersRegistryAddress(
              adaptersRegistryContract.address
            );

            await contractsFactoryContract
              .connect(deployer)
              .deployTraderWallet(
                usdcTokenContract.address,
                traderAddress,
                ownerAddress
              );

            const abi = [
              "event TraderWalletDeployed(address indexed traderWalletAddress, address indexed _traderAddress, address indexed _underlyingTokenAddress)",
            ];
            const signature = "TraderWalletDeployed(address,address,address)";

            txReceipt = await txResult.wait();
            const decodedEvent = await decodeEvent(abi, signature, txReceipt);
            traderWalletAddress = decodedEvent.args.traderWalletAddress;

            traderWalletContract = (await ethers.getContractAt(
              "TraderWallet",
              traderWalletAddress
            )) as TraderWallet;
          });

          describe("WHEN calling with incorrect caller and parameter", function () {
            describe("WHEN caller is not owner", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(otherSigner)
                    .deployUsersVault(
                      traderWalletAddress,
                      ownerAddress,
                      SHARES_NAME,
                      SHARES_SYMBOL
                    )
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });
            describe("WHEN _traderWalletAddress is zero address", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(deployer)
                    .deployUsersVault(
                      ZERO_ADDRESS,
                      ownerAddress,
                      SHARES_NAME,
                      SHARES_SYMBOL
                    )
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_traderWalletAddress");
              });
            });
            describe("WHEN _owner address is zero address", function () {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(deployer)
                    .deployUsersVault(
                      usdcTokenContract.address,
                      ZERO_ADDRESS,
                      SHARES_NAME,
                      SHARES_SYMBOL
                    )
                )
                  .to.be.revertedWithCustomError(
                    contractsFactoryContract,
                    "ZeroAddress"
                  )
                  .withArgs("_owner");
              });
            });
          });

          describe("WHEN calling with correct caller and parameter", function () {
            before(async () => {
              // set adapters registry on factory to deploy wallet and vault
              await contractsFactoryContract.setAdaptersRegistryAddress(
                adaptersRegistryContract.address
              );

              txResult = await contractsFactoryContract
                .connect(deployer)
                .deployUsersVault(
                  traderWalletAddress,
                  ownerAddress,
                  SHARES_NAME,
                  SHARES_SYMBOL
                );

              const abi = [
                "event UsersVaultDeployed(address indexed usersVaultAddress, address indexed traderAddress)",
              ];
              const signature = "UsersVaultDeployed(address,address)";

              txReceipt = await txResult.wait();
              const decodedEvent = await decodeEvent(abi, signature, txReceipt);
              usersVaultAddress = decodedEvent.args.usersVaultAddress;

              usersVaultContract = (await ethers.getContractAt(
                "UsersVault",
                usersVaultAddress
              )) as UsersVault;
            });

            it("THEN UsersVault contract should be deployed with correct parameters", async () => {
              expect(await usersVaultContract.traderWalletAddress()).to.equal(
                traderWalletContract.address
              );
              expect(
                await usersVaultContract.underlyingTokenAddress()
              ).to.equal(usdcTokenContract.address);
              expect(
                await usersVaultContract.contractsFactoryAddress()
              ).to.equal(contractsFactoryContract.address);

              expect(await usersVaultContract.owner()).to.equal(ownerAddress);

              expect(await usersVaultContract.pendingDepositAssets()).to.equal(
                ZERO_AMOUNT
              );
              expect(await usersVaultContract.pendingWithdrawShares()).to.equal(
                ZERO_AMOUNT
              );
            });

            it("THEN it should emit an Event", async () => {
              await expect(txResult)
                .to.emit(contractsFactoryContract, "UsersVaultDeployed")
                .withArgs(usersVaultAddress, traderWalletAddress);
            });

            it("THEN usersVaults mapping on factory should have the new vault", async () => {
              expect(
                await contractsFactoryContract.isUsersVault(usersVaultAddress)
              ).to.be.true;
            });

            it("THEN usersVaultsArray on factory should have the new vault", async () => {
              const numOfUsersVaults =
                await contractsFactoryContract.numOfUsersVaults();
              expect(numOfUsersVaults).equals(1);
              expect(await contractsFactoryContract.usersVaultsArray(0)).equals(
                usersVaultAddress
              );
            });

            describe("WHEN transferring ownership on usersVault contract", function () {
              before(async () => {
                await usersVaultContract
                  .connect(owner)
                  .transferOwnership(otherAddress);
              });
              it("THEN it should return the correct owner", async () => {
                expect(await usersVaultContract.owner()).to.equal(otherAddress);
              });
            });
          });
        });

        describe("WHEN trying to set new implementation for UsersVaults", () => {
          describe("WHEN calling with invalid caller or parameters", () => {
            describe("WHEN caller is not owner", () => {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(otherSigner)
                    .setUsersVaultImplementation(
                      usersVaultImplementationV2.address
                    )
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN new implementation is not a contract", () => {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .setUsersVaultImplementation(owner.address)
                ).to.be.revertedWith(
                  "UpgradeableBeacon: implementation is not a contract"
                );
              });
            });
          });

          describe("WHEN calling with correct caller and address", () => {
            it("THEN new address should be stored", async () => {
              expect(
                await contractsFactoryContract.usersVaultImplementation()
              ).equals(usersVaultImplementation.address);

              await contractsFactoryContract
                .connect(owner)
                .setUsersVaultImplementation(
                  usersVaultImplementationV2.address
                );

              expect(
                await contractsFactoryContract.usersVaultImplementation()
              ).equals(usersVaultImplementationV2.address);
            });

            it("THEN it should emit an Event", async () => {
              await expect(
                contractsFactoryContract
                  .connect(owner)
                  .setUsersVaultImplementation(
                    usersVaultImplementationV2.address
                  )
              )
                .emit(
                  contractsFactoryContract,
                  "UsersVaultImplementationChanged"
                )
                .withArgs(usersVaultImplementationV2.address);
            });

            it("THEN implementation should change", async () => {
              await contractsFactoryContract
                .connect(owner)
                .setUsersVaultImplementation(usersVaultImplementation.address);

              const numOftraderWallets =
                await contractsFactoryContract.numOfTraderWallets();

              await contractsFactoryContract.addTrader(owner.address);

              await contractsFactoryContract.deployTraderWallet(
                underlyingTokenAddress,
                owner.address,
                owner.address
              );

              const newTraderWalletAddress =
                await contractsFactoryContract.traderWalletsArray(
                  numOftraderWallets
                );

              const numOfUsersVaults =
                await contractsFactoryContract.numOfUsersVaults();

              await contractsFactoryContract.deployUsersVault(
                newTraderWalletAddress,
                owner.address,
                "",
                ""
              );

              const usersVaultV2Factory = await ethers.getContractFactory(
                "UsersVaultV2",
                {
                  libraries: {
                    GMXAdapter: gmxAdapterContract.address,
                  },
                }
              );

              const newUsersVault = await usersVaultV2Factory.attach(
                await contractsFactoryContract.usersVaultsArray(
                  numOfUsersVaults
                )
              );

              await expect(
                newUsersVault.addedVariable()
              ).revertedWithoutReason();

              await contractsFactoryContract
                .connect(owner)
                .setUsersVaultImplementation(
                  usersVaultImplementationV2.address
                );
              expect(await newUsersVault.addedVariable()).equals(0);
            });
          });
        });

        describe("WHEN trying to set new implementation for TraderWallets", () => {
          describe("WHEN calling with invalid caller or parameters", () => {
            describe("WHEN caller is not owner", () => {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(otherSigner)
                    .setTraderWalletImplementation(
                      traderWalletImplementationV2.address
                    )
                ).to.be.revertedWith("Ownable: caller is not the owner");
              });
            });

            describe("WHEN new implementation is not a contract", () => {
              it("THEN it should fail", async () => {
                await expect(
                  contractsFactoryContract
                    .connect(owner)
                    .setTraderWalletImplementation(owner.address)
                ).to.be.revertedWith(
                  "UpgradeableBeacon: implementation is not a contract"
                );
              });
            });
          });

          describe("WHEN calling with correct caller and address", () => {
            it("THEN new address should be stored", async () => {
              expect(
                await contractsFactoryContract.traderWalletImplementation()
              ).equals(traderWalletImplementation.address);

              await contractsFactoryContract
                .connect(owner)
                .setTraderWalletImplementation(
                  traderWalletImplementationV2.address
                );

              expect(
                await contractsFactoryContract.traderWalletImplementation()
              ).equals(traderWalletImplementationV2.address);
            });

            it("THEN it should emit an Event", async () => {
              await expect(
                contractsFactoryContract
                  .connect(owner)
                  .setTraderWalletImplementation(
                    traderWalletImplementationV2.address
                  )
              )
                .emit(
                  contractsFactoryContract,
                  "TraderWalletImplementationChanged"
                )
                .withArgs(traderWalletImplementationV2.address);
            });

            it("THEN implementation should change", async () => {
              await contractsFactoryContract
                .connect(owner)
                .setTraderWalletImplementation(
                  traderWalletImplementation.address
                );

              const numOftraderWallets =
                await contractsFactoryContract.numOfTraderWallets();

              await contractsFactoryContract.deployTraderWallet(
                underlyingTokenAddress,
                owner.address,
                owner.address
              );

              const traderWalletV2Factory = await ethers.getContractFactory(
                "TraderWalletV2",
                {
                  libraries: {
                    GMXAdapter: gmxAdapterContract.address,
                  },
                }
              );
              const newTraderWallet = await traderWalletV2Factory.attach(
                await contractsFactoryContract.traderWalletsArray(
                  numOftraderWallets
                )
              );
              await expect(
                newTraderWallet.addedVariable()
              ).revertedWithoutReason();

              await contractsFactoryContract
                .connect(owner)
                .setTraderWalletImplementation(
                  traderWalletImplementationV2.address
                );

              expect(await newTraderWallet.addedVariable()).equals(0);
            });
          });
        });
      });
    });
  });
});
