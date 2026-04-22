export const sepoliaChainId = "0xaa36a7";

export const certRegistryAddress =
  (import.meta.env.VITE_CERT_REGISTRY_ADDRESS || "").trim() ||
  "0x87d3D0CE658ec5E74f3f6da693dD85F26C033FdE";

export const certRegistryAbi = [
  {
    inputs: [
      { internalType: "string", name: "certHash", type: "string" },
      { internalType: "string", name: "ipfsHash", type: "string" }
    ],
    name: "storeCertificate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string[]", name: "certHashes", type: "string[]" },
      { internalType: "string[]", name: "ipfsHashes", type: "string[]" }
    ],
    name: "storeCertificateBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "certHash", type: "string" }],
    name: "revokeCertificate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "certHash", type: "string" }],
    name: "verifyCertificate",
    outputs: [
      { internalType: "string", name: "ipfsHash", type: "string" },
      { internalType: "address", name: "issuer", type: "address" },
      { internalType: "uint256", name: "timestamp", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "certHash", type: "string" }],
    name: "verifyCertificateEx",
    outputs: [
      { internalType: "string", name: "ipfsHash", type: "string" },
      { internalType: "address", name: "issuer", type: "address" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
      { internalType: "bool", name: "revoked", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "certHash", type: "string" }],
    name: "certificateExists",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  }
];
