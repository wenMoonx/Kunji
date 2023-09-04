import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";

import { AMOUNT_1E18, ZERO_ADDRESS, ONE_DAY, TEN } from "../_helpers/constants";

describe("DynamicValuation Tests", () => {
  it("Test prepEnv", async () => {
    const env = await loadFixture(prepEnv);

    // check ownership

    expect(await env.dynamicValuationContract.owner()).equals(
      env.owner.address
    );
    expect(await env.contractsFactoryContract.owner()).equals(
      env.owner.address
    );

    // check public variables

    expect(await env.dynamicValuationContract.factory()).equals(
      env.contractsFactoryContract.address
    );
    expect(await env.contractsFactoryContract.dynamicValuationAddress()).equals(
      env.dynamicValuationContract.address
    );

    expect(await env.dynamicValuationContract.sequencerUptimeFeed()).equals(
      env.sequencerUptimeFeedContract.address
    );
    expect(await env.dynamicValuationContract.gmxObserver()).equals(
      env.observerContract.address
    );
  });

  describe("{initialize} function", () => {
    it("Should emit event", async () => {
      const env = await loadFixture(prepEnv);

      await expect(env.dynamicValuationProxy.deployTransaction)
        .emit(env.dynamicValuationContract, "SetGmxObserver")
        .withArgs(env.observerContract.address);
    });

    describe("Reverts", () => {
      it("Implementation's {initialize} function should be locked", async () => {
        const env = await loadFixture(prepEnv);

        const dynamicValuationContract =
          await env.DynamicValuationFactory.deploy();

        await expect(
          dynamicValuationContract.initialize(
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS
          )
        ).revertedWith("Initializable: contract is already initialized");
      });

      it("Should revert when call {initialize} function twice", async () => {
        const env = await loadFixture(prepEnv);

        await expect(
          env.dynamicValuationContract.initialize(
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            ZERO_ADDRESS
          )
        ).revertedWith("Initializable: contract is already initialized");
      });
    });
  });

  describe("{setChainlinkPriceFeed} function", () => {
    it("Should make changes to the storage", async () => {
      const env = await loadFixture(prepEnvWithOracle);

      const oracleData = await env.dynamicValuationContract.chainlinkOracles(
        env.tokenContract.address
      );
      expect(oracleData.dataFeed).equals(env.oracleContract.address);
      expect(oracleData.dataFeedDecimals).equals(
        await env.oracleContract.decimals()
      );
      expect(oracleData.heartbeat).equals(env.oracleHeartbeat);
      expect(oracleData.tokenDecimals).equals(
        await env.tokenContract.decimals()
      );
    });

    it("Should emit event", async () => {
      const env = await loadFixture(prepEnvWithOracle);

      await expect(env.setOracleTx)
        .emit(env.dynamicValuationContract, "SetChainlinkOracle")
        .withArgs(env.tokenContract.address, [
          env.oracleContract.address, // dataFeed
          await env.oracleContract.decimals(), // dataFeedDecimals
          env.oracleHeartbeat, // heartbeat
          await env.tokenContract.decimals(), // tokenDecimals
        ]);
    });

    describe("Reverts", () => {
      it("Should revert when not allowed user", async () => {
        const env = await loadFixture(prepEnv);

        // random user
        await expect(
          env.dynamicValuationContract
            .connect(env.alice)
            .setChainlinkPriceFeed(ZERO_ADDRESS, ZERO_ADDRESS, 0)
        ).revertedWith("Ownable: caller is not the owner");

        // deployer (ownership transferred)
        await expect(
          env.dynamicValuationContract
            .connect(env.deployer)
            .setChainlinkPriceFeed(ZERO_ADDRESS, ZERO_ADDRESS, 0)
        ).revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("{setGmxObserver} function", () => {
    it("Should make changes to the storage", async () => {
      const env = await loadFixture(prepEnv);

      await env.dynamicValuationContract
        .connect(env.owner)
        .setGmxObserver(env.alice.address);

      expect(await env.dynamicValuationContract.gmxObserver()).equals(
        env.alice.address
      );
    });

    it("Should emit event", async () => {
      const env = await loadFixture(prepEnv);

      await expect(
        env.dynamicValuationContract
          .connect(env.owner)
          .setGmxObserver(env.alice.address)
      )
        .emit(env.dynamicValuationContract, "SetGmxObserver")
        .withArgs(env.alice.address);
    });

    describe("Reverts", () => {
      it("Should revert when not allowed user", async () => {
        const env = await loadFixture(prepEnv);

        // random user
        await expect(
          env.dynamicValuationContract
            .connect(env.alice)
            .setGmxObserver(ZERO_ADDRESS)
        ).revertedWith("Ownable: caller is not the owner");

        // deployer (ownership transferred)
        await expect(
          env.dynamicValuationContract
            .connect(env.deployer)
            .setGmxObserver(ZERO_ADDRESS)
        ).revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("{getDynamicValuation} function", () => {
    describe("In case there is zero valuation with one allowed token", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        expect(
          await env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        ).equals(0);
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        expect(
          await env.dynamicValuationContract.getDynamicValuation(
            env.usersVaultContract.address
          )
        ).equals(0);
      });
    });

    it("In case there is no observer", async () => {
      const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

      await env.dynamicValuationContract
        .connect(env.owner)
        .setGmxObserver(ZERO_ADDRESS);

      expect(
        await env.dynamicValuationContract.getDynamicValuation(
          env.traderWalletContract.address
        )
      ).equals(0);
    });

    it("In case there is no sequencer", async () => {
      const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

      const newDynamicValuationProxy = await upgrades.deployProxy(
        env.DynamicValuationFactory,
        [
          env.contractsFactoryContract.address,
          ZERO_ADDRESS,
          env.observerContract.address,
        ]
      );
      const newDynamicValuationContract = env.DynamicValuationFactory.attach(
        newDynamicValuationProxy.address
      );

      await newDynamicValuationContract.setChainlinkPriceFeed(
        env.tokenContract.address,
        env.oracleContract.address,
        env.oracleHeartbeat
      );

      expect(
        await newDynamicValuationContract.getDynamicValuation(
          env.traderWalletContract.address
        )
      ).equals(0);
    });

    describe("In case there is zero valuation with zero allowed token", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVault);

        expect(
          await env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        ).equals(0);
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVault);

        expect(
          await env.dynamicValuationContract.getDynamicValuation(
            env.usersVaultContract.address
          )
        ).equals(0);
      });
    });

    describe("In case oracleDecimals + tokenDecimals < dynamicValuationDecimals", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const oracleDecimals = env.dynamicValuationDecimals.div(2);
        const tokenDecimals = oracleDecimals.sub(1);
        expect(oracleDecimals).greaterThan(0);
        expect(tokenDecimals).greaterThan(0);
        expect(oracleDecimals.add(tokenDecimals)).lessThan(
          env.dynamicValuationDecimals
        );

        await testValuationWithAddress(
          env,
          env.traderWalletContract.address,
          oracleDecimals,
          tokenDecimals,
          env.observerDecimals
        );
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const oracleDecimals = env.dynamicValuationDecimals.div(2);
        const tokenDecimals = oracleDecimals.sub(1);
        expect(oracleDecimals).greaterThan(0);
        expect(tokenDecimals).greaterThan(0);
        expect(oracleDecimals.add(tokenDecimals)).lessThan(
          env.dynamicValuationDecimals
        );

        await testValuationWithAddress(
          env,
          env.usersVaultContract.address,
          oracleDecimals,
          tokenDecimals,
          env.observerDecimals
        );
      });
    });

    describe("In case oracleDecimals + tokenDecimals == dynamicValuationDecimals", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const oracleDecimals = env.dynamicValuationDecimals.div(2);
        const tokenDecimals = env.dynamicValuationDecimals.sub(oracleDecimals);
        expect(oracleDecimals).greaterThan(0);
        expect(tokenDecimals).greaterThan(0);
        expect(oracleDecimals.add(tokenDecimals)).equals(
          env.dynamicValuationDecimals
        );

        await testValuationWithAddress(
          env,
          env.traderWalletContract.address,
          oracleDecimals,
          tokenDecimals,
          env.observerDecimals
        );
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const oracleDecimals = env.dynamicValuationDecimals.div(2);
        const tokenDecimals = env.dynamicValuationDecimals.sub(oracleDecimals);
        expect(oracleDecimals).greaterThan(0);
        expect(tokenDecimals).greaterThan(0);
        expect(oracleDecimals.add(tokenDecimals)).equals(
          env.dynamicValuationDecimals
        );

        await testValuationWithAddress(
          env,
          env.usersVaultContract.address,
          oracleDecimals,
          tokenDecimals,
          env.observerDecimals
        );
      });
    });

    describe("In case oracleDecimals + tokenDecimals > dynamicValuationDecimals", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const oracleDecimals = env.dynamicValuationDecimals;
        const tokenDecimals = env.dynamicValuationDecimals.add(1);
        expect(oracleDecimals).greaterThan(0);
        expect(tokenDecimals).greaterThan(0);
        expect(oracleDecimals.add(tokenDecimals)).greaterThan(
          env.dynamicValuationDecimals
        );

        await testValuationWithAddress(
          env,
          env.traderWalletContract.address,
          oracleDecimals,
          tokenDecimals,
          env.observerDecimals
        );
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const oracleDecimals = env.dynamicValuationDecimals;
        const tokenDecimals = env.dynamicValuationDecimals.add(1);
        expect(oracleDecimals).greaterThan(0);
        expect(tokenDecimals).greaterThan(0);
        expect(oracleDecimals.add(tokenDecimals)).greaterThan(
          env.dynamicValuationDecimals
        );

        await testValuationWithAddress(
          env,
          env.usersVaultContract.address,
          oracleDecimals,
          tokenDecimals,
          env.observerDecimals
        );
      });
    });

    describe("In case observerDecimals < dynamicValuationDecimals", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const observerDecimals = env.dynamicValuationDecimals.div(2);
        expect(observerDecimals).greaterThan(0);
        expect(observerDecimals).lessThan(env.dynamicValuationDecimals);

        await testValuationWithAddress(
          env,
          env.traderWalletContract.address,
          env.oracleDecimals,
          env.tokenDecimals,
          observerDecimals
        );
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const observerDecimals = env.dynamicValuationDecimals.div(2);
        expect(observerDecimals).greaterThan(0);
        expect(observerDecimals).lessThan(env.dynamicValuationDecimals);

        await testValuationWithAddress(
          env,
          env.usersVaultContract.address,
          env.oracleDecimals,
          env.tokenDecimals,
          observerDecimals
        );
      });
    });

    describe("In case observerDecimals == dynamicValuationDecimals", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const observerDecimals = env.dynamicValuationDecimals;

        await testValuationWithAddress(
          env,
          env.traderWalletContract.address,
          env.oracleDecimals,
          env.tokenDecimals,
          observerDecimals
        );
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const observerDecimals = env.dynamicValuationDecimals;

        await testValuationWithAddress(
          env,
          env.usersVaultContract.address,
          env.oracleDecimals,
          env.tokenDecimals,
          observerDecimals
        );
      });
    });

    describe("In case observerDecimals > dynamicValuationDecimals", () => {
      it("With traderWallet", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const observerDecimals = env.dynamicValuationDecimals.mul(2);
        expect(observerDecimals).greaterThan(0);
        expect(observerDecimals).greaterThan(env.dynamicValuationDecimals);

        await testValuationWithAddress(
          env,
          env.traderWalletContract.address,
          env.oracleDecimals,
          env.tokenDecimals,
          observerDecimals
        );
      });

      it("With usersVault", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const observerDecimals = env.dynamicValuationDecimals.mul(2);
        expect(observerDecimals).greaterThan(0);
        expect(observerDecimals).greaterThan(env.dynamicValuationDecimals);

        await testValuationWithAddress(
          env,
          env.usersVaultContract.address,
          env.oracleDecimals,
          env.tokenDecimals,
          observerDecimals
        );
      });
    });

    describe("Reverts", () => {
      it("Should revert when not wallet and vault", async () => {
        const env = await loadFixture(prepEnvWithOracle);

        await expect(
          env.dynamicValuationContract.getDynamicValuation(env.alice.address)
        ).revertedWithCustomError(env.dynamicValuationContract, "WrongAddress");
      });

      it("Should revert when sequencerUptimeFeed is down", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVault);

        await env.sequencerUptimeFeedContract.setAnswer(1); // is down

        await expect(
          env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        ).revertedWithCustomError(
          env.dynamicValuationContract,
          "SequencerDown"
        );
      });

      it("Should revert when sequencerUptimeFeed's grace period hasn't passed", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVault);

        const block = await ethers.provider.getBlock("latest");
        const timestamp = block.timestamp;

        await env.sequencerUptimeFeedContract.setStartedAt(timestamp); // is down

        await expect(
          env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        ).revertedWithCustomError(
          env.dynamicValuationContract,
          "GracePeriodNotOver"
        );
      });

      it("Should revert when there is no oracle for a token", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        // delete chainlink oracle for token
        await env.dynamicValuationContract
          .connect(env.owner)
          .setChainlinkPriceFeed(env.tokenContract.address, ZERO_ADDRESS, 0);

        await expect(
          env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        )
          .revertedWithCustomError(
            env.dynamicValuationContract,
            "NoOracleForToken"
          )
          .withArgs(env.tokenContract.address);
      });

      it("Should revert when price lower zero or zero", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        await env.oracleContract.setAnswer(-1);

        await expect(
          env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        ).revertedWithCustomError(env.dynamicValuationContract, "BadPrice");

        await env.oracleContract.setAnswer(0);

        await expect(
          env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        ).revertedWithCustomError(env.dynamicValuationContract, "BadPrice");
      });

      it("Should revert when price is too old", async () => {
        const env = await loadFixture(prepEnvWithOracleWalletVaultAndAllowed);

        const block = await ethers.provider.getBlock("latest");
        const timestamp = BigNumber.from(block.timestamp);
        await env.oracleContract.setUpdatedAt(
          timestamp.sub(env.oracleHeartbeat)
        );

        await expect(
          env.dynamicValuationContract.getDynamicValuation(
            env.traderWalletContract.address
          )
        ).revertedWithCustomError(env.dynamicValuationContract, "TooOldPrice");
      });
    });
  });
});

