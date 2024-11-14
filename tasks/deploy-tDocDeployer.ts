// scripts/deployUUPS.js
const { ethers, upgrades } = require("hardhat");

async function main() {
  const TDocDeployer = await ethers.getContractFactory("TDocDeployer");
  console.log("Deploying TDocDeployer...");

  // Deploy the contract as a UUPS proxy
  const proxyInstance = await upgrades.deployProxy(TDocDeployer, [42], {
    initializer: "initialize",
    kind: "uups",
  });

  await proxyInstance.deployed();
  console.log("TDocDeployer deployed to:", proxyInstance.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
