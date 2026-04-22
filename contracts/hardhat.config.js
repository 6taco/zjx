require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const sepoliaUrl = process.env.SEPOLIA_RPC_URL || "";
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY || "";

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: sepoliaUrl || "https://rpc.sepolia.org",
      accounts: deployerKey ? [deployerKey] : []
    }
  }
};