async function prepEnv() {
  const [deployer, feeReceiver, owner, alice, ...otherSigners] =
    await ethers.getSigners();

  const GMXAdapterFactory = await ethers.getContractFactory("GMXAdapter");
  const GMXAdapterContract = await GMXAdapterFactory.deploy();

  const TraderWalletFactory = await ethers.getContractFactory("TraderWallet", {
    libraries: {
      GMXAdapter: GMXAdapterContract.address,
    },
  });
  const traderWalletImplementation = await TraderWalletFactory.deploy();

  const UsersVaultFactory = await ethers.getContractFactory("UsersVault", {
    libraries: {
      GMXAdapter: GMXAdapterContract.address,
    },
  });
  const usersVaultImplementation = await UsersVaultFactory.deploy();

  const feeRate = AMOUNT_1E18.div(10); // 10%
  const ContractsFactoryFactory = await ethers.getContractFactory(
    "ContractsFactory"
  );
  const contractsFactoryProxy = await upgrades.deployProxy(
    ContractsFactoryFactory,
    [
      feeRate,
      feeReceiver.address,
      traderWalletImplementation.address,
      usersVaultImplementation.address,
    ],
    {
      initializer: "initialize",
    }
  );
  const contractsFactoryContract = ContractsFactoryFactory.attach(
    contractsFactoryProxy.address
  );

  const AdaptersRegistryFactory = await ethers.getContractFactory(
    "AdaptersRegistryMock"
  );
  const adaptersRegistryContract = await AdaptersRegistryFactory.deploy();
  await adaptersRegistryContract.initialize();
  await adaptersRegistryContract.setReturnValue(true);

  const UniswapAdapterMockFactory = await ethers.getContractFactory(
    "UniswapAdapterMock"
  );
  const uniswapAdapterMockContract = await UniswapAdapterMockFactory.deploy();
  await adaptersRegistryContract.setReturnAddress(
    uniswapAdapterMockContract.address
  );

  await contractsFactoryContract.setAdaptersRegistryAddress(
    adaptersRegistryContract.address
  );

  const ObserverFactory = await ethers.getContractFactory("ObserverMock");
  const observerContract = await ObserverFactory.deploy();
  const observerDecimals = BigNumber.from(30);
  await observerContract.setDecimals(observerDecimals);

  const SequencerUptimeFeedFactory = await ethers.getContractFactory(
    "SequencerUptimeFeedMock"
  );
  const sequencerUptimeFeedContract = await SequencerUptimeFeedFactory.deploy();

  const DynamicValuationFactory = await ethers.getContractFactory(
    "DynamicValuation"
  );
  const dynamicValuationProxy = await upgrades.deployProxy(
    DynamicValuationFactory,
    [
      contractsFactoryContract.address,
      sequencerUptimeFeedContract.address,
      observerContract.address,
    ],
    {
      initializer: "initialize",
    }
  );
  const dynamicValuationContract = DynamicValuationFactory.attach(
    dynamicValuationProxy.address
  );
  await dynamicValuationContract.transferOwnership(owner.address);

  const dynamicValuationDecimals = BigNumber.from(
    await dynamicValuationContract.decimals()
  );

  await contractsFactoryContract.setDynamicValuationAddress(
    dynamicValuationContract.address
  );
  await contractsFactoryContract.transferOwnership(owner.address);

  return {
    deployer,
    owner,
    alice,
    otherSigners,

    GMXAdapterContract,

    feeRate,
    contractsFactoryContract,

    observerContract,
    observerDecimals,
    sequencerUptimeFeedContract,

    DynamicValuationFactory,
    dynamicValuationProxy,
    dynamicValuationContract,

    dynamicValuationDecimals,
  };
}

