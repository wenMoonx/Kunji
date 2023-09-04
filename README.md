# Kunji Finance

This project implements Kunji Finance smart contracts. These smart contracts implement a batched vault. Vault funds can be used by whitelisted traders to generate alpha using active management.

## Deployment

Run

```shell
npx hardhat run ./scripts/deployContracts.ts
```

### Tests

In test cases the Arbitrum network fork is used. To run tests, it is recommended to use a full node node. Its address must be specified in the .env file.
To run all test cases

```shell
npx hardhat test
```

Due to the configuration of the fork, some tests may fail. In this case, the tests can be run separately.

```shell
npx hardhat test tests/<path_to_test_case>
```
