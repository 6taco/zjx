import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  Search,
  UploadCloud,
  ScanText,
  RefreshCw,
  Eye,
  Download,
  Link as LinkIcon,
  User,
  Building2,
  FileCheck,
  Menu
} from "lucide-react";
import VerifyCertificate from "./VerifyCertificate.jsx";
import FileVerify from "./FileVerify.jsx";
import LoginPage from "./components/LoginPage.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { AdminEditDialog, AdminDeleteDialog } from "./components/AdminDialogs.jsx";
import AuthCodePanel from "./components/AuthCodePanel.jsx";
import DraftListView from "./components/DraftListView.jsx";
import { extractOcrFields } from "./utils/ocrParser.js";
import { certRegistryAddress, certRegistryAbi } from "./utils/contractConfig.js";
import { isCertificateExistsError, connectWalletAndSign } from "./utils/wallet.js";
import { certificateCategoryOptions, emailRegex, formatDateTime, formatDate, buildIpfsUrl, buildTxUrl } from "./utils/helpers.js";
const appStateStorageKey = "bishe_app_state_v1";
const defaultAuthForm = {
  username: "",
  password: "",
  email: "",
  emailCode: "",
  organization: "",
  role: "user"
};
const defaultCertForm = {
  cert_name: "",
  owner_name: "",
  issuer: "",
  cert_no: "",
  issue_date: "",
  cert_category: "学历证书"
};
const defaultListQuery = {
  certId: "",
  ownerName: "",
  certHash: "",
  certCategory: ""
};

const mergeObject = (baseValue, rawValue) => {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return { ...baseValue };
  }
  return {
    ...baseValue,
    ...rawValue
  };
};

const readPersistedAppState = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    window.localStorage.removeItem(appStateStorageKey);
    const raw = window.sessionStorage.getItem(appStateStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};