async function prepEnvWithOracle() {
  const prevEnv = await loadFixture(prepEnv);

  const ERC20Facotry = await ethers.getContractFactory("ERC20Mock");
  const tokenDecimals = BigNumber.from(16);
  const oneToken = TEN.pow(tokenDecimals);
  const tokenContract = await ERC20Facotry.deploy(
    "Name",
    "Symbol",
    tokenDecimals
  );

  const oracleFactory = await ethers.getContractFactory("ChainlinkOracleMock");
  const oracleContract = await oracleFactory.deploy();

  const oracleDecimals = BigNumber.from(25);
  await oracleContract.setDecimals(oracleDecimals);

  const oracleHeartbeat = ONE_DAY;
  const oracleAnswer = TEN.pow(oracleDecimals).mul(100); // 100 USD
  await oracleContract.setAnswer(oracleAnswer);

  const latestBlock = await ethers.provider.getBlock("latest");
  const latestTimestamp = BigNumber.from(latestBlock.timestamp);
  await oracleContract.setUpdatedAt(latestTimestamp);

  const setOracleTx = await prevEnv.dynamicValuationContract
    .connect(prevEnv.owner)
    .setChainlinkPriceFeed(
      tokenContract.address,
      oracleContract.address,
      oracleHeartbeat
    );

  return {
    ...prevEnv,

    tokenContract,
    tokenDecimals,
    oneToken,

    oracleContract,
    oracleDecimals,
    oracleHeartbeat,
    oracleAnswer,
    setOracleTx,
  };
}

