import { ethers, upgrades } from "hardhat";
import { Signer, ContractFactory, BigNumber } from "ethers";
import { expect } from "chai";
import Reverter from "../_helpers/reverter";
import {
  ContractsFactoryMock,
  DynamicValuationMock,
  ERC20Mock,
  UsersVaultTest,
  UsersVaultTest__factory,
} from "../../typechain-types";
import { TEST_TIMEOUT, AMOUNT_1E18 } from "../_helpers/constants";

const reverter = new Reverter();

let deployer: Signer;
let traderWallet: Signer;
let user1: Signer;
let user2: Signer;
let user3: Signer;
let user4: Signer;
let user5: Signer;

let deployerAddress: string;
let underlyingTokenAddress: string;
let traderWalletAddress: string;
let ownerAddress: string;
let user1Address: string;
let user2Address: string;
let user3Address: string;
let user4Address: string;
let user5Address: string;

let dynamicValuationContract: DynamicValuationMock;
let UsersVaultFactory: UsersVaultTest__factory;
let usersVaultContract: UsersVaultTest;

let ContractsFactoryFactory: ContractFactory;
let contractsFactoryContract: ContractsFactoryMock;
let usdcTokenContract: ERC20Mock;

const showStructsAndVariables = async () => {
  console.log(
    "pendingDepositAssets   : ",
    await usersVaultContract.pendingDepositAssets()
  );
  console.log(
    "processedWithdrawAssets: ",
    await usersVaultContract.processedWithdrawAssets()
  );
  console.log(
    "pendingWithdrawShares  : ",
    await usersVaultContract.pendingWithdrawShares()
  );
  console.log("\n");
  console.log(
    "assetsPerShareXRound(0): ",
    await usersVaultContract.assetsPerShareXRound(0)
  );
  console.log(
    "assetsPerShareXRound(1): ",
    await usersVaultContract.assetsPerShareXRound(1)
  );
  console.log(
    "assetsPerShareXRound(2): ",
    await usersVaultContract.assetsPerShareXRound(2)
  );
  console.log("\n");
  console.log(
    "ROUND                  : ",
    await usersVaultContract.currentRound()
  );
  console.log(
    "contract USDC Balance  : ",
    await usdcTokenContract.balanceOf(usersVaultContract.address)
  );
  console.log(
    "Vault Shares Balance   : ",
    await usersVaultContract.getSharesContractBalance()
  );
  console.log(
    "Total Supply           : ",
    await usersVaultContract.totalSupply()
  );
  console.log(
    "initialVaultBalance    : ",
    await usersVaultContract.initialVaultBalance()
  );
  console.log(
    "afterRoundVaultBalance : ",
    await usersVaultContract.afterRoundVaultBalance()
  );
  console.log("\n");
  console.log(
    "userDeposits 1         : ",
    await usersVaultContract.userDeposits(user1Address)
  );
  console.log(
    "userWithdrawals 1      : ",
    await usersVaultContract.userWithdrawals(user1Address)
  );
  console.log("\n");
  console.log(
    "userDeposits 2         : ",
    await usersVaultContract.userDeposits(user2Address)
  );
  console.log(
    "userWithdrawals 2      : ",
    await usersVaultContract.userWithdrawals(user2Address)
  );
  console.log("\n");
};

const showPreview = async () => {
  console.log(
    "User 1 Shares PRV    :>> ",
    await usersVaultContract.previewShares(user1Address)
  );
  console.log(
    "User 1 Assets PRV    :>> ",
    await usersVaultContract.previewAssets(user1Address)
  );
  console.log(
    "User 2 Shares PRV    :>> ",
    await usersVaultContract.previewShares(user2Address)
  );
  console.log(
    "User 2 Assets PRV    :>> ",
    await usersVaultContract.previewAssets(user2Address)
  );
};

const showBalances = async () => {
  console.log(
    "User 1 Shares BAL    :>> ",
    await usersVaultContract.balanceOf(user1Address)
  );
  console.log(
    "User 1 Assets BAL    :>> ",
    await usdcTokenContract.balanceOf(user1Address)
  );
  console.log(
    "User 2 Shares BAL    :>> ",
    await usersVaultContract.balanceOf(user2Address)
  );
  console.log(
    "User 2 Assets BAL    :>> ",
    await usdcTokenContract.balanceOf(user2Address)
  );
};

