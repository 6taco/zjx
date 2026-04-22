import { ethers } from "ethers";
import { sepoliaChainId } from "./contractConfig.js";

export const isCertificateExistsError = (error) => {
  const reason = String(error?.reason || error?.shortMessage || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return reason.includes("certificate exists") || message.includes("certificate exists");
};

export const requestWalletApprovalSignature = async ({ ethereum, actionText }) => {
  const accounts = await ethereum.request({ method: "eth_accounts" });
  const account = String(accounts?.[0] || "").trim();
  if (!account) {
    throw new Error("未获取到钱包账户");
  }
  const message = `${actionText}\n时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
  await ethereum.request({
    method: "personal_sign",
    params: [message, account]
  });
  return account;
};

export const ensureSepoliaNetwork = async (ethereum) => {
  const chainId = await ethereum.request({ method: "eth_chainId" });
  if (chainId !== sepoliaChainId) {
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: sepoliaChainId }]
      });
    } catch (switchError) {
      if (Number(switchError?.code) === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: sepoliaChainId,
              chainName: "Sepolia",
              nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"]
            }
          ]
        });
      } else {
        throw switchError;
      }
    }
  }
};

export const connectWalletAndSign = async ({ actionText }) => {
  if (!window.ethereum) {
    throw new Error("请先安装并启用 MetaMask");
  }
  const ethereum = window.ethereum;
  await ethereum.request({ method: "eth_requestAccounts" });
  await ensureSepoliaNetwork(ethereum);
  await requestWalletApprovalSignature({ ethereum, actionText });
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  return { ethereum, provider, signer };
};