async function prepEnvWithOracleWalletVault() {
  const prevEnv = await loadFixture(prepEnvWithOracle);

  const [trader, ...otherSigners] = prevEnv.otherSigners;
  prevEnv.otherSigners = otherSigners;

  await prevEnv.contractsFactoryContract
    .connect(prevEnv.owner)
    .addTrader(trader.address);

  await prevEnv.contractsFactoryContract
    .connect(prevEnv.owner)
    .addGlobalAllowedTokens([prevEnv.tokenContract.address]);

  await prevEnv.contractsFactoryContract
    .connect(prevEnv.owner)
    .deployTraderWallet(
      prevEnv.tokenContract.address,
      trader.address,
      prevEnv.owner.address
    );
  const traderWalletFactory = await ethers.getContractFactory("TraderWallet", {
    libraries: {
      GMXAdapter: prevEnv.GMXAdapterContract.address,
    },
  });
  const traderWalletContract = traderWalletFactory.attach(
    await prevEnv.contractsFactoryContract.traderWalletsArray(0)
  );

  await prevEnv.contractsFactoryContract
    .connect(prevEnv.owner)
    .deployUsersVault(
      traderWalletContract.address,
      prevEnv.owner.address,
      "Shares name",
      "Shares symbol"
    );
  const usersVaultFactory = await ethers.getContractFactory("UsersVault", {
    libraries: {
      GMXAdapter: prevEnv.GMXAdapterContract.address,
    },
  });
  const usersVaultContract = usersVaultFactory.attach(
    await prevEnv.contractsFactoryContract.usersVaultsArray(0)
  );

  return {
    ...prevEnv,

    trader,
    traderWalletContract,
    usersVaultContract,
  };
}

