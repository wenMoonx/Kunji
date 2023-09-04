export const tokens = {
  usdc: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
  usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  dai: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  frax: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F",
  weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // shortable
  wbtc: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", // shortable
  uni: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", // shortable
  link: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", // shortable
  randomCoin: "0x1E5E907F690a2aEa6c68D60f8bb9771FE585bC34",
  eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
};

export const gmx = {
  routerAddress: "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064",
  positionRouterAddress: "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868",
  readerAddress: "0x22199a49A999c351eF7927602CFB187ec3cae489",
  vaultAddress: "0x489ee077994B6658eAfA855C308275EAd8097C4A",
  orderBookAddress: "0x09f77E8A13De9a35a7231028187e9fD5DB8a2ACB",
  vaultPriceFeedAddress: "0x2d68011bcA022ed0E474264145F46CC4de96a002",
  positionManagerAddress: "0x75E42e6f01baf1D6022bEa862A28774a9f8a4A0C",
  keeper: "0x11D62807dAE812a0F1571243460Bf94325F43BB7",
  limitOrderKeeper: "0xd4266f8f82f7405429ee18559e548979d49160f3",
};

export const tokenHolders = {
  usdc: [
    "0x62383739d68dd0f844103db8dfb05a7eded5bbe6",
    "0xf89d7b9c864f589bbf53a82105107622b35eaa40",
  ],
  usdt: [
    "0xf89d7b9c864f589bbf53a82105107622b35eaa40",
    "0x62383739d68dd0f844103db8dfb05a7eded5bbe6",
    "0x0d0707963952f2fba59dd06f2b425ace40b492fe",
  ],
  weth: [
    "0x0df5dfd95966753f01cb80e76dc20ea958238c46",
    "0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8",
    "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
  ],
};

export const uniswap = {
  routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  positionManagerAddress: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  quoterAddress: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
};

// https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum#Arbitrum%20Mainnet
// all decimals 8
export const usdFeeds = {
  usdt: "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7",
  usdc: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
  dai: "0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB",
  frax: "0x0809E3d38d1B4214958faf06D8b1B1a2b73f2ab8",
  weth: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  wbtc: "0x6ce185860a4963106506C203335A2910413708e9",
  uni: "0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720",
  link: "0x86E53CF1B870786351Da77A57575e79CB55812CB",
};

export const sequencerUptimeFeed = "0xFdB631F5EE196F0ed6FAa767959853A9F217697D";
