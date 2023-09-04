import { BigNumber, constants } from "ethers";

export const AMOUNT_1E30 = BigNumber.from(10).pow(30);
export const AMOUNT_1E18 = BigNumber.from(10).pow(18);
export const AMOUNT_1E6 = BigNumber.from(10).pow(6);

export const ZERO_AMOUNT = constants.Zero;
export const ZERO_ADDRESS = constants.AddressZero;
export const TEST_TIMEOUT = 100000;
export const INITIAL_SUPPLY_USDC = AMOUNT_1E6.mul(1000); // 1000 usdc

export const ONE_MINUTE = 60;
export const ONE_HOUR = ONE_MINUTE * 60;
export const ONE_DAY = ONE_HOUR * 24;
export const ONE_MONTH = ONE_DAY * 30;

export const TEN = BigNumber.from(10);
