export const certificateCategoryOptions = [
  "学历证书",
  "职业资格",
  "培训证书",
  "荣誉证书",
  "其他"
];

export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
};

export const formatDate = (value) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString("zh-CN");
};

export const buildIpfsUrl = (hash) => {
  if (!hash) {
    return "";
  }
  return `https://gateway.pinata.cloud/ipfs/${hash}`;
};

export const buildTxUrl = (hash) => {
  if (!hash) {
    return "";
  }
  return `https://sepolia.etherscan.io/tx/${hash}`;
};