describe("User Vault Contract Tests", function () {
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

    [deployer, traderWallet, user1, user2, user3, user4, user5] =
      await ethers.getSigners();

    [
      deployerAddress,
      traderWalletAddress,
      user1Address,
      user2Address,
      user3Address,
      user4Address,
      user5Address,
    ] = await Promise.all([
      deployer.getAddress(),
      traderWallet.getAddress(),
      user1.getAddress(),
      user2.getAddress(),
      user3.getAddress(),
      user4.getAddress(),
      user5.getAddress(),
    ]);
  });

  describe("UsersVault deployment Tests", function () {
    before(async () => {
      const GMXAdapterLibraryFactory = await ethers.getContractFactory(
        "GMXAdapter"
      );
      const gmxAdapterContract = await GMXAdapterLibraryFactory.deploy();
      await gmxAdapterContract.deployed();

      // deploy mocked DynamicValuation
      const DynamicValuationfactory = await ethers.getContractFactory(
        "DynamicValuationMock"
      );
      dynamicValuationContract = (await DynamicValuationfactory.deploy(
        AMOUNT_1E18.mul(1000)
      )) as DynamicValuationMock;
      await dynamicValuationContract.deployed();

      UsersVaultFactory = await ethers.getContractFactory("UsersVaultTest", {
        libraries: {
          GMXAdapter: gmxAdapterContract.address,
        },
      });
      ContractsFactoryFactory = await ethers.getContractFactory(
        "ContractsFactoryMock"
      );

      // deploy ContractsFactory
      contractsFactoryContract = (await upgrades.deployProxy(
        ContractsFactoryFactory,
        []
      )) as ContractsFactoryMock;
      await contractsFactoryContract.deployed();
      // set TRUE for response
      await contractsFactoryContract.setReturnValue(true);
      // set the dynamic valuation address
      await contractsFactoryContract.setDynamicValuationAddress(
        dynamicValuationContract.address
      );
      // owner = deployer;
      ownerAddress = deployerAddress;
    });

    describe("WHEN trying to deploy TraderWallet contract with correct parameters", function () {
      before(async () => {
        const usersVaultProxy = await upgrades.deployProxy(
          UsersVaultFactory,
          [
            underlyingTokenAddress,
            traderWalletAddress,
            deployerAddress,
            "UsersVaultShares",
            "UVS",
          ],
          { unsafeAllowLinkedLibraries: true }
        );
        usersVaultContract = UsersVaultFactory.attach(usersVaultProxy.address);
        await usersVaultContract.deployed();
        await usersVaultContract.setContractsFactoryAddress(
          contractsFactoryContract.address
        );

        // approve and mint to users
        await usdcTokenContract.mint(user1Address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract.mint(user2Address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract.mint(user3Address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract.mint(user4Address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract.mint(user5Address, AMOUNT_1E18.mul(1000));

        await usdcTokenContract
          .connect(user1)
          .approve(usersVaultContract.address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract
          .connect(user2)
          .approve(usersVaultContract.address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract
          .connect(user3)
          .approve(usersVaultContract.address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract
          .connect(user4)
          .approve(usersVaultContract.address, AMOUNT_1E18.mul(1000));
        await usdcTokenContract
          .connect(user5)
          .approve(usersVaultContract.address, AMOUNT_1E18.mul(1000));

        // take a snapshot
        await reverter.snapshot();
      });

      describe("WHEN trying to deploy TraderWallet contract with correct parameters", function () {
        it("THEN it should return the same ones after deployment", async () => {
          expect(await usersVaultContract.underlyingTokenAddress()).to.equal(
            underlyingTokenAddress
          );
          expect(await usersVaultContract.contractsFactoryAddress()).to.equal(
            contractsFactoryContract.address
          );
          expect(await usersVaultContract.traderWalletAddress()).to.equal(
            traderWalletAddress
          );
          expect(await usersVaultContract.owner()).to.equal(ownerAddress);
        });

        it("THEN ==> DEPOSIT ON ROUND 0 --> 1", async () => {
          await usersVaultContract
            .connect(user1)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(10)));
          await usersVaultContract
            .connect(user1)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(20)));
          await usersVaultContract
            .connect(user2)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(30)));
          await usersVaultContract
            .connect(user2)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(40)));
          //await showStructsAndVariables();
          //   await showPreview();
          //await showBalances();
        });

        it("THEN ==> FIRST rollover -->> 2", async () => {
          // set valuation for Vault
          await dynamicValuationContract.setValuation(AMOUNT_1E18.mul(1000));
          await dynamicValuationContract.setOraclePrice(AMOUNT_1E18.mul(10));
          await usersVaultContract.connect(traderWallet).rolloverFromTrader();
        });

        it("THEN ==> CLAIMING SHARES 3", async () => {
          /* console.log(
            "\n==============================================================================="
          ); */
          await usersVaultContract.connect(user1).claim();
          await usersVaultContract.connect(user2).claim();
          /* await showStructsAndVariables();
          // await showPreview();
          await showBalances();
          console.log(
            "\n==============================================================================="
          ); */
        });

        it("THEN ==> WHITDRAW REQUEST 4", async () => {
          /* console.log(
            "\n==============================================================================="
          ); */

          await usersVaultContract
            .connect(user1)
            .withdrawRequest(AMOUNT_1E18.mul(5));
          await usersVaultContract
            .connect(user2)
            .withdrawRequest(AMOUNT_1E18.mul(10));
          /* await showStructsAndVariables();
          // await showPreview();
          await showBalances();
          console.log(
            "\n==============================================================================="
          ); */
        });

        it("THEN ==> SECOND rollover / 50 profit -->> 5", async () => {
          /* console.log(
            "--------------------------------------------------------------------------"
          ); */
          await usdcTokenContract.mint(
            usersVaultContract.address,
            AMOUNT_1E18.mul(50)
          );
          await usersVaultContract.connect(traderWallet).rolloverFromTrader();
          /* await showStructsAndVariables();
          await showBalances();
          await showPreview();
          console.log(
            "--------------------------------------------------------------------------"
          ); */
        });

        it("THEN ==> CLAIM ASSETS 6", async () => {
          /* console.log(
            "\n==============================================================================="
          ); */
          await usersVaultContract.connect(user1).claim();
          await usersVaultContract.connect(user2).claim();
          /* await showStructsAndVariables();
          await showBalances();
          await showPreview();
          console.log(
            "\n==============================================================================="
          ); */
        });

        it("THEN ==> DEPOSIT 7", async () => {
          await usersVaultContract
            .connect(user1)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(10)));
          await usersVaultContract
            .connect(user2)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(20)));
          /* await showStructsAndVariables();
          await showPreview();
          await showBalances(); */
        });

        it("THEN ==> CLAIMING SHARES 8", async () => {
          /* console.log(
            "\n==============================================================================="
          ); */
          await usersVaultContract.connect(user1).claim();
          await usersVaultContract.connect(user2).claim();
          /* await showStructsAndVariables();
          await showPreview();
          await showBalances();
          console.log(
            "\n==============================================================================="
          ); */
        });

        it("THEN ==> WHITDRAW REQUEST 9", async () => {
          /* console.log(
            "\n==============================================================================="
          ); */
          await usersVaultContract
            .connect(user1)
            .withdrawRequest(AMOUNT_1E18.mul(20));
          await usersVaultContract
            .connect(user2)
            .withdrawRequest(AMOUNT_1E18.mul(50));
          /* await showStructsAndVariables();
          await showPreview();
          await showBalances();
          console.log(
            "\n==============================================================================="
          ); */
        });

        xit("THEN ==> THIRD rollover LOSS 50 -->> 10", async () => {
          /* console.log(
            "--------------------------------------------------------------------------"
          );
          console.log(
            "--------------------------------------------------------------------------"
          ); */
          await usdcTokenContract.transfer(
            deployerAddress,
            AMOUNT_1E18.mul(50)
          );
          await expect(
            usersVaultContract.connect(traderWallet).rolloverFromTrader()
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
          /* console.log(
            "--------------------------------------------------------------------------"
          );
          console.log(
            "--------------------------------------------------------------------------"
          );
          await showBalances();
          */
          await showStructsAndVariables();
          await showPreview();
          await showBalances();
        });
      });
    });
  });
});
