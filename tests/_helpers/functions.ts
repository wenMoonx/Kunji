// import { ethers } from "hardhat";
import { Signer, BigNumber, Contract, utils, ContractReceipt } from "ethers";

export const mintForUsers = async (
  _userAddresses: Array<string>,
  _tokenContract: Contract,
  _amount: BigNumber,
  _times: number
) => {
  for (let i = 0; i < _times; i++) {
    await _tokenContract.mint(_userAddresses[i], _amount);
  }
};

export const approveForUsers = async (
  _user: Array<Signer>,
  _tokenContract: Contract,
  _amount: BigNumber,
  _spenderAddress: string,
  _times: number
) => {
  for (let i = 0; i < _times; i++) {
    await _tokenContract.connect(_user[i]).approve(_spenderAddress, _amount);
  }
};

export const usersDeposit = async (
  _contract: Contract,
  _user: Array<Signer>,
  _amount: BigNumber,
  _times: number
) => {
  for (let i = 0; i < _times; i++) {
    await _contract.connect(_user[i]).userDeposit(_amount.mul(i + 1));
  }
};

export const claimShares = async (
  _contract: Contract,
  _user: Array<Signer>,
  _amount: BigNumber,
  _times: number
) => {
  for (let i = 0; i < _times; i++) {
    await _contract.connect(_user[i]).claim();
  }
};

export const decodeEvent = async (
  _abi: string[],
  _signature: string,
  _txReceipt: ContractReceipt
) => {
  const iface = new utils.Interface(_abi);
  const eventTopic = iface.getEventTopic(_signature);

  const eventObject = _txReceipt.events?.find(
    (event) => event.topics[0] === eventTopic
  );

  const data = eventObject?.data || "";
  const topics = eventObject?.topics || [];

  const decodedEvent = iface.parseLog({ data, topics });

  return decodedEvent;
};