export default function App() {
  const persistedAppState = useMemo(() => readPersistedAppState(), []);
  const [mode, setMode] = useState(() => String(persistedAppState?.mode || "login"));
  const [currentView, setCurrentView] = useState(() => String(persistedAppState?.currentView || "dashboard"));
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => Boolean(persistedAppState?.isSidebarOpen));
  const [form, setForm] = useState(() => mergeObject(defaultAuthForm, persistedAppState?.form));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [token, setToken] = useState(() => String(persistedAppState?.token || ""));
  const [profile, setProfile] = useState(() =>
    persistedAppState?.profile && typeof persistedAppState.profile === "object" ? persistedAppState.profile : null
  );
  const [certForm, setCertForm] = useState(() => mergeObject(defaultCertForm, persistedAppState?.certForm));
  const [certFile, setCertFile] = useState(null);
  const [ocrFile, setOcrFile] = useState(null);
  const [certStatus, setCertStatus] = useState({ type: "", message: "" });
  const [certResult, setCertResult] = useState(() =>
    persistedAppState?.certResult && typeof persistedAppState.certResult === "object"
      ? persistedAppState.certResult
      : null
  );
  const [certLoading, setCertLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState({ type: "", message: "" });
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrExtractedText, setOcrExtractedText] = useState(() => String(persistedAppState?.ocrExtractedText || ""));
  const [listQuery, setListQuery] = useState(() => mergeObject(defaultListQuery, persistedAppState?.listQuery));
  const [listLoading, setListLoading] = useState(false);
  const [listStatus, setListStatus] = useState({ type: "", message: "" });
  const [listData, setListData] = useState(() =>
    Array.isArray(persistedAppState?.listData) ? persistedAppState.listData : []
  );
  const [listPage, setListPage] = useState(() => Math.max(1, Number(persistedAppState?.listPage || 1)));
  const [listPageSize, setListPageSize] = useState(() =>
    Math.max(1, Math.min(100, Number(persistedAppState?.listPageSize || 10)))
  );
  const [listTotal, setListTotal] = useState(() => Math.max(0, Number(persistedAppState?.listTotal || 0)));
  const [selectedCert, setSelectedCert] = useState(() =>
    persistedAppState?.selectedCert && typeof persistedAppState.selectedCert === "object"
      ? persistedAppState.selectedCert
      : null
  );
  const [listActionLoadingId, setListActionLoadingId] = useState(0);
  const [draftListLoading, setDraftListLoading] = useState(false);
  const [draftListStatus, setDraftListStatus] = useState({ type: "", message: "" });
  const [draftListData, setDraftListData] = useState([]);
  const [draftActionLoadingId, setDraftActionLoadingId] = useState(0);
  const [adminEditDialog, setAdminEditDialog] = useState({
    open: false,
    target: null,
    form: {
      cert_name: "",
      owner_name: "",
      issuer: "",
      cert_no: "",
      issue_date: "",
      cert_category: ""
    }
  });
  const [adminDeleteDialog, setAdminDeleteDialog] = useState({
    open: false,
    target: null
  });
  const [authCodeDuration, setAuthCodeDuration] = useState(() => String(persistedAppState?.authCodeDuration || "60"));
  const [authCodeLoading, setAuthCodeLoading] = useState(false);
  const [authCodeStatus, setAuthCodeStatus] = useState({ type: "", message: "" });
  const [authCodeResult, setAuthCodeResult] = useState(() =>
    persistedAppState?.authCodeResult && typeof persistedAppState.authCodeResult === "object"
      ? persistedAppState.authCodeResult
      : null
  );
  const [emailCodeLoading, setEmailCodeLoading] = useState(false);
  const [emailCodeStatus, setEmailCodeStatus] = useState({ type: "", message: "" });
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);
  const detailRef = useRef(null);
  const authSessionRef = useRef(0);
  const listRequestRef = useRef(0);
  const draftListRequestingRef = useRef(false);

  const isRegister = mode === "register";
  const isLoggedIn = Boolean(token);
  const canSubmit = useMemo(() => {
    if (!form.username.trim() || !form.password.trim()) {
      return false;
    }
    if (isRegister && (!form.email.trim() || !form.emailCode.trim())) {
      return false;
    }
    return true;
  }, [form.username, form.password, form.email, form.emailCode, isRegister]);
  const totalPages = useMemo(() => {
    if (!listTotal) {
      return 1;
    }
    return Math.max(1, Math.ceil(listTotal / listPageSize));
  }, [listTotal, listPageSize]);
  const isAdmin = useMemo(() => {
    const role = String(profile?.role || "").trim().toLowerCase();
    return role === "admin" || role === "super_admin";
  }, [profile?.role]);
  const canApproveDrafts = useMemo(() => {
    const role = String(profile?.role || "").trim().toLowerCase();
    return role === "admin";
  }, [profile?.role]);
  const isSuperAdmin = useMemo(() => {
    const role = String(profile?.role || "").trim().toLowerCase();
    return role === "super_admin";
  }, [profile?.role]);
  const isUser = useMemo(() => {
    const role = String(profile?.role || "").trim().toLowerCase();
    return role === "user";
  }, [profile?.role]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      if (name === "email") {
        return {
          ...prev,
          email: value,
          emailCode: ""
        };
      }
      return {
        ...prev,
        [name]: value
      };
    });
    if (name === "email") {
      setEmailCodeStatus({ type: "", message: "" });
      setEmailCodeCountdown(0);
    }
  };

  const handleCertChange = (event) => {
    const { name, value } = event.target;
    setCertForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setCertFile(file);
  };

  const handleOcrFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setOcrFile(file);
    setOcrExtractedText("");
    if (file) {
      setOcrStatus({ type: "info", message: "图片已选择，可点击“开始文字识别”" });
    } else {
      setOcrStatus({ type: "", message: "" });
    }
    setOcrProgress(0);
  };

  const handleOcrRecognize = async () => {
    const targetFile = ocrFile || certFile;
    if (!targetFile) {
      setOcrStatus({ type: "error", message: "请先选择证书图片" });
      return;
    }

    setOcrLoading(true);
    setOcrProgress(0);
    setOcrStatus({ type: "info", message: "识别中，请稍候..." });

    try {
      setOcrProgress(20);
      const formData = new FormData();
      formData.append("file", targetFile);
      const response = await fetch("/api/certificates/ocr", {
        method: "POST",
        body: formData
      });
      setOcrProgress(75);
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "识别服务不可用");
      }
      const ocrText = String(payload?.data?.text || "");
      if (!ocrText.trim()) {
        setOcrStatus({ type: "error", message: "未识别到有效文字，请尝试更清晰的图片" });
        return;
      }
      setOcrExtractedText(ocrText);
      const parsed = extractOcrFields(ocrText);
      setCertForm((prev) => ({
        ...prev,
        cert_name: parsed.certificateName || prev.cert_name,
        owner_name: parsed.holderName || prev.owner_name,
        issuer: parsed.organization || prev.issuer,
        cert_no: parsed.certificateNo || prev.cert_no,
        issue_date: parsed.issueDate || prev.issue_date
      }));
      setOcrProgress(100);
      setOcrStatus({ type: "success", message: "识别完成，已自动填充表单" });
    } catch (error) {
      setOcrStatus({ type: "error", message: `识别失败：${error.message || "未知错误"}` });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleListQueryChange = (event) => {
    const { name, value } = event.target;
    setListQuery((prev) => ({ ...prev, [name]: value }));
  };

  const resetListState = () => {
    listRequestRef.current += 1;
    setListQuery(defaultListQuery);
    setListPage(1);
    setListPageSize(10);
    setListTotal(0);
    setListData([]);
    setSelectedCert(null);
  };

  const fetchCertificateList = async (
    nextPage = listPage,
    nextPageSize = listPageSize,
    nextQuery = listQuery
  ) => {
    const requestSession = authSessionRef.current;
    listRequestRef.current += 1;
    const requestId = listRequestRef.current;
    setListLoading(true);
    setListStatus({ type: "", message: "" });
    try {
      const params = new URLSearchParams();
      const certIdValue = String(nextQuery?.certId || "").trim();
      const ownerNameValue = String(nextQuery?.ownerName || "").trim();
      const certCategoryValue = String(nextQuery?.certCategory || "").trim();
      const certHashValue = String(nextQuery?.certHash || "").trim();
      params.set("page", String(nextPage));
      params.set("pageSize", String(nextPageSize));
      if (certIdValue) {
        const certValue = certIdValue;
        if (/^\d+$/.test(certValue)) {
          params.set("cert_no", certValue);
        } else {
          params.set("cert_id", certValue);
        }
      }
      if (ownerNameValue) {
        params.set("owner_name", ownerNameValue);
      }
      if (certCategoryValue) {
        params.set("cert_category", certCategoryValue);
      }
      if (certHashValue) {
        params.set("cert_hash", certHashValue);
      }
      const res = await fetch(`/api/certificates?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (requestSession !== authSessionRef.current || requestId !== listRequestRef.current) {
        return;
      }
      if (!res.ok || !data.ok) {
        setListStatus({
          type: "error",
          message: data.message || "获取证书列表失败"
        });
        return;
      }
      setListData(data.data || []);
      setListTotal(Number(data.pagination?.total || 0));
      setListPage(Number(data.pagination?.page || nextPage));
      setListPageSize(Number(data.pagination?.pageSize || nextPageSize));
    } catch (error) {
      if (requestSession !== authSessionRef.current || requestId !== listRequestRef.current) {
        return;
      }
      setListStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      if (requestSession !== authSessionRef.current || requestId !== listRequestRef.current) {
        return;
      }
      setListLoading(false);
    }
  };

  const fetchDraftList = async (options = {}) => {
    const silent = Boolean(options?.silent);
    if (!token || !canApproveDrafts) {
      return;
    }
    if (draftListRequestingRef.current) {
      return;
    }
    draftListRequestingRef.current = true;
    if (!silent) {
      setDraftListLoading(true);
      setDraftListStatus({ type: "", message: "" });
    }
    try {
      const params = new URLSearchParams();
      params.set("status", "pending");
      params.set("page", "1");
      params.set("pageSize", "50");
      const res = await fetch(`/api/certificates/drafts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setDraftListStatus({ type: "error", message: data?.message || "获取草稿列表失败" });
        return;
      }
      setDraftListData(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      setDraftListStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      if (!silent) {
        setDraftListLoading(false);
      }
      draftListRequestingRef.current = false;
    }
  };

  const trySyncTxHashFromSameCert = async ({ certHash, certId, certNo }) => {
    if (!token || !certHash || !certId) {
      return "";
    }
    try {
      const params = new URLSearchParams();
      params.set("cert_hash", String(certHash));
      params.set("page", "1");
      params.set("pageSize", "20");
      const res = await fetch(`/api/certificates?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !Array.isArray(data?.data)) {
        return "";
      }
      const matched = data.data.find(
        (row) =>
          Number(row?.id || 0) !== Number(certId) &&
          String(row?.cert_hash || "").trim().toLowerCase() === String(certHash).trim().toLowerCase() &&
          String(row?.tx_hash || "").trim()
      );
      const existingTxHash = String(matched?.tx_hash || "").trim();
      if (!existingTxHash) {
        return "";
      }
      const saveRes = await fetch(`/api/certificates/${encodeURIComponent(String(certId))}/tx`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tx_hash: existingTxHash, cert_no: certNo || certId })
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData?.ok) {
        return "";
      }
      return existingTxHash;
    } catch (error) {
      return "";
    }
  };

  const handleApproveDraft = async (item) => {
    if (!canApproveDrafts || !token || !item?.id) {
      return;
    }
    try {
      setDraftActionLoadingId(Number(item.id));
      if (!certRegistryAddress) {
        setDraftListStatus({ type: "error", message: "未配置合约地址，无法上链" });
        return;
      }
      setDraftListStatus({ type: "info", message: "请先在 MetaMask 中授权钱包连接并签名" });
      const { signer } = await connectWalletAndSign({ actionText: `确认发布草稿 #${item.id}` });

      const res = await fetch(`/api/certificates/drafts/${encodeURIComponent(String(item.id))}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setDraftListStatus({ type: "error", message: data?.message || "草稿确认发布失败" });
        return;
      }
      const publishedData = data?.data || null;
      if (!publishedData?.cert_hash || !publishedData?.ipfs_hash || !publishedData?.id) {
        setDraftListStatus({ type: "error", message: "草稿已发布，但返回数据不完整，无法发起上链" });
        return;
      }
      setDraftListStatus({ type: "info", message: "请在 MetaMask 中确认草稿发布交易" });
      const contract = new ethers.Contract(certRegistryAddress, certRegistryAbi, signer);
      let txHash = "";
      try {
        const tx = await contract.storeCertificate(publishedData.cert_hash, publishedData.ipfs_hash);
        await tx.wait();
        txHash = String(tx.hash || "");
      } catch (storeError) {
        if (!isCertificateExistsError(storeError)) {
          throw storeError;
        }
      }
      if (publishedData.ocr_chain_key && publishedData.ocr_ipfs_hash) {
        try {
          const ocrTx = await contract.storeCertificate(publishedData.ocr_chain_key, publishedData.ocr_ipfs_hash);
          await ocrTx.wait();
        } catch (ocrChainError) {}
      }
      if (txHash) {
        const saveRes = await fetch(`/api/certificates/${encodeURIComponent(String(publishedData.id))}/tx`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ tx_hash: txHash, cert_no: publishedData.cert_no || publishedData.id })
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok || !saveData?.ok) {
          setDraftListStatus({ type: "error", message: saveData?.message || "草稿已上链，但交易哈希保存失败" });
          return;
        }
      }
      let finalTxHash = txHash;
      if (!finalTxHash) {
        finalTxHash = await trySyncTxHashFromSameCert({
          certHash: publishedData.cert_hash,
          certId: publishedData.id,
          certNo: publishedData.cert_no || publishedData.id
        });
      }
      setDraftListStatus({
        type: "success",
        message: finalTxHash
          ? "草稿已确认发布并完成上链，已同步交易哈希"
          : txHash
            ? "草稿已确认发布并完成上链"
            : "草稿已确认发布，链上已存在相同证书"
      });
      await fetchDraftList();
      await fetchCertificateList(listPage, listPageSize, listQuery);
    } catch (error) {
      setDraftListStatus({ type: "error", message: `草稿已确认，但上链失败或用户取消：${error.message || "未知错误"}` });
    } finally {
      setDraftActionLoadingId(0);
    }
  };

  const handleViewCertificate = (item) => {
    setSelectedCert(item);
    setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleDownloadCertificate = (item) => {
    const ipfsHash = String(item?.ipfs_hash || "").trim();
    if (!ipfsHash) {
      setListStatus({ type: "error", message: "该证书没有可下载的文件" });
      return;
    }
    const url = `/api/certificates/download/${encodeURIComponent(ipfsHash)}`;
    const certNo = item?.cert_no ?? item?.id ?? "unknown";
    const link = document.createElement("a");
    link.href = url;
    link.download = `certificate-${certNo}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setListStatus({ type: "success", message: "下载任务已开始" });
  };

  const handleAdminEditCertificate = async (item) => {
    if (!isAdmin || !item?.id) {
      return;
    }
    setAdminEditDialog({
      open: true,
      target: item,
      form: {
        cert_name: String(item.cert_name || ""),
        owner_name: String(item.owner_name || ""),
        issuer: String(item.issuer || ""),
        cert_no: String(item.cert_no ?? item.id ?? ""),
        issue_date: item.issue_date ? String(item.issue_date).slice(0, 10) : "",
        cert_category: String(item.cert_category || "")
      }
    });
  };

  const handleAdminEditDialogChange = (event) => {
    const { name, value } = event.target;
    setAdminEditDialog((prev) => ({
      ...prev,
      form: {
        ...prev.form,
        [name]: value
      }
    }));
  };

  const closeAdminEditDialog = () => {
    setAdminEditDialog({
      open: false,
      target: null,
      form: {
        cert_name: "",
        owner_name: "",
        issuer: "",
        cert_no: "",
        issue_date: "",
        cert_category: ""
      }
    });
  };

  const submitAdminEditDialog = async (event) => {
    event.preventDefault();
    if (!isAdmin || !token || !adminEditDialog.target?.id) {
      return;
    }
    const payload = {
      cert_name: String(adminEditDialog.form.cert_name || "").trim(),
      owner_name: String(adminEditDialog.form.owner_name || "").trim(),
      issuer: String(adminEditDialog.form.issuer || "").trim(),
      cert_no: String(adminEditDialog.form.cert_no || "").trim(),
      issue_date: String(adminEditDialog.form.issue_date || "").trim(),
      cert_category: String(adminEditDialog.form.cert_category || "").trim()
    };
    if (!payload.cert_name || !payload.owner_name || !payload.issuer) {
      setListStatus({ type: "error", message: "证书名称、持证人、发布机构不能为空" });
      return;
    }
    try {
      setListActionLoadingId(Number(adminEditDialog.target.id));
      const res = await fetch(`/api/certificates/${encodeURIComponent(String(adminEditDialog.target.id))}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setListStatus({ type: "error", message: data?.message || "证书修改失败" });
        return;
      }
      setListStatus({ type: "success", message: "证书修改成功" });
      setSelectedCert((prev) =>
        prev?.id === adminEditDialog.target.id
          ? {
              ...prev,
              ...payload
            }
          : prev
      );
      closeAdminEditDialog();
      await fetchCertificateList(listPage, listPageSize, listQuery);
    } catch (error) {
      setListStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      setListActionLoadingId(0);
    }
  };

  const handleAdminDeleteCertificate = (item) => {
    if (!isAdmin || !item?.id) {
      return;
    }
    setAdminDeleteDialog({
      open: true,
      target: item
    });
  };

  const closeAdminDeleteDialog = () => {
    setAdminDeleteDialog({
      open: false,
      target: null
    });
  };

  const submitAdminDeleteDialog = async () => {
    if (!isAdmin || !token || !adminDeleteDialog.target?.id) {
      return;
    }
    try {
      setListActionLoadingId(Number(adminDeleteDialog.target.id));
      const res = await fetch(`/api/certificates/${encodeURIComponent(String(adminDeleteDialog.target.id))}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setListStatus({ type: "error", message: data?.message || "证书删除失败" });
        return;
      }
      setListStatus({ type: "success", message: "证书删除成功" });
      setSelectedCert((prev) => (prev?.id === adminDeleteDialog.target.id ? null : prev));
      closeAdminDeleteDialog();
      const nextPage = listData.length <= 1 && listPage > 1 ? listPage - 1 : listPage;
      await fetchCertificateList(nextPage, listPageSize, listQuery);
    } catch (error) {
      setListStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      setListActionLoadingId(0);
    }
  };

  const handleGenerateAuthCode = async () => {
    if (!token) {
      setAuthCodeStatus({ type: "error", message: "请先登录后再生成授权码" });
      return;
    }
    if (!isSuperAdmin) {
      setAuthCodeStatus({ type: "error", message: "仅总管理员可生成授权码" });
      return;
    }
    const ttlMinutes = Number(authCodeDuration || 60);
    if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
      setAuthCodeStatus({ type: "error", message: "请选择有效时效" });
      return;
    }

    setAuthCodeLoading(true);
    setAuthCodeStatus({ type: "", message: "" });
    setAuthCodeResult(null);
    try {
      const res = await fetch("/api/verify-auth/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ttlMinutes })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAuthCodeStatus({ type: "error", message: data?.message || "授权码生成失败" });
        return;
      }
      setAuthCodeResult(data.data || null);
      setAuthCodeStatus({ type: "success", message: "授权码生成成功，请尽快安全分发" });
    } catch (error) {
      setAuthCodeStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      setAuthCodeLoading(false);
    }
  };

  const handleSendEmailCode = async () => {
    if (emailCodeLoading) {
      return;
    }
    const safeEmail = form.email.trim().toLowerCase();
    if (!safeEmail || !emailRegex.test(safeEmail)) {
      setEmailCodeStatus({ type: "error", message: "请先输入正确的邮箱地址" });
      return;
    }
    if (emailCodeCountdown > 0) {
      setEmailCodeStatus({ type: "info", message: `请 ${emailCodeCountdown} 秒后重试` });
      return;
    }

    setEmailCodeLoading(true);
    setEmailCodeStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/users/send-email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: safeEmail })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setEmailCodeStatus({ type: "error", message: data?.message || "验证码发送失败" });
        return;
      }
      const cooldownSeconds = Math.max(0, Number(data?.data?.cooldownSeconds || 60));
      setEmailCodeCountdown(cooldownSeconds);
      setEmailCodeStatus({ type: "success", message: "验证码已发送，请检查邮箱" });
    } catch (error) {
      setEmailCodeStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(appStateStorageKey);
    }
    authSessionRef.current += 1;
    listRequestRef.current += 1;
    setToken("");
    setProfile(null);
    setCurrentView("dashboard");
    setIsSidebarOpen(false);
    closeAdminEditDialog();
    closeAdminDeleteDialog();
    resetListState();
    setListStatus({ type: "", message: "" });
    setDraftListStatus({ type: "", message: "" });
    setDraftListData([]);
    setDraftActionLoadingId(0);
    setStatus({ type: "", message: "" });
    setCertStatus({ type: "", message: "" });
    setCertResult(null);
    setCertFile(null);
    setOcrFile(null);
    setOcrStatus({ type: "", message: "" });
    setOcrProgress(0);
    setOcrExtractedText("");
    setAuthCodeStatus({ type: "", message: "" });
    setAuthCodeResult(null);
    setAuthCodeDuration("60");
    setEmailCodeLoading(false);
    setEmailCodeStatus({ type: "", message: "" });
    setEmailCodeCountdown(0);
    setCertForm(defaultCertForm);
    setMode("login");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setStatus({ type: "", message: "" });
    setProfile(null);
    setCertStatus({ type: "", message: "" });
    setCertResult(null);
    setEmailCodeStatus({ type: "", message: "" });
    setEmailCodeCountdown(0);
    if (nextMode === "register") {
      setToken("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    authSessionRef.current += 1;
    const loginSession = authSessionRef.current;
    listRequestRef.current += 1;
    setLoading(true);
    setStatus({ type: "", message: "" });
    setProfile(null);
    if (!isRegister) {
      setToken("");
    }
    try {
      const payload = isRegister
        ? {
            username: form.username.trim(),
            password: form.password,
            email: form.email.trim() || undefined,
            emailCode: form.emailCode.trim() || undefined,
            organization: form.organization.trim() || undefined,
            role: form.role
          }
        : {
            username: form.username.trim(),
            password: form.password
          };
      const res = await fetch(
        isRegister ? "/api/users/register" : "/api/users/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json();
      if (loginSession !== authSessionRef.current) {
        return;
      }
      if (!res.ok || !data.ok) {
        setStatus({
          type: "error",
          message: data.message || "请求失败"
        });
        return;
      }

      if (isRegister) {
        setStatus({ type: "success", message: "注册成功，请登录" });
        setEmailCodeStatus({ type: "", message: "" });
        setEmailCodeCountdown(0);
        setMode("login");
        return;
      }

      setToken(data.data?.token || "");
      setStatus({ type: "success", message: "登录成功" });
      setCurrentView("dashboard");
      setIsSidebarOpen(false);
      setAuthCodeStatus({ type: "", message: "" });
      setAuthCodeResult(null);
      const profileRes = await fetch("/api/users/profile", {
        headers: {
          Authorization: `Bearer ${data.data?.token}`
        }
      });
      const profileData = await profileRes.json();
      if (loginSession !== authSessionRef.current) {
        return;
      }
      if (profileRes.ok && profileData.ok) {
        setProfile(profileData.data);
        setCertForm((prev) => ({
          ...prev,
          issuer: prev.issuer || profileData.data?.organization || ""
        }));
      }
    } catch (error) {
      if (loginSession !== authSessionRef.current) {
        return;
      }
      setStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      if (loginSession !== authSessionRef.current) {
        return;
      }
      setLoading(false);
    }
  };

  const handlePublish = async (event) => {
    event.preventDefault();
    setCertLoading(true);
    setCertStatus({ type: "", message: "" });
    setCertResult(null);

    if (!token) {
      setCertStatus({ type: "error", message: "请先登录再发布证书" });
      setCertLoading(false);
      return;
    }

    if (!certFile) {
      setCertStatus({ type: "error", message: "请先选择证书文件" });
      setCertLoading(false);
      return;
    }

    if (!certForm.cert_name.trim() || !certForm.owner_name.trim() || !certForm.issuer.trim()) {
      setCertStatus({ type: "error", message: "请完整填写证书信息" });
      setCertLoading(false);
      return;
    }

    try {
      let walletContext = null;
      if (!isUser) {
        if (!certRegistryAddress) {
          setCertStatus({ type: "error", message: "未配置合约地址，无法上链" });
          return;
        }
        setCertStatus({ type: "info", message: "请先在 MetaMask 中授权钱包连接并签名" });
        walletContext = await connectWalletAndSign({ actionText: "确认发布证书" });
      }

      const formData = new FormData();
      formData.append("cert_name", certForm.cert_name.trim());
      formData.append("owner_name", certForm.owner_name.trim());
      formData.append("issuer", certForm.issuer.trim());
      if (certForm.cert_no.trim()) {
        formData.append("cert_no", certForm.cert_no.trim());
      }
      if (certForm.issue_date.trim()) {
        formData.append("issue_date", certForm.issue_date.trim());
      }
      if (certForm.cert_category.trim()) {
        formData.append("cert_category", certForm.cert_category.trim());
      }
      if (ocrExtractedText.trim()) {
        formData.append("ocr_text", ocrExtractedText.trim());
      }
      formData.append("file", certFile);

      const res = await fetch("/api/certificates/publish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCertStatus({
          type: "error",
          message: data.message || "证书发布失败"
        });
        return;
      }

      const publishedData = data.data;
      if (String(data?.mode || "").toLowerCase() === "draft") {
        setCertResult(publishedData || null);
        setCertStatus({ type: "success", message: data?.message || "草稿已提交，待管理员确认发布" });
        return;
      }
      if (isUser) {
        setCertResult(publishedData || null);
        setCertStatus({ type: "success", message: data?.message || "草稿已提交，待管理员确认发布" });
        return;
      }
      try {
        setCertStatus({ type: "info", message: "请在 MetaMask 中确认交易" });
        const ethereum = walletContext?.ethereum || window.ethereum;
        const provider = walletContext?.provider || new ethers.BrowserProvider(ethereum);
        const signer = walletContext?.signer || (await provider.getSigner());
        const contract = new ethers.Contract(certRegistryAddress, certRegistryAbi, signer);
        let txHash = "";
        try {
          const tx = await contract.storeCertificate(
            publishedData.cert_hash,
            publishedData.ipfs_hash
          );
          await tx.wait();
          txHash = String(tx.hash || "");
        } catch (storeError) {
          if (!isCertificateExistsError(storeError)) {
            throw storeError;
          }
        }
        let ocrChainMessage = "";
        if (publishedData.ocr_chain_key && publishedData.ocr_ipfs_hash) {
          try {
            const ocrTx = await contract.storeCertificate(
              publishedData.ocr_chain_key,
              publishedData.ocr_ipfs_hash
            );
            await ocrTx.wait();
            ocrChainMessage = "，OCR识别内容已上链";
          } catch (ocrChainError) {
            ocrChainMessage = "，OCR识别内容上链失败";
          }
        }
        if (txHash && publishedData?.id) {
          try {
            const saveRes = await fetch(`/api/certificates/${publishedData.id}/tx`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ tx_hash: txHash, cert_no: publishedData.cert_no || publishedData.id })
            });
            const saveText = await saveRes.text();
            const saveData = saveText ? JSON.parse(saveText) : null;
            if (!saveRes.ok || !saveData.ok) {
              setCertStatus({
                type: "error",
                message:
                  saveData?.message ||
                  `证书已上链，但保存交易哈希失败：HTTP ${saveRes.status}`
              });
            } else {
              setCertResult({ ...publishedData, tx_hash: txHash });
              setCertStatus({
                type: "success",
                message: `证书发布并上链成功${ocrChainMessage}`
              });
            }
          } catch (saveError) {
            setCertStatus({
              type: "error",
              message: "证书已上链，但保存交易哈希失败"
            });
          }
        } else {
          let syncedTxHash = "";
          if (publishedData?.id) {
            syncedTxHash = await trySyncTxHashFromSameCert({
              certHash: publishedData.cert_hash,
              certId: publishedData.id,
              certNo: publishedData.cert_no || publishedData.id
            });
          }
          setCertResult(publishedData);
          setCertStatus({
            type: "success",
            message: syncedTxHash
              ? `证书发布成功，链上已存在相同证书，已同步交易哈希${ocrChainMessage}`
              : `证书发布成功，链上已存在相同证书${ocrChainMessage}`
          });
        }
      } catch (chainError) {
        setCertStatus({
          type: "error",
          message: `上链失败或用户取消：${chainError.message || "未知错误"}`
        });
      }
    } catch (error) {
      setCertStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      setCertLoading(false);
    }
  };

  const handleListSearch = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextQuery = {
      certId: String(formData.get("certId") || "").trim(),
      ownerName: String(formData.get("ownerName") || "").trim(),
      certCategory: String(formData.get("certCategory") || "").trim(),
      certHash: String(formData.get("certHash") || "").trim()
    };
    setListQuery(nextQuery);
    fetchCertificateList(1, listPageSize, nextQuery);
  };

  const handleListReset = () => {
    const emptyQuery = defaultListQuery;
    setListQuery(emptyQuery);
    setListPage(1);
    setListPageSize(10);
    setListTotal(0);
    setListData([]);
    setSelectedCert(null);
    fetchCertificateList(1, 10, emptyQuery);
  };

  const handlePageChange = (nextPage) => {
    const targetPage = Math.min(Math.max(1, nextPage), totalPages);
    fetchCertificateList(targetPage, listPageSize);
  };

  const handlePageSizeChange = (event) => {
    const nextPageSize = Math.min(100, Math.max(1, Number(event.target.value || 10)));
    setListPageSize(nextPageSize);
    fetchCertificateList(1, nextPageSize);
  };

  useEffect(() => {
    if (!token) {
      return;
    }
    let canceled = false;
    const checkProfile = async () => {
      try {
        const profileRes = await fetch("/api/users/profile", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const profileData = await profileRes.json();
        if (canceled) {
          return;
        }
        if (!profileRes.ok || !profileData?.ok) {
          authSessionRef.current += 1;
          listRequestRef.current += 1;
          setToken("");
          setProfile(null);
          setCurrentView("dashboard");
          setStatus({ type: "error", message: "登录状态已失效，请重新登录" });
          return;
        }
        setProfile(profileData.data || null);
      } catch (error) {
        if (!canceled) {
          setStatus({ type: "error", message: "网络异常，请稍后再试" });
        }
      }
    };
    checkProfile();
    return () => {
      canceled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!isLoggedIn) {
      resetListState();
      setListStatus({ type: "", message: "" });
      return;
    }
    fetchCertificateList(listPage, listPageSize, listQuery);
  }, [isLoggedIn]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const safeForm = { ...form, password: "" };
    const data = {
      mode,
      currentView,
      isSidebarOpen,
      form: safeForm,
      token,
      profile,
      certForm,
      certResult,
      ocrExtractedText,
      listQuery,
      listData,
      listPage,
      listPageSize,
      listTotal,
      selectedCert,
      authCodeDuration,
      authCodeResult
    };
    window.sessionStorage.setItem(appStateStorageKey, JSON.stringify(data));
  }, [
    mode,
    currentView,
    isSidebarOpen,
    form,
    token,
    profile,
    certForm,
    certResult,
    ocrExtractedText,
    listQuery,
    listData,
    listPage,
    listPageSize,
    listTotal,
    selectedCert,
    authCodeDuration,
    authCodeResult
  ]);

  useEffect(() => {
    if (isLoggedIn && !isSuperAdmin && currentView === "authCode") {
      setCurrentView("dashboard");
    }
  }, [isLoggedIn, isSuperAdmin, currentView]);

  useEffect(() => {
    if (isLoggedIn && !canApproveDrafts && currentView === "drafts") {
      setCurrentView("dashboard");
    }
  }, [isLoggedIn, canApproveDrafts, currentView]);

  useEffect(() => {
    if (!isLoggedIn || !canApproveDrafts || currentView !== "drafts") {
      return;
    }
    fetchDraftList();
  }, [isLoggedIn, canApproveDrafts, currentView]);

  useEffect(() => {
    if (!isLoggedIn || !canApproveDrafts || currentView !== "drafts") {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (draftActionLoadingId) {
        return;
      }
      fetchDraftList({ silent: true });
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isLoggedIn, canApproveDrafts, currentView, draftActionLoadingId]);

  useEffect(() => {
    if (emailCodeCountdown <= 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setEmailCodeCountdown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [emailCodeCountdown]);

  return (
    <div className={isLoggedIn ? "main-page" : "auth-page"}>
      {!isLoggedIn ? (
        <LoginPage
          mode={mode}
          form={form}
          loading={loading}
          status={status}
          canSubmit={canSubmit}
          emailCodeLoading={emailCodeLoading}
          emailCodeStatus={emailCodeStatus}
          emailCodeCountdown={emailCodeCountdown}
          onSwitchMode={switchMode}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onSendEmailCode={handleSendEmailCode}
        />
      ) : (
        <div className="platform-layout">
          <Sidebar
            currentView={currentView}
            setCurrentView={setCurrentView}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            canApproveDrafts={canApproveDrafts}
            isSuperAdmin={isSuperAdmin}
            profile={profile}
            username={form.username}
            onLogout={handleLogout}
          />

          <main className="platform-main">
            <header className="platform-header">
              <button className="mobile-menu" onClick={() => setIsSidebarOpen(true)}>
                <Menu size={24} />
              </button>
              <div className="header-title">
                {currentView === 'dashboard' && '工作台 / 证书发布'}
                {currentView === 'list' && '证书查询与管理'}
                {currentView === 'drafts' && '管理员 / 草稿箱管理'}
                {currentView === 'verify' && '跨机构链上验证'}
                {currentView === 'authCode' && '总管理员 / 授权码管理'}
              </div>
            </header>

            <div className="platform-content">
              {currentView === 'dashboard' && (
                <section className="main-card wide publish-card">
                  <div className="panel-title">证书发布</div>
                  <div className="panel-subtitle">
                    {isUser ? "普通用户提交后进入草稿箱，需管理员确认后正式发布" : "管理员可直接发布并上链"}
                  </div>
                  <div className="ocr-panel">
                    <label className="field">
                      <span>证书图片 (自动提取内容)</span>
                      <div className="file-input-wrapper">
                        <UploadCloud size={20} className="file-icon" />
                        <input type="file" className="file-input-hidden" accept="image/*" onChange={handleOcrFileChange} />
                        <span className="file-name">{ocrFile ? ocrFile.name : '点击或拖拽上传图片'}</span>
                      </div>
                    </label>
                    <div className="ocr-actions">
                      <button type="button" className="ghost ocr-btn" onClick={handleOcrRecognize} disabled={ocrLoading}>
                        {ocrLoading ? <RefreshCw className="spin" size={16} /> : <ScanText size={16} />}
                        {ocrLoading ? "识别中..." : "开始文字识别"}
                      </button>
                      {ocrProgress > 0 ? (
                        <div className="progress-bar-container">
                          <div className="progress-bar-fill" style={{ width: `${ocrProgress}%` }}></div>
                          <span className="ocr-progress">{ocrProgress}%</span>
                        </div>
                      ) : null}
                    </div>
                    {ocrStatus.message ? (
                      <div className={`status ${ocrStatus.type}`}>{ocrStatus.message}</div>
                    ) : null}
                  </div>
                  <form className="auth-form" onSubmit={handlePublish}>
                    <label className="field">
                      <span>证书名称</span>
                      <input
                        name="cert_name"
                        value={certForm.cert_name}
                        onChange={handleCertChange}
                        placeholder="请输入证书名称"
                      />
                    </label>
                    <label className="field">
                      <span>证书持有人</span>
                      <input
                        name="owner_name"
                        value={certForm.owner_name}
                        onChange={handleCertChange}
                        placeholder="请输入持有人姓名"
                      />
                    </label>
                    <label className="field">
                      <span>证书编号</span>
                      <input
                        name="cert_no"
                        value={certForm.cert_no}
                        onChange={handleCertChange}
                        placeholder="请输入证书编号"
                      />
                    </label>
                    <label className="field">
                      <span>签发机构</span>
                      <input
                        name="issuer"
                        value={certForm.issuer}
                        onChange={handleCertChange}
                        placeholder="请输入机构名称"
                      />
                    </label>
                    <label className="field">
                      <span>证书类别</span>
                      <select
                        name="cert_category"
                        value={certForm.cert_category}
                        onChange={handleCertChange}
                      >
                        {certificateCategoryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>颁发日期</span>
                      <input
                        name="issue_date"
                        type="date"
                        value={certForm.issue_date}
                        onChange={handleCertChange}
                      />
                    </label>
                    <label className="field">
                      <span>证书文件 (上链归档)</span>
                      <div className="file-input-wrapper">
                        <FileCheck size={20} className="file-icon" />
                        <input type="file" className="file-input-hidden" onChange={handleFileChange} />
                        <span className="file-name">{certFile ? certFile.name : '选择需要上链的证书文件'}</span>
                      </div>
                    </label>
                    <button type="submit" className="primary submit-btn" disabled={certLoading}>
                      {certLoading ? <RefreshCw className="spin" size={18} /> : <UploadCloud size={18} />}
                      {certLoading ? "处理中..." : isUser ? "提交草稿" : "发布证书"}
                    </button>
                  </form>

                  {certStatus.message && (
                    <div className={`status ${certStatus.type}`}>{certStatus.message}</div>
                  )}
                </section>
              )}

              {currentView === 'list' && (
                <section className="main-card wide">
                  <div className="panel-header list-header">
                    <div>
                      <div className="panel-title">证书列表</div>
                      <div className="panel-subtitle">
                        支持证书类别、证书编号、持证人、证书 Hash 搜索与分页查看
                      </div>
                    </div>
                    <div className="header-actions">
                      <button
                        type="button"
                        className="ghost icon-btn"
                        onClick={() => fetchCertificateList(listPage, listPageSize)}
                        disabled={listLoading}
                        title="刷新列表"
                      >
                        <RefreshCw size={16} className={listLoading ? "spin" : ""} />
                        刷新
                      </button>
                    </div>
                  </div>

                  <form className="list-filters" onSubmit={handleListSearch}>
                    <div className="filter-input-group">
                      <Search size={16} className="filter-icon" />
                      <input
                        name="certId"
                        value={listQuery.certId}
                        onChange={handleListQueryChange}
                        placeholder="证书编号"
                      />
                    </div>
                    <div className="filter-input-group">
                      <User size={16} className="filter-icon" />
                      <input
                        name="ownerName"
                        value={listQuery.ownerName}
                        onChange={handleListQueryChange}
                        placeholder="持证人"
                      />
                    </div>
                    <div className="filter-input-group">
                      <Building2 size={16} className="filter-icon" />
                      <select
                        name="certCategory"
                        value={listQuery.certCategory}
                        onChange={handleListQueryChange}
                      >
                        <option value="">全部类别</option>
                        {certificateCategoryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-input-group">
                      <LinkIcon size={16} className="filter-icon" />
                      <input
                        name="certHash"
                        value={listQuery.certHash}
                        onChange={handleListQueryChange}
                        placeholder="证书 Hash"
                      />
                    </div>
                    <button type="submit" className="primary search-btn" disabled={listLoading}>
                      {listLoading ? <RefreshCw className="spin" size={16} /> : <Search size={16} />}
                      搜索
                    </button>
                    <button type="button" className="ghost" onClick={handleListReset}>
                      重置
                    </button>
                  </form>

                  {listStatus.message && (
                    <div className={`status ${listStatus.type}`}>{listStatus.message}</div>
                  )}

                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>证书编号</th>
                          <th>证书类别</th>
                          <th>证书Hash</th>
                          <th>发布机构</th>
                          <th>持证人</th>
                          <th>IPFS地址</th>
                          <th>区块链交易Hash</th>
                          <th>发布时间</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listLoading ? (
                          <tr>
                            <td colSpan="9" className="table-empty">
                              <RefreshCw className="spin empty-icon" size={24} />
                              加载中...
                            </td>
                          </tr>
                        ) : listData.length > 0 ? (
                          listData.map((item) => (
                            <tr key={item.id}>
                              <td>{item.cert_no ?? item.id}</td>
                              <td>{item.cert_category || "-"}</td>
                              <td>
                                <span className="mono">{item.cert_hash}</span>
                              </td>
                              <td>{item.issuer || "-"}</td>
                              <td>{item.owner_name || "-"}</td>
                              <td>
                                {item.ipfs_hash ? (
                                  <a
                                    className="table-link"
                                    href={buildIpfsUrl(item.ipfs_hash)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Eye size={14} /> 查看
                                  </a>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td>
                                <span className="mono">{item.tx_hash || "-"}</span>
                              </td>
                              <td>{formatDateTime(item.created_at)}</td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    type="button"
                                    className="ghost small action-btn"
                                    onClick={() => handleViewCertificate(item)}
                                  >
                                    <Eye size={14} /> 详情
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost small action-btn"
                                    onClick={() =>
                                      window.open(buildTxUrl(item.tx_hash), "_blank")
                                    }
                                    disabled={!item.tx_hash}
                                  >
                                    <LinkIcon size={14} /> 交易
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost small download-btn action-btn"
                                    onClick={() => handleDownloadCertificate(item)}
                                    disabled={!item.ipfs_hash}
                                  >
                                    <Download size={14} /> 下载
                                  </button>
                                  {isAdmin ? (
                                    <button
                                      type="button"
                                      className="ghost small action-btn"
                                      onClick={() => handleAdminEditCertificate(item)}
                                      disabled={listActionLoadingId === Number(item.id)}
                                    >
                                      {listActionLoadingId === Number(item.id) ? <RefreshCw className="spin" size={14} /> : null}
                                      修改
                                    </button>
                                  ) : null}
                                  {isAdmin ? (
                                    <button
                                      type="button"
                                      className="ghost small action-btn"
                                      onClick={() => handleAdminDeleteCertificate(item)}
                                      disabled={listActionLoadingId === Number(item.id)}
                                    >
                                      {listActionLoadingId === Number(item.id) ? <RefreshCw className="spin" size={14} /> : null}
                                      删除
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="9" className="table-empty">
                              <FileCheck size={32} className="empty-icon" />
                              <p>暂无证书数据</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="pagination">
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => handlePageChange(1)}
                      disabled={listPage <= 1 || listLoading}
                    >
                      首页
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => handlePageChange(listPage - 1)}
                      disabled={listPage <= 1 || listLoading}
                    >
                      上一页
                    </button>
                    <span className="page-info">
                      第 {listPage} / {totalPages} 页，共 {listTotal} 条
                    </span>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => handlePageChange(listPage + 1)}
                      disabled={listPage >= totalPages || listLoading}
                    >
                      下一页
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={listPage >= totalPages || listLoading}
                    >
                      末页
                    </button>
                    <select value={listPageSize} onChange={handlePageSizeChange} className="ghost small">
                      <option value="10">10 条/页</option>
                      <option value="20">20 条/页</option>
                      <option value="50">50 条/页</option>
                    </select>
                  </div>

                  {selectedCert && (
                    <div className="detail-card" ref={detailRef}>
                      <div className="detail-title">证书详情</div>
                      <div className="detail-grid">
                        <div>
                          <span className="detail-label">证书编号</span>
                          <span className="detail-value">{selectedCert.cert_no ?? selectedCert.id}</span>
                        </div>
                        <div>
                          <span className="detail-label">证书名称</span>
                          <span className="detail-value">{selectedCert.cert_name || "-"}</span>
                        </div>
                        <div>
                          <span className="detail-label">证书类别</span>
                          <span className="detail-value">{selectedCert.cert_category || "-"}</span>
                        </div>
                        <div>
                          <span className="detail-label">证书 Hash</span>
                          <span className="detail-value">{selectedCert.cert_hash}</span>
                        </div>
                        <div>
                          <span className="detail-label">持证人</span>
                          <span className="detail-value">{selectedCert.owner_name || "-"}</span>
                        </div>
                        <div>
                          <span className="detail-label">颁发日期</span>
                          <span className="detail-value">{formatDate(selectedCert.issue_date)}</span>
                        </div>
                        <div>
                          <span className="detail-label">IPFS Hash</span>
                          <span className="detail-value">{selectedCert.ipfs_hash || "-"}</span>
                        </div>
                        <div>
                          <span className="detail-label">交易 Hash</span>
                          <span className="detail-value">{selectedCert.tx_hash || "-"}</span>
                        </div>
                        <div>
                          <span className="detail-label">发布时间</span>
                          <span className="detail-value">
                            {formatDateTime(selectedCert.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="detail-actions">
                        {selectedCert.ipfs_hash ? (
                          <a
                            className="ipfs-link primary-link"
                            href={buildIpfsUrl(selectedCert.ipfs_hash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Eye size={16} /> 查看证书文件
                          </a>
                        ) : (
                          <span className="token-empty">暂无 IPFS 地址</span>
                        )}
                        {selectedCert.tx_hash ? (
                          <a
                            className="ipfs-link secondary-link"
                            href={buildTxUrl(selectedCert.tx_hash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <LinkIcon size={16} /> 查看区块链交易
                          </a>
                        ) : (
                          <span className="token-empty">暂无交易 Hash</span>
                        )}
                        <button
                          type="button"
                          className="ghost small download-btn"
                          onClick={() => handleDownloadCertificate(selectedCert)}
                          disabled={!selectedCert.ipfs_hash}
                        >
                          <Download size={16} /> 下载证书
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {currentView === 'verify' && (
                <div className="verify-grid">
                  <VerifyCertificate buildIpfsUrl={buildIpfsUrl} />
                  <FileVerify />
                </div>
              )}
              {currentView === "drafts" && canApproveDrafts ? (
                <DraftListView
                  draftListLoading={draftListLoading}
                  draftListStatus={draftListStatus}
                  draftListData={draftListData}
                  draftActionLoadingId={draftActionLoadingId}
                  onRefresh={fetchDraftList}
                  onApprove={handleApproveDraft}
                />
              ) : null}
              {currentView === "authCode" && isSuperAdmin ? (
                <AuthCodePanel
                  authCodeDuration={authCodeDuration}
                  setAuthCodeDuration={setAuthCodeDuration}
                  authCodeLoading={authCodeLoading}
                  authCodeStatus={authCodeStatus}
                  authCodeResult={authCodeResult}
                  onGenerate={handleGenerateAuthCode}
                />
              ) : null}
            </div>
          </main>
          <AdminEditDialog
            dialog={adminEditDialog}
            onChange={handleAdminEditDialogChange}
            onClose={closeAdminEditDialog}
            onSubmit={submitAdminEditDialog}
            loadingId={listActionLoadingId}
          />
          <AdminDeleteDialog
            dialog={adminDeleteDialog}
            onClose={closeAdminDeleteDialog}
            onSubmit={submitAdminDeleteDialog}
            loadingId={listActionLoadingId}
          />
        </div>
      )}
    </div>
  );
}
