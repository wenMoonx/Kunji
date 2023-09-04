import { ethers, upgrades } from "hardhat";
import "../../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  ZERO_ADDRESS,
  AMOUNT_1E18,
  AMOUNT_1E30,
} from "./../_helpers/constants";
import { BigNumber } from "ethers";

describe("User Vault Contract Tests", function () {
  it("Test prepEnv", async () => {
    const env = await loadFixture(prepareEnv);

    expect(await env.usersVaultContract.underlyingTokenAddress()).equals(
      env.underlyingTokenContract.address
    );
    expect(await env.usersVaultContract.contractsFactoryAddress()).equals(
      env.contractsFactoryContract.address
    );
    expect(await env.usersVaultContract.owner()).equals(env.owner.address);
    expect(await env.usersVaultContract.traderWalletAddress()).equals(
      env.traderWalletMockContract.address
    );

    expect(await env.contractsFactoryContract.dynamicValuationAddress()).equals(
      env.dynamicValuationContract.address
    );
  });

  describe("{initialize} function", () => {
    describe("Reverts", () => {
      it("In implementation address function should be closed", async () => {
        const env = await loadFixture(prepareEnv);

        const usersVaultContractNew = await env.UsersVaultFactory.deploy();
        await expect(
          usersVaultContractNew.initialize(
            env.underlyingTokenContract.address,
            env.traderWalletMockContract.address,
            env.owner.address,
            env.sharesName,
            env.sharesSymbol
          )
        ).revertedWith("Initializable: contract is already initialized");
      });

      it("Should revert when some address is zero", async () => {
        const env = await loadFixture(prepareEnv);

        const usersVaultProxyNew = await upgrades.deployProxy(
          env.UsersVaultFactory,
          undefined,
          {
            initializer: false,
            unsafeAllowLinkedLibraries: true,
          }
        );
        const usersVaultContractNew = env.UsersVaultFactory.attach(
          usersVaultProxyNew.address
        );

        await expect(
          usersVaultContractNew.initialize(
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            env.sharesName,
            env.sharesSymbol
          )
        )
          .revertedWithCustomError(usersVaultContractNew, "ZeroAddress")
          .withArgs("_underlyingTokenAddress");

        await expect(
          usersVaultContractNew.initialize(
            env.underlyingTokenContract.address,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            env.sharesName,
            env.sharesSymbol
          )
        )
          .revertedWithCustomError(usersVaultContractNew, "ZeroAddress")
          .withArgs("_ownerAddress");

        await expect(
          usersVaultContractNew.initialize(
            env.underlyingTokenContract.address,
            ZERO_ADDRESS,
            env.owner.address,
            env.sharesName,
            env.sharesSymbol
          )
        )
          .revertedWithCustomError(usersVaultContractNew, "ZeroAddress")
          .withArgs("_traderWalletAddress");
      });

      it("Should revert when call {initialize} function twice", async () => {
        const env = await loadFixture(prepareEnv);

        await expect(
          env.usersVaultContract.initialize(
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            env.sharesName,
            env.sharesSymbol
          )
        ).revertedWith("Initializable: contract is already initialized");
      });
    });
  });

  describe("{userDeposit} function", () => {
    it("Should make storage changes in round 0 and emit event", async () => {
      const env = await loadFixture(prepareEnv);

      const depositAmount = AMOUNT_1E18.mul(100);
      await env.underlyingTokenContract.mint(env.alice.address, depositAmount);
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(env.usersVaultContract.address, depositAmount);

      await env.contractsFactoryContract.setReturnValue(true); // add allowed investor

      await expect(
        env.usersVaultContract.connect(env.alice).userDeposit(depositAmount)
      )
        .emit(env.usersVaultContract, "UserDeposited")
        .withArgs(env.alice.address, depositAmount, 0);

      expect(await env.usersVaultContract.pendingDepositAssets()).equals(
        depositAmount
      );

      const userData = await env.usersVaultContract.userData(env.alice.address);
      expect(userData.round).equals(0);
      expect(userData.pendingDepositAssets).equals(depositAmount);
      expect(userData.pendingWithdrawShares).equals(0);
      expect(userData.unclaimedDepositShares).equals(0);
      expect(userData.unclaimedWithdrawAssets).equals(0);
    });

    it("Should make storage changes in round 0 with double deposits", async () => {
      const env = await loadFixture(prepareEnv);

      const depositAmount = AMOUNT_1E18.mul(100);
      await env.underlyingTokenContract.mint(env.alice.address, depositAmount);
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(env.usersVaultContract.address, depositAmount);

      await env.contractsFactoryContract.setReturnValue(true); // add allowed investor

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(depositAmount.div(2));

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(depositAmount.sub(depositAmount.div(2)));

      expect(await env.usersVaultContract.pendingDepositAssets()).equals(
        depositAmount
      );

      const userData = await env.usersVaultContract.userData(env.alice.address);
      expect(userData.round).equals(0);
      expect(userData.pendingDepositAssets).equals(depositAmount);
      expect(userData.pendingWithdrawShares).equals(0);
      expect(userData.unclaimedDepositShares).equals(0);
      expect(userData.unclaimedWithdrawAssets).equals(0);
    });

    it("Should make storage changes in round 1", async () => {
      const env = await loadFixture(prepareEnv);

      const firstDepositAmount = AMOUNT_1E18.mul(100);
      const secondDepositAmount = AMOUNT_1E18.mul(200);
      await env.underlyingTokenContract.mint(
        env.alice.address,
        firstDepositAmount.add(secondDepositAmount)
      );
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(
          env.usersVaultContract.address,
          firstDepositAmount.add(secondDepositAmount)
        );

      await env.contractsFactoryContract.setReturnValue(true); // add allowed investor

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(firstDepositAmount);

      await callRolloverInVault(env);

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(secondDepositAmount);

      expect(await env.usersVaultContract.pendingDepositAssets()).equals(
        secondDepositAmount
      );

      const userData = await env.usersVaultContract.userData(env.alice.address);
      expect(userData.round).equals(1);
      expect(userData.pendingDepositAssets).equals(secondDepositAmount);
      expect(userData.unclaimedDepositShares).equals(
        env.tokenPrice.mul(firstDepositAmount).div(AMOUNT_1E18)
      );
      expect(userData.pendingWithdrawShares).equals(0);
      expect(userData.unclaimedWithdrawAssets).equals(0);
    });

    describe("Reverts", () => {
      it("Should revert when user is not allowed", async () => {
        const env = await loadFixture(prepareEnv);

        await expect(
          env.usersVaultContract.userDeposit(0)
        ).revertedWithCustomError(env.usersVaultContract, "UserNotAllowed");
      });

      it("Should revert when amount is zero", async () => {
        const env = await loadFixture(prepareEnv);

        await env.contractsFactoryContract.setReturnValue(true);

        await expect(
          env.usersVaultContract.userDeposit(0)
        ).revertedWithCustomError(env.usersVaultContract, "ZeroAmount");
      });
    });
  });

  describe("{withdrawRequest} function", () => {
    it("Should make storage changes in round 1 and emit event", async () => {
      const env = await loadFixture(prepareEnv);

      const firstDepositAmount = AMOUNT_1E18.mul(10);
      await env.underlyingTokenContract.mint(
        env.alice.address,
        firstDepositAmount
      );
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(env.usersVaultContract.address, firstDepositAmount);

      await env.contractsFactoryContract.setReturnValue(true);

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(firstDepositAmount);

      await callRolloverInVault(env);

      await env.usersVaultContract.connect(env.alice).claim();

      const balance = await env.usersVaultContract.balanceOf(env.alice.address);

      await expect(
        env.usersVaultContract.connect(env.alice).withdrawRequest(balance)
      )
        .emit(env.usersVaultContract, "WithdrawRequest")
        .withArgs(env.alice.address, balance, 1);

      expect(await env.usersVaultContract.pendingWithdrawShares()).equals(
        balance
      );

      const userData = await env.usersVaultContract.userData(env.alice.address);
      expect(userData.round).equals(1);
      expect(userData.pendingDepositAssets).equals(0);
      expect(userData.unclaimedDepositShares).equals(0);
      expect(userData.pendingWithdrawShares).equals(balance);
      expect(userData.unclaimedWithdrawAssets).equals(0);
    });

    it("Should make storage changes in round 1 with double withdrawals and emit event", async () => {
      const env = await loadFixture(prepareEnv);

      const firstDepositAmount = AMOUNT_1E18.mul(10);
      await env.underlyingTokenContract.mint(
        env.alice.address,
        firstDepositAmount
      );
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(env.usersVaultContract.address, firstDepositAmount);

      await env.contractsFactoryContract.setReturnValue(true);

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(firstDepositAmount);

      await callRolloverInVault(env);

      await env.usersVaultContract.connect(env.alice).claim();

      const balance = await env.usersVaultContract.balanceOf(env.alice.address);

      await expect(
        env.usersVaultContract
          .connect(env.alice)
          .withdrawRequest(balance.div(2))
      )
        .emit(env.usersVaultContract, "WithdrawRequest")
        .withArgs(env.alice.address, balance.div(2), 1);

      await expect(
        env.usersVaultContract
          .connect(env.alice)
          .withdrawRequest(balance.sub(balance.div(2)))
      );

      expect(await env.usersVaultContract.pendingWithdrawShares()).equals(
        balance
      );

      const userData = await env.usersVaultContract.userData(env.alice.address);
      expect(userData.round).equals(1);
      expect(userData.pendingDepositAssets).equals(0);
      expect(userData.unclaimedDepositShares).equals(0);
      expect(userData.pendingWithdrawShares).equals(balance);
      expect(userData.unclaimedWithdrawAssets).equals(0);
    });

    it("Should make storage changes in round 2", async () => {
      const env = await loadFixture(prepareEnv);

      const firstDepositAmount = AMOUNT_1E18.mul(10);
      const secondDepositAmount = AMOUNT_1E18.mul(50);
      await env.underlyingTokenContract.mint(
        env.alice.address,
        firstDepositAmount.add(secondDepositAmount)
      );
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(
          env.usersVaultContract.address,
          firstDepositAmount.add(secondDepositAmount)
        );

      await env.contractsFactoryContract.setReturnValue(true);

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(firstDepositAmount);

      await callRolloverInVault(env);

      await env.usersVaultContract.connect(env.alice).claim();

      const firstBalance = await env.usersVaultContract.balanceOf(
        env.alice.address
      );

      await env.usersVaultContract
        .connect(env.alice)
        .withdrawRequest(firstBalance);
      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(secondDepositAmount);

      await callRolloverInVault(env);

      await env.usersVaultContract.connect(env.alice).claim();

      const secondBalance = await env.usersVaultContract.balanceOf(
        env.alice.address
      );
      await env.usersVaultContract
        .connect(env.alice)
        .withdrawRequest(secondBalance);

      expect(await env.usersVaultContract.pendingWithdrawShares()).equals(
        secondBalance
      );

      const userData = await env.usersVaultContract.userData(env.alice.address);
      expect(userData.round).equals(2);
      expect(userData.pendingDepositAssets).equals(0);
      expect(userData.unclaimedDepositShares).equals(0);
      expect(userData.pendingWithdrawShares).equals(secondBalance);
      expect(userData.unclaimedWithdrawAssets).equals(0);
    });

    describe("Reverts", () => {
      it("Should revert when amount is zero", async () => {
        const env = await loadFixture(prepareEnv);

        await expect(
          env.usersVaultContract.withdrawRequest(0)
        ).revertedWithCustomError(env.usersVaultContract, "ZeroAmount");
      });
    });
  });

  describe("{rolloverFromTrader} function", async () => {
    it("Should make storage changes in round 0", async () => {
      const env = await loadFixture(prepareEnv);

      const firstDepositAmount = AMOUNT_1E18.mul(10);
      await env.underlyingTokenContract.mint(
        env.alice.address,
        firstDepositAmount
      );
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(env.usersVaultContract.address, firstDepositAmount);

      await env.contractsFactoryContract.setReturnValue(true);

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(firstDepositAmount);

      const sharesToMint = env.tokenPrice
        .mul(firstDepositAmount)
        .div(AMOUNT_1E18);

      const sharePrice = AMOUNT_1E18.mul(AMOUNT_1E18).div(env.tokenPrice);

      await expect(callRolloverInVault(env))
        .emit(env.usersVaultContract, "UsersVaultRolloverExecuted")
        .withArgs(0, sharePrice, sharesToMint, 0, 0, firstDepositAmount);

      expect(await env.usersVaultContract.currentRound()).equals(1);
      expect(await env.usersVaultContract.assetsPerShareXRound(0)).equals(
        sharePrice.mul(env.tokenPrice).div(AMOUNT_1E18)
      );
      expect(
        await env.usersVaultContract.balanceOf(env.usersVaultContract.address)
      ).equals(sharesToMint);
      expect(await env.usersVaultContract.totalSupply()).equals(sharesToMint);
      expect(
        await env.usersVaultContract.previewShares(env.alice.address)
      ).equals(sharesToMint);
      expect(await env.usersVaultContract.pendingDepositAssets()).equals(0);
      expect(await env.usersVaultContract.pendingWithdrawShares()).equals(0);
      expect(await env.usersVaultContract.processedWithdrawAssets()).equals(0);
      expect(await env.usersVaultContract.afterRoundBalance()).equals(
        sharesToMint
      );
    });

    it("Should make storage changes in round 1 with profit", async () => {
      const env = await loadFixture(prepareEnv);

      const firstDepositAmount = AMOUNT_1E18.mul(10);
      const secondDepositAmount = AMOUNT_1E18.mul(50);
      await env.underlyingTokenContract.mint(
        env.alice.address,
        firstDepositAmount.add(secondDepositAmount)
      );
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(
          env.usersVaultContract.address,
          firstDepositAmount.add(secondDepositAmount)
        );

      await env.contractsFactoryContract.setReturnValue(true);

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(firstDepositAmount);

      await callRolloverInVault(env);

      await env.usersVaultContract.connect(env.alice).claim();
      const balance = await env.usersVaultContract.balanceOf(env.alice.address);

      await env.usersVaultContract.connect(env.alice).withdrawRequest(balance);
      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(secondDepositAmount);

      const newTokenPrice = env.tokenPrice.mul(11).div(10); // 110%

      const previousValuation = firstDepositAmount
        .mul(env.tokenPrice)
        .div(AMOUNT_1E18);

      const profitValuation = firstDepositAmount
        .mul(newTokenPrice)
        .div(AMOUNT_1E18)
        .sub(previousValuation);
      const kunjiFeesValuation = profitValuation.div(10);
      const kunjiFeesAssets = kunjiFeesValuation
        .mul(AMOUNT_1E18)
        .div(newTokenPrice);

      const valuationPerShare = previousValuation
        .add(profitValuation)
        .sub(kunjiFeesValuation)
        .mul(AMOUNT_1E18)
        .div(previousValuation);
      const underlyingTokenPerShare = valuationPerShare
        .mul(AMOUNT_1E18)
        .div(newTokenPrice);
      const sharesToMint = secondDepositAmount
        .mul(newTokenPrice)
        .div(AMOUNT_1E18)
        .mul(AMOUNT_1E18)
        .div(valuationPerShare);

      const valuation = previousValuation
        .add(profitValuation)
        .sub(kunjiFeesValuation)
        .add(secondDepositAmount.mul(newTokenPrice).div(AMOUNT_1E18))
        .sub(
          firstDepositAmount
            .sub(kunjiFeesAssets)
            .mul(newTokenPrice)
            .div(AMOUNT_1E18)
        );

      await expect(callRolloverInVault(env, newTokenPrice))
        .emit(env.usersVaultContract, "UsersVaultRolloverExecuted")
        .withArgs(
          1,
          underlyingTokenPerShare,
          sharesToMint,
          balance,
          profitValuation,
          secondDepositAmount.add(1)
        );

      expect(await env.usersVaultContract.currentRound()).equals(2);
      expect(await env.usersVaultContract.assetsPerShareXRound(1)).equals(
        valuationPerShare
      );
      expect(await env.usersVaultContract.totalSupply()).equals(sharesToMint);
      expect(
        await env.usersVaultContract.balanceOf(env.usersVaultContract.address)
      ).equals(sharesToMint);
      expect(
        await env.usersVaultContract.previewShares(env.alice.address)
      ).equals(sharesToMint);
      expect(await env.usersVaultContract.pendingDepositAssets()).equals(0);
      expect(await env.usersVaultContract.pendingWithdrawShares()).equals(0);
      expect(await env.usersVaultContract.kunjiFeesAssets()).equals(
        kunjiFeesAssets
      );
      expect(
        await env.usersVaultContract.processedWithdrawAssets()
      ).approximately(firstDepositAmount.sub(kunjiFeesAssets), 1);
      expect(
        await env.usersVaultContract.previewAssets(env.alice.address)
      ).approximately(firstDepositAmount.sub(kunjiFeesAssets), 1);
      expect(await env.usersVaultContract.afterRoundBalance()).approximately(
        valuation,
        newTokenPrice.mul(1).div(AMOUNT_1E18)
      );
    });

    it("Should make storage changes in round 1 without profit", async () => {
      const env = await loadFixture(prepareEnv);

      const firstDepositAmount = AMOUNT_1E18.mul(10);
      const secondDepositAmount = AMOUNT_1E18.mul(50);
      await env.underlyingTokenContract.mint(
        env.alice.address,
        firstDepositAmount.add(secondDepositAmount)
      );
      await env.underlyingTokenContract
        .connect(env.alice)
        .approve(
          env.usersVaultContract.address,
          firstDepositAmount.add(secondDepositAmount)
        );

      await env.contractsFactoryContract.setReturnValue(true);

      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(firstDepositAmount);

      await callRolloverInVault(env);

      await env.usersVaultContract.connect(env.alice).claim();
      const balance = await env.usersVaultContract.balanceOf(env.alice.address);

      await env.usersVaultContract.connect(env.alice).withdrawRequest(balance);
      await env.usersVaultContract
        .connect(env.alice)
        .userDeposit(secondDepositAmount);

      const newTokenPrice = env.tokenPrice.mul(9).div(10); // 90%

      const previousValuation = firstDepositAmount
        .mul(env.tokenPrice)
        .div(AMOUNT_1E18);

      const profitValuation = firstDepositAmount
        .mul(newTokenPrice)
        .div(AMOUNT_1E18)
        .sub(previousValuation);

      const sharePrice = previousValuation
        .add(profitValuation)
        .mul(AMOUNT_1E18)
        .mul(AMOUNT_1E18)
        .div(previousValuation)
        .div(newTokenPrice);
      const sharesToMint = secondDepositAmount.mul(AMOUNT_1E18).div(sharePrice);

      const valuation = previousValuation
        .add(profitValuation)
        .add(secondDepositAmount.mul(newTokenPrice).div(AMOUNT_1E18))
        .sub(
          sharePrice
            .mul(balance)
            .div(AMOUNT_1E18)
            .mul(newTokenPrice)
            .div(AMOUNT_1E18)
        );

      await expect(callRolloverInVault(env, newTokenPrice))
        .emit(env.usersVaultContract, "UsersVaultRolloverExecuted")
        .withArgs(
          1,
          sharePrice,
          sharesToMint,
          balance,
          profitValuation,
          secondDepositAmount
        );

      expect(await env.usersVaultContract.currentRound()).equals(2);
      expect(await env.usersVaultContract.assetsPerShareXRound(1)).equals(
        sharePrice.mul(newTokenPrice).div(AMOUNT_1E18)
      );
      expect(await env.usersVaultContract.totalSupply()).equals(sharesToMint);
      expect(
        await env.usersVaultContract.balanceOf(env.usersVaultContract.address)
      ).equals(sharesToMint);
      expect(
        await env.usersVaultContract.previewShares(env.alice.address)
      ).equals(sharesToMint);
      expect(await env.usersVaultContract.pendingDepositAssets()).equals(0);
      expect(await env.usersVaultContract.pendingWithdrawShares()).equals(0);
      expect(await env.usersVaultContract.kunjiFeesAssets()).equals(0);
      expect(await env.usersVaultContract.processedWithdrawAssets()).equals(
        firstDepositAmount
      );
      expect(
        await env.usersVaultContract.previewAssets(env.alice.address)
      ).equals(firstDepositAmount);
      expect(await env.usersVaultContract.afterRoundBalance()).equals(
        valuation
      );
    });

    describe("Reverts", () => {
      it("Should revert in case not allowed caller", async () => {
        const env = await loadFixture(prepareEnv);

        await expect(
          env.usersVaultContract.rolloverFromTrader()
        ).revertedWithCustomError(env.usersVaultContract, "UserNotAllowed");
      });

      it("Should revert in case there are no deposits and no deposits and no withdrawals", async () => {
        const env = await loadFixture(prepareEnv);

        await expect(
          env.traderWalletMockContract.callRolloverInVault()
        ).revertedWithCustomError(env.usersVaultContract, "InvalidRollover");
      });

      it("If there are not enough funds for reserves after rollover", async () => {
        const env = await loadFixture(prepareEnv);

        const firstDepositAmount = AMOUNT_1E18.mul(10);
        const secondDepositAmount = AMOUNT_1E18.mul(50);
        await env.underlyingTokenContract.mint(
          env.alice.address,
          firstDepositAmount.add(secondDepositAmount)
        );
        await env.underlyingTokenContract
          .connect(env.alice)
          .approve(
            env.usersVaultContract.address,
            firstDepositAmount.add(secondDepositAmount)
          );

        await env.contractsFactoryContract.setReturnValue(true);

        await env.usersVaultContract
          .connect(env.alice)
          .userDeposit(firstDepositAmount);

        await callRolloverInVault(env);

        await env.usersVaultContract.connect(env.alice).claim();

        const firstBalance = await env.usersVaultContract.balanceOf(
          env.alice.address
        );

        await env.usersVaultContract
          .connect(env.alice)
          .withdrawRequest(firstBalance);

        const profitAmount = AMOUNT_1E18.mul(30);
        await env.underlyingTokenContract.mint(
          env.usersVaultContract.address,
          profitAmount
        );

        await callRolloverInVault(env);

        await env.usersVaultContract
          .connect(env.alice)
          .userDeposit(secondDepositAmount);

        // on the contract there are:
        // profitAmount * 10% is kunji fees = AMOUNT_1E18.mul(3);
        // processedWithdrawAssets = firstDepositAmount + profit - kunji fees
        // pending deposits = secondDepositAmount

        // if we burn 1 wei rollover should revert

        await env.underlyingTokenContract.burnFrom(
          env.usersVaultContract.address,
          1
        );

        const neededBalance = profitAmount
          .add(firstDepositAmount)
          .add(secondDepositAmount);

        await expect(callRolloverInVault(env))
          .revertedWithCustomError(
            env.usersVaultContract,
            "NotEnoughReservedAssets"
          )
          .withArgs(neededBalance.sub(1), neededBalance);
      });
    });
  });

  describe("Owner functions", () => {
    describe("{setAdapterAllowanceOnToken} function", () => {
      it("Should make changes to the storage when approving", async () => {
        const env = await loadFixture(prepareEnv);

        await env.usersVaultContract
          .connect(env.owner)
          .setAdapterAllowanceOnToken(
            env.protocolId,
            env.underlyingTokenContract.address,
            false
          );

        expect(
          await env.underlyingTokenContract.allowance(
            env.usersVaultContract.address,
            env.adapterMockContract.address
          )
        ).equals(ethers.constants.MaxUint256);

        await env.usersVaultContract
          .connect(env.owner)
          .setAdapterAllowanceOnToken(
            env.protocolId,
            env.underlyingTokenContract.address,
            true
          );

        expect(
          await env.underlyingTokenContract.allowance(
            env.usersVaultContract.address,
            env.adapterMockContract.address
          )
        ).equals(0);
      });

      it("Should be ok in case there is no return value from approve function", async () => {
        const env = await loadFixture(prepareEnv);

        await env.underlyingTokenContract.setNeedToReturnValue(false);

        await env.usersVaultContract
          .connect(env.owner)
          .setAdapterAllowanceOnToken(
            env.protocolId,
            env.underlyingTokenContract.address,
            false
          );

        expect(
          await env.underlyingTokenContract.allowance(
            env.usersVaultContract.address,
            env.adapterMockContract.address
          )
        ).equals(ethers.constants.MaxUint256);
      });

      it("Should be ok in case there is safe approve in the token", async () => {
        const env = await loadFixture(prepareEnv);

        await env.underlyingTokenContract.setIsSafeApprove(true);

        await env.usersVaultContract
          .connect(env.owner)
          .setAdapterAllowanceOnToken(
            env.protocolId,
            env.underlyingTokenContract.address,
            false
          );

        await env.usersVaultContract
          .connect(env.owner)
          .setAdapterAllowanceOnToken(
            env.protocolId,
            env.underlyingTokenContract.address,
            false
          );

        expect(
          await env.underlyingTokenContract.allowance(
            env.usersVaultContract.address,
            env.adapterMockContract.address
          )
        ).equals(ethers.constants.MaxUint256);
      });

      describe("Reverts", () => {
        it("Should revert when token returns false on approve", async () => {
          const env = await loadFixture(prepareEnv);

          await env.underlyingTokenContract.setReturnBoolValue(false);

          await expect(
            env.usersVaultContract
              .connect(env.owner)
              .setAdapterAllowanceOnToken(
                env.protocolId,
                env.underlyingTokenContract.address,
                false
              )
          ).revertedWith("SafeERC20: ERC20 operation did not succeed");
        });

        it("Should revert when calls not owner", async () => {
          const env = await loadFixture(prepareEnv);

          await expect(
            env.usersVaultContract
              .connect(env.deployer)
              .setAdapterAllowanceOnToken(
                env.protocolId,
                env.underlyingTokenContract.address,
                true
              )
          ).revertedWith("Ownable: caller is not the owner");

          await expect(
            env.usersVaultContract
              .connect(env.alice)
              .setAdapterAllowanceOnToken(
                env.protocolId,
                env.underlyingTokenContract.address,
                true
              )
          ).revertedWith("Ownable: caller is not the owner");
        });

        it("Should revert when protocolId is not allowed", async () => {
          const env = await loadFixture(prepareEnv);

          await expect(
            env.usersVaultContract
              .connect(env.owner)
              .setAdapterAllowanceOnToken(
                env.protocolId + 1,
                env.underlyingTokenContract.address,
                true
              )
          ).revertedWithCustomError(env.usersVaultContract, "InvalidProtocol");
        });

        it("Should revert when token is not allowed", async () => {
          const env = await loadFixture(prepareEnv);

          await expect(
            env.usersVaultContract
              .connect(env.owner)
              .setAdapterAllowanceOnToken(
                env.protocolId,
                env.usersVaultContract.address,
                true
              )
          ).revertedWithCustomError(env.usersVaultContract, "InvalidToken");
        });

        it("Should revert when AdaptersRegistry returns false", async () => {
          const env = await loadFixture(prepareEnv);

          await env.adaptersRegistryMockContract.setReturnValue(false);

          await expect(
            env.usersVaultContract
              .connect(env.owner)
              .setAdapterAllowanceOnToken(
                env.protocolId,
                env.underlyingTokenContract.address,
                true
              )
          ).revertedWithCustomError(env.usersVaultContract, "InvalidAdapter");
        });

        it("Should revert when AdaptersRegistry returns zero address", async () => {
          const env = await loadFixture(prepareEnv);

          await env.adaptersRegistryMockContract.setReturnAddress(ZERO_ADDRESS);

          await expect(
            env.usersVaultContract
              .connect(env.owner)
              .setAdapterAllowanceOnToken(
                env.protocolId,
                env.underlyingTokenContract.address,
                true
              )
          ).revertedWithCustomError(env.usersVaultContract, "InvalidAdapter");
        });
      });
    });
  });
});

