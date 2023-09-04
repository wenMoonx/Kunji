import { BigNumber } from "ethers";
// import { tokens } from "../../tests/_helpers/arbitrumAddresses";

// arbitrum
export const USD_FEEDS = {
  wbtc: "0xd0C7101eACbB49F3deCcCc166d238410D6D46d57",
  weth: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  link: "0x86E53CF1B870786351Da77A57575e79CB55812CB",
  usdt: "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7",
  usdc: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
  frax: "0x0809E3d38d1B4214958faf06D8b1B1a2b73f2ab8",
  uni: "0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720",
  dai: "0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB",
};

// goerli eth
// export const USD_FEEDS = {
//   usdc: "0xAb5c49580294Aff77670F839ea425f5b78ab3Ae7",
//   dai: "0x0d79df66BE487753B02D015Fb622DED7f0E9798d",
//   weth: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e", // ETH/USD
//   wbtc: "0xA39434A63A52E749F02807ae27335515BA4b07F7", // BTC/USD
//   link: "0x48731cF7e84dc94C5f84577882c14Be11a5B7456",
// };

export const HEARTBEAT = {
  wbtc: 86400,
  weth: 86400,
  link: 3600,
  usdt: 86400,
  usdc: 86400,
  frax: 86400,
  uni: 86400,
  dai: 86400,
};

export const TOKENS = {
  wbtc: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
  weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  link: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
  usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  frax: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F",
  uni: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
  dai: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
};

export const LENS_ADDRESS = "0x334EF68C12d8B95C7aF639dDa2C16801eea00122";
export const GMX_LIBRARY_ADDRESS = "0x824Bef9c581F03ffd699B9bfdB9C714AC25F51B1";
export const UNISWAP_ADAPTER_ADDRESS =
  "0x1F52f5912D40a10cA51d41aac658a3Fc2AB48758";
export const ADAPTER_REGISTRY_ADDRESS =
  "0x0998DcB83e9a7514c195B09BF4F41972E871C1Ca";
export const WALLET_IMPLEMENTATION_ADDRESS =
  "0x70274FeD663622C968a33a6e82C328a543b55dC3";
export const VAULT_IMPLEMENTATION_ADDRESS =
  "0x3F32198a4Ef58104acF5eAA6dB31D63fA45EDC0B";
export const FACTORY_ADDRESS = "0x0Ffe6BFcbC867F7AF6f62a5F2A270723a9654299";
export const GMX_OBSERVER_ADDRESS =
  "0x3C262e437c2F1bEa60d12E087B76dAA47fB0a8a8";
export const TRADER_WALLET_INSTANCE_ADDRESS =
  "0x7FEE5b692e4bB1d66B295d070397977097cb0b82";
export const USERS_VAULT_INSTANCE_ADDRESS =
  "0x1D96f66E597F3481a9D6e04BF5C50f5d33371741";
export const DYNAMIC_VALUATION_ADDRESS =
  "0x8a9A92f2d3b2C4282D9D97daDa6F737db03556Fc";

export const WHITELISTED_USERS = [
  "0x27FB72101CB0481213af9104238E3813ec52A47b",
  "0x684c0FAa5dCA895e42C9D14DE7EDC91F3464Afd1",
  "0xfE74f148E2e329F4b982794cA5A625278b96200b",
  "0x40947715F596973d4cB037725a12694E77EDB00C",
  "0xc65b34186D8af9c48EF3a6C1aE4079841EE62a72",
  "0x8850F319334a0A7219402B82Fb99F62bAF2B6738",
  "0x53f98Ecf031CAaEEfe3165bbFc38E9764567bEC0",
  "0x27877bCc963D192b0AF446889Ec154b449eF7769",
  "0xf0eb714cC19775052f20CCb017a2BEe740d0F2e9",
  "0xCaF3c3B3c08d3311a230dd4ae5c3cd429d0cb6FD",
  "0x21B0D97Ae9CA45ABf17fFfA57C56E4bdba165879",
  "0x6f0BE38B4aCD560A293ba9Def5eb6F81e499CC7D",
  "0xb3C5c6A48CF88C89c8ACFFad8477083B659D3060",
  "0xD9D17a873592B1b3B814cbF4f13f900C5916EB8a",
  "0xA80121C00150379B56EAef8fF89Cb660446eEB5c",
  "0x78BdeFf0d8d4598FE6cC8d874aFEFaBb75599cc9",
  "0x1Cf267B5ff3EA416F166404dCA2e1A4F423901Fe",
  "0x6518A7EBDc5944555E4Ac5E79159cFB011E93dd8",
  "0xDCC7B49A983430ab148a6E2fFC90b535C522ce79",
];

export const WHITELISTED_TRADERS = [
  "0x27FB72101CB0481213af9104238E3813ec52A47b",
  "0x684c0FAa5dCA895e42C9D14DE7EDC91F3464Afd1",
  "0xfE74f148E2e329F4b982794cA5A625278b96200b",
  "0x40947715F596973d4cB037725a12694E77EDB00C",
  "0xc65b34186D8af9c48EF3a6C1aE4079841EE62a72",
  "0x8850F319334a0A7219402B82Fb99F62bAF2B6738",
  "0x53f98Ecf031CAaEEfe3165bbFc38E9764567bEC0",
  "0x27877bCc963D192b0AF446889Ec154b449eF7769",
  "0xf0eb714cC19775052f20CCb017a2BEe740d0F2e9",
  "0xCaF3c3B3c08d3311a230dd4ae5c3cd429d0cb6FD",
  "0x78BdeFf0d8d4598FE6cC8d874aFEFaBb75599cc9",
  "0x1Cf267B5ff3EA416F166404dCA2e1A4F423901Fe",
  "0x6518A7EBDc5944555E4Ac5E79159cFB011E93dd8",
  "0xDCC7B49A983430ab148a6E2fFC90b535C522ce79",
];

// export const LENS_ADDRESS = "";
// export const GMX_LIBRARY_ADDRESS = "";
// export const UNISWAP_ADAPTER_ADDRESS = "";
// export const ADAPTER_REGISTRY_ADDRESS = "";
// export const WALLET_IMPLEMENTATION_ADDRESS = "";
// export const VAULT_IMPLEMENTATION_ADDRESS = "";
// export const FACTORY_ADDRESS = "";
// export const TRADER_WALLET_INSTANCE_ADDRESS = "";
// export const USERS_VAULT_INSTANCE_ADDRESS = "";
// export const DYNAMIC_VALUATION_ADDRESS = "";
// export const GMX_OBSERVER_ADDRESS = "";

// export const TOKENS = tokens;
export const UNDERLYING_TOKEN_ADDRESS = TOKENS.usdc;
export const SHARES_NAME = "UsersVaultShares";
export const SHARES_SYMBOL = "UVS";
export const SEQUENCER_UPTIME = "0xFdB631F5EE196F0ed6FAa767959853A9F217697D";
export const FEE_RATE: BigNumber = BigNumber.from("25000000000000000");