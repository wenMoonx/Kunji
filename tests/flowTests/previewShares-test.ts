import { ethers, upgrades } from "hardhat";
import { Signer, ContractFactory, BigNumber } from "ethers";
import { expect } from "chai";
import Reverter from "../_helpers/reverter";
import {
  ContractsFactoryMock,
  // TraderWalletMock,
  ERC20Mock,
  UsersVaultTest,
  UsersVaultTest__factory,
  DynamicValuationMock,
} from "../../typechain-types";
import { TEST_TIMEOUT, AMOUNT_1E18, AMOUNT_1E30 } from "../_helpers/constants";

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

let UsersVaultFactory: UsersVaultTest__factory;
let usersVaultContract: UsersVaultTest;
let dynamicValuationContract: DynamicValuationMock;

let ContractsFactoryFactory: ContractFactory;
let contractsFactoryContract: ContractsFactoryMock;

let usdcTokenContract: ERC20Mock;

describe("User Vault Contract Tests", function () {
  this.timeout(TEST_TIMEOUT);

  before(async () => {
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");

    usdcTokenContract = (await ERC20MockFactory.deploy(
      "USDC",
      "USDC",
      18
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
        const showBalances = async () => {
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
            "userData 1         : ",
            await usersVaultContract.userData(user1Address)
          );
          console.log(
            "userData 2         : ",
            await usersVaultContract.userData(user2Address)
          );
          console.log(
            "userData 3         : ",
            await usersVaultContract.userData(user3Address)
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
        };

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

        it("THEN ==> DEPOSIT ON ROUND 0 ==> NOT STARTED YET !!!!", async () => {
          await usersVaultContract
            .connect(user1)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(10)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user1)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(20)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user2)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(30)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user2)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(40)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user3)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(50)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
        });

        it("THEN ==> Balanaces before and after FIRST rollover", async () => {
          // set valuation for Vault
          await dynamicValuationContract.setValuation(AMOUNT_1E30.mul(1500));
          await dynamicValuationContract.setOraclePrice(AMOUNT_1E30.mul(10));

          await usersVaultContract.connect(traderWallet).rolloverFromTrader();

          /* console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    await showBalances();

                    console.log(
                      "\n\nUser 1 Shares PRV    :>> ",
                      await usersVaultContract.previewShares(user1Address)
                    ); */
        });

        it("THEN ==> DEPOSIT ON ROUND 1 ==> VALID FOR ROUND 2", async () => {
          await usersVaultContract
            .connect(user1)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(1)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user1)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(2)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user2)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(3)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user2)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(4)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */
          await usersVaultContract
            .connect(user3)
            .userDeposit(BigNumber.from(AMOUNT_1E18.mul(5)));
          /* console.log(
                      "pendingDepositAssets   : ",
                      await usersVaultContract.pendingDepositAssets()
                    ); */

          /* console.log(
                      "\n\nUser 1 Shares PRV      :>> ",
                      await usersVaultContract.previewShares(user1Address)
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    ); */
        });

        it("THEN ==> User 1 Claim 1 Share", async () => {
          /* console.log(
                      "Balance user 1 Before claim: ",
                      await usersVaultContract.balanceOf(user1Address)
                    ); */
          await usersVaultContract.connect(user1).claim();
          /* console.log(
                      "Balance user 1 After claim: ",
                      await usersVaultContract.balanceOf(user1Address)
                    ); */
        });

        it("THEN ==> User 2 Claim 2 shares", async () => {
          const balanceBefore = await usersVaultContract.balanceOf(
            user2Address
          );
          //console.log("Balance user 2 Before claim: ", balanceBefore);
          await usersVaultContract.connect(user2).claim();
          const balanceAfter = await usersVaultContract.balanceOf(user2Address);
          expect(balanceBefore.add(AMOUNT_1E30.mul(700))).to.equal(
            balanceAfter
          );
        });

        it("THEN ==> User 3 Claim 3 shares", async () => {
          const balanceBefore = await usersVaultContract.balanceOf(
            user3Address
          );
          //console.log("Balance user 3 Before claim: ", balanceBefore);
          await usersVaultContract.connect(user3).claim();
          const balanceAfter = await usersVaultContract.balanceOf(user3Address);
          expect(balanceBefore.add(AMOUNT_1E30.mul(500))).to.equal(
            balanceAfter
          );
        });

        it("THEN ==> User 3 Makes WithdrawRequest of 3 Asset", async () => {
          const balanceBeforeUSDC = await usdcTokenContract.balanceOf(
            user3Address
          );
          const balanceBefore = await usersVaultContract.balanceOf(
            user3Address
          );
          /* console.log(
                      "Balance user 3 Before claim: ",
                      await usdcTokenContract.balanceOf(user3Address)
                    ); */
          await usersVaultContract
            .connect(user3)
            .withdrawRequest(AMOUNT_1E30.mul(500));
          const balanceAfter = await usersVaultContract.balanceOf(user3Address);
          const balanceAfterUSDC = await usdcTokenContract.balanceOf(
            user3Address
          );
          expect(balanceBefore.sub(balanceAfter)).to.equal(
            AMOUNT_1E30.mul(500)
          );
          expect(balanceAfterUSDC.sub(balanceBeforeUSDC)).to.equal(0);
        });

        it("THEN ==> Balanaces before and after SECOND rollover PROFIT OF 35", async () => {
          /* await showBalances();

                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    ); */

          await usdcTokenContract.mint(
            usersVaultContract.address,
            AMOUNT_1E18.mul(35)
          );
          await dynamicValuationContract.setValuation(
            AMOUNT_1E30.mul(10)
              .mul(
                await usdcTokenContract.balanceOf(usersVaultContract.address)
              )
              .div(AMOUNT_1E18)
          );
          await dynamicValuationContract.setOraclePrice(AMOUNT_1E30.mul(10));
          await usersVaultContract.connect(traderWallet).rolloverFromTrader();

          /* console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );
                    console.log(
                      "--------------------------------------------------------------------------"
                    );

                    await showBalances(); */
        });

        it("THEN ==> User 3 Claim 3 Assets", async () => {
          /* console.log(
                      "\n\nUser 1 Shares PRV      :>> ",
                      await usersVaultContract.previewShares(user1Address)
                    ); */

          const balanceBefore = await usdcTokenContract.balanceOf(user3Address);
          /* console.log(
                      "Balance user 3 Before claim: ",
                      await usdcTokenContract.balanceOf(user3Address)
                    ); */
          await usersVaultContract.connect(user3).claim();
          const balanceAfter = await usdcTokenContract.balanceOf(user3Address);

          const expectedBalance = AMOUNT_1E18.mul(150)
            .add(AMOUNT_1E18.mul(35).mul(9).div(10))
            .div(3);

          expect(balanceBefore.add(expectedBalance)).to.equal(balanceAfter);
        });
        xit("THEN ==> skipped showBalances()", async () => {
          await showBalances();
        });
      });
    });
  });
});

/*

USER 1
3 pending assets
29 unclaimed shares
round 1

asset per share round 1 = 1258503401360544217

1.258503401360544217 asset per 1 share
1 asset = 0,7945945945945945950284002922 shares
3 asset = 2,3837837837837837850852008766 shares + 29 shares = 31,3837837837837837850852008766

*/