async function prepareEnv() {
  const [deployer, owner, alice, ...otherSigners] = await ethers.getSigners();

  const sharesName = "SharesName";
  const sharesSymbol = "SharesSymbol";

  const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
  const underlyingTokenContract = await ERC20MockFactory.deploy(
    "Name",
    "Symbol",
    18
  );

  const TraderWalletMockFactory = await ethers.getContractFactory(
    "TraderWalletMock"
  );
  const traderWalletMockContract = await TraderWalletMockFactory.deploy();

  const ContractsFactoryMockFactory = await ethers.getContractFactory(
    "ContractsFactoryMock"
  );
  const contractsFactoryContract = await ContractsFactoryMockFactory.deploy();

  const DynamicValuationMockFactory = await ethers.getContractFactory(
    "DynamicValuationMock"
  );
  const dynamicValuationContract = await DynamicValuationMockFactory.deploy(0);
  const tokenPrice = AMOUNT_1E30.mul(10);
  await dynamicValuationContract.setOraclePrice(tokenPrice);

  await contractsFactoryContract.setDynamicValuationAddress(
    dynamicValuationContract.address
  );

  const GMXAdapterFactory = await ethers.getContractFactory("GMXAdapter");
  const GMXAdapterContract = await GMXAdapterFactory.deploy();

  const UsersVaultFactory = await ethers.getContractFactory("UsersVaultTest", {
    libraries: {
      GMXAdapter: GMXAdapterContract.address,
    },
  });
  const usersVaultProxy = await upgrades.deployProxy(
    UsersVaultFactory,
    [
      underlyingTokenContract.address,
      traderWalletMockContract.address,
      owner.address,
      sharesName,
      sharesSymbol,
    ],
    {
      initializer: "initialize",
      unsafeAllowLinkedLibraries: true,
    }
  );
  const usersVaultContract = UsersVaultFactory.attach(usersVaultProxy.address);
  await usersVaultContract.setContractsFactoryAddress(
    contractsFactoryContract.address
  );

  await traderWalletMockContract.setUsersVault(usersVaultContract.address);

  const AdaptersRegistryMockFactory = await ethers.getContractFactory(
    "AdaptersRegistryMock"
  );
  const adaptersRegistryMockContract =
    await AdaptersRegistryMockFactory.deploy();
  await adaptersRegistryMockContract.initialize();
  await contractsFactoryContract.setAdaptersRegistryAddress(
    adaptersRegistryMockContract.address
  );

  const AdapterMockFactory = await ethers.getContractFactory("AdapterMock");
  const adapterMockContract = await AdapterMockFactory.deploy();
  await adaptersRegistryMockContract.setReturnAddress(
    adapterMockContract.address
  );
  await adaptersRegistryMockContract.setReturnValue(true);

  await traderWalletMockContract.setIsAllowedTradeToken(
    underlyingTokenContract.address,
    true
  );
  const protocolId = 1;
  await traderWalletMockContract.setIsTraderSelectedProtocol(protocolId, true);

  return {
    deployer,
    owner,
    alice,
    otherSigners,

    underlyingTokenContract,
    traderWalletMockContract,

    contractsFactoryContract,
    dynamicValuationContract,
    tokenPrice,

    adaptersRegistryMockContract,
    adapterMockContract,
    protocolId,

    sharesName,
    sharesSymbol,

    UsersVaultFactory,
    usersVaultProxy,
    usersVaultContract,
  };
}

async function callRolloverInVault(
  env: Awaited<ReturnType<typeof prepareEnv>>,
  tokenPrice?: BigNumber
) {
  const balance = await env.underlyingTokenContract.balanceOf(
    env.usersVaultContract.address
  );

  if (tokenPrice) {
    await env.dynamicValuationContract.setValuation(
      balance.mul(tokenPrice).div(AMOUNT_1E18)
    );
    await env.dynamicValuationContract.setOraclePrice(tokenPrice);
  } else {
    await env.dynamicValuationContract.setValuation(
      balance.mul(env.tokenPrice).div(AMOUNT_1E18)
    );
    await env.dynamicValuationContract.setOraclePrice(env.tokenPrice);
  }

  return env.traderWalletMockContract.callRolloverInVault();
}
