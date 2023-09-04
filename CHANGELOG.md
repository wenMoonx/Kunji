# Changelog

## [Unreleased]

### Added

- **BaseVault**
  Parent abstract contract for contracts TraderWallet and UsersVault. Functionality:

  - performing operations on third-party adapters (including libraries);
  - receiving native tokens;
  - emergency withdrawal of funds from the contract (should be used carefully, it is recommended to use it in conjunction with a timelock).

- **TraderWallet**  
  Contract maintains trading configurations for itself and bounded UsersVault contract. Also it keeps traders funds and executes all trading operations.
  Contract is used to execute _rollover()_ operation, which allows to process deposits/withdrawals and calculate share prices in a UsersVault contract.

- **UsersVault**  
  A contract inherited from ERC20 that mints (burns) shares in exchange for user deposits (withdrawals). The contract is used to copy the TraderWallet's trades. The value of the contract shares depends on the success of the TraderWallet's trading and is recalculated every round (rollover).
- **DynamicValuation**  
  Contract for calculating the value of a TraderWallet's (or UsersVault's) portfolio.

- **ContractsFactory**  
  Contract for deploying TraderWallet and UsersVault. Contract keeps track of global allowed trade tokens, existing TraderWallets and UsersVaults.

- **Adapters**  
  For each trader's operation, the adapter calculates the trade scaling factor for the Vault. This allows you to observe the approximate proportionality of open positions in contracts.

  - **UniswapV3Adapter**  
    Adapter contract for swapping tokens on UniswapV3. Contract allows to sell (exact input) or buy (exact out) tokens.

  - **GMXAdapter**  
    Adapter library for working with GMX protocol. Adapter allows to create/increase new positions, close/decrease existing positions, create/update/cancel limit orders.

- **Observers**  
  For each non-uniswap protocol, an Observer is used to determine the current value of open positions.

  - **GMXObserver**  
    Contract used to get value of current opened positions. All positions are scaled to 1e30 USD.

- **Lens**  
  Contract-helper with functionality:
  - get swapping amounts before trades;
  - check current GMX positions.
