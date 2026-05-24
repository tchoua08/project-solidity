const { ethers } = require("hardhat");

async function main() {
  const CollateralizedLoan = await ethers.getContractFactory(
    "CollateralizedLoan"
  );
  const collateralizedLoan = await CollateralizedLoan.deploy();

  await collateralizedLoan.waitForDeployment();

  console.log(
    `CollateralizedLoan deployed to ${await collateralizedLoan.getAddress()}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
