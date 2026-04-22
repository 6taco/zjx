const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const Registry = await ethers.getContractFactory("CertificateRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log("CertificateRegistry deployed to:", address);
  console.log("Contract owner:", await registry.owner());
  console.log("\nUpdate your .env / frontend config:");
  console.log(`  CERT_REGISTRY_ADDRESS=${address}`);
  console.log(`  VITE_CERT_REGISTRY_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
