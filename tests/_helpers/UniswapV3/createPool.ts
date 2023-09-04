// import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers, upgrades } from "hardhat";
import {
  IUniswapV3Pool,
  IUniswapV3Factory,
  INonfungiblePositionManager,
  ERC20Mock,
} from "../../../typechain-types";
import { BigNumber, utils } from "ethers";
import { uniswap } from "../../../tests/_helpers/arbitrumAddresses";

export async function createPool(token0: string, token1: string, fee: number) {
  const factory = (await ethers.getContractAt(
    "IUniswapV3Factory",
    uniswap.factoryAddress
  )) as IUniswapV3Factory;
  const newPool = await factory.createPool(token0, token1, fee);
  return newPool;
}

export async function initializePool(
  poolAddress: string,
  initialSqrtPrice: BigNumber
) {
  const pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
  await pool.initialize(initialSqrtPrice);
}

export async function addLiquidity(
  token0: string,
  token1: string,
  tickLower: number,
  tickUpper: number,
  fee: number,
  amount0Desired: BigNumber,
  amount1Desired: BigNumber
) {
  const [deployer] = await ethers.getSigners();
  const positionManager = await ethers.getContractAt(
    "INonfungiblePositionManager",
    uniswap.positionManagerAddress
  );

  const token0Contract = (await ethers.getContractAt(
    "ERC20Mock",
    token0
  )) as ERC20Mock;
  await token0Contract
    .connect(deployer)
    .approve(positionManager.address, amount0Desired);

  const token1Contract = (await ethers.getContractAt(
    "ERC20Mock",
    token1
  )) as ERC20Mock;
  await token1Contract
    .connect(deployer)
    .approve(positionManager.address, amount1Desired);

  const deadline = 1911000000;
  const amountMin = BigNumber.from(1);
  let mintParams = {
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: amountMin,
    amount1Min: amountMin,
    recipient: deployer.address,
    deadline,
  };

  await positionManager.connect(deployer).mint(mintParams);
}
