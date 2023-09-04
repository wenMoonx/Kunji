/* eslint-disable no-process-exit */
import hre from "hardhat";

const IMPLEMENTATION = "0x212aD3d42722B905E47D96Cb86729d099E13F31C";

function ignoreAlreadyVerifiedError(err: Error) {
  if (err.message.includes("Contract source code already verified")) {
    console.log("contract already verfied, skipping");
    return;
  } else {
    throw err;
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  console.clear();
  if (!IMPLEMENTATION) {
    throw new Error("Invalid parameters detected");
  }

  await hre
    .run("verify:verify", {
      address: IMPLEMENTATION,
      constructorArguments: [],
    })
    .catch(ignoreAlreadyVerifiedError);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