async function prepEnvWithOracleWalletVaultAndAllowed() {
  const prevEnv = await loadFixture(prepEnvWithOracleWalletVault);

  await prevEnv.contractsFactoryContract
    .connect(prevEnv.owner)
    .addGlobalAllowedTokens([prevEnv.tokenContract.address]);

  await prevEnv.traderWalletContract
    .connect(prevEnv.trader)
    .addAllowedTradeTokens([prevEnv.tokenContract.address]);

  return {
    ...prevEnv,
  };
}

async function testValuationWithAddress(
  env: Awaited<ReturnType<typeof prepEnvWithOracleWalletVaultAndAllowed>>,
  contractAddress: string,
  oracleDecimals: BigNumber,
  tokenDecimals: BigNumber,
  observerDecimals: BigNumber
) {
  const oneToken = TEN.pow(tokenDecimals);

  await env.oracleContract.setDecimals(oracleDecimals);
  await env.tokenContract.setDecimals(tokenDecimals);
  await env.observerContract.setDecimals(observerDecimals);

  await env.dynamicValuationContract
    .connect(env.owner)
    .setChainlinkPriceFeed(
      env.tokenContract.address,
      env.oracleContract.address,
      env.oracleHeartbeat
    );

  const contractBalance = TEN;
  await env.tokenContract.mint(contractAddress, oneToken.mul(contractBalance));

  const oraclePrice = BigNumber.from(250);
  await env.oracleContract.setAnswer(TEN.pow(oracleDecimals).mul(oraclePrice));

  const observerUSDBalance = BigNumber.from(45);
  await env.observerContract.setReturnValue(
    TEN.pow(observerDecimals).mul(observerUSDBalance)
  );

  const result = await env.dynamicValuationContract.getDynamicValuation(
    contractAddress
  );

  expect(result).equals(
    contractBalance
      .mul(oraclePrice)
      .add(observerUSDBalance)
      .mul(TEN.pow(env.dynamicValuationDecimals))
  );
}
