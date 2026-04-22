import { ethers } from "ethers";

const sepoliaChainId = "0xaa36a7";

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask 未安装");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) {
    throw new Error("未获取到账户");
  }
  return accounts[0];
}

export async function ensureSepoliaNetwork() {
  if (!window.ethereum) {
    throw new Error("MetaMask 未安装");
  }
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId === sepoliaChainId) {
    return;
  }
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: sepoliaChainId }]
  });
}

export async function getCertificateRegistry(contractAddress, abi) {
  if (!window.ethereum) {
    throw new Error("MetaMask 未安装");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(contractAddress, abi, signer);
}

export async function storeCertificateOnChain({ contractAddress, abi, certHash, ipfsHash }) {
  await connectWallet();
  await ensureSepoliaNetwork();
  const contract = await getCertificateRegistry(contractAddress, abi);
  const tx = await contract.storeCertificate(certHash, ipfsHash);
  const receipt = await tx.wait();
  return receipt;
}
