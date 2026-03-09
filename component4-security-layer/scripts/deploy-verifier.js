"use strict";

/**
 * deploy-verifier.js
 * Deploys GradeVerifier.sol to the configured network using Hardhat/ethers.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-verifier.js --network <network>
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying GradeVerifier with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const GradeVerifier = await hre.ethers.getContractFactory("GradeVerifier");
  const verifier = await GradeVerifier.deploy();
  await verifier.waitForDeployment();

  const address = await verifier.getAddress();
  console.log("GradeVerifier deployed to:", address);
  console.log("Update CONTRACT_ADDRESS in backend/.env with:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
