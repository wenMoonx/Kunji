import { ethers } from "hardhat";
import { ERC20Mock } from "../../../typechain-types";

export async function deployERC20(
  name: string,
  symbol: string,
  decimals: number
): Promise<ERC20Mock> {
  const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
  const erc20MockContract = await ERC20MockFactory.deploy(
    name,
    symbol,
    decimals
  );
  if (erc20MockContract === undefined)
    throw new Error("erc20MockContract NOT deployed.");
  await erc20MockContract.deployed();

  return erc20MockContract as ERC20Mock;
}
