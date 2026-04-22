import { useRef, useState } from "react";
import { Search, ShieldCheck, Link as LinkIcon } from "lucide-react";

export default function VerifyCertificate({ buildIpfsUrl }) {
  const [inputValue, setInputValue] = useState("");
  const [authorizationInput, setAuthorizationInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [result, setResult] = useState(null);
  const [pendingValue, setPendingValue] = useState("");
  const [showAuthorizationDialog, setShowAuthorizationDialog] = useState(false);
  const requestControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const logVerifyResult = async ({ certHash, resultValue }) => {
    const safeCertHash = String(certHash || "").trim();
    if (!safeCertHash) {
      return;
    }
    const response = await fetch("/api/verify/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        cert_hash: safeCertHash,
        result: resultValue
      })
    });
    if (!response.ok) {
      throw new Error("验证日志写入失败");
    }
  };

  const formatTimestamp = (value) => {
    if (value === null || value === undefined) {
      return "-";
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return String(value);
    }
    const date = new Date(numeric * 1000);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString("zh-CN", { hour12: false });
  };

  const executeVerify = async ({ verifyValue, authorization }) => {
    const safeVerifyValue = String(verifyValue || "").trim();
    if (!safeVerifyValue) {
      setStatus({ type: "error", message: "缺少待验证内容，请重新输入后再试" });
      return;
    }
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setStatus({ type: "", message: "" });
    setResult(null);

    try {
      const headers = {};
      if (authorization.trim()) {
        headers["x-verify-authorization"] = authorization.trim();
      }
      const res = await fetch(
        `/api/certificates/verify/${encodeURIComponent(safeVerifyValue)}`,
        {
          headers,
          signal: controller.signal
        }
      );
      if (requestId !== requestIdRef.current) {
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({
          type: "error",
          message: data.message || "证书验证失败"
        });
        return;
      }
      if (data.encrypted) {
        setResult({
          encrypted: true,
          payload: data.data || null
        });
        setStatus({
          type: "error",
          message: data.message || "未授权，当前仅返回加密内容"
        });
        return;
      }
      const verifiedData = data.data || null;
      setResult({
        encrypted: false,
        payload: verifiedData
      });
      setStatus({ type: "success", message: "验证成功" });
      logVerifyResult({
        certHash: verifiedData?.cert_hash || safeVerifyValue,
        resultValue: "成功"
      }).catch(() => {
        return undefined;
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      setStatus({ type: "error", message: "网络异常，请稍后再试" });
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "请输入证书 Hash 或证书编号" });
      setResult(null);
      return;
    }
    setPendingValue(trimmed);
    setShowAuthorizationDialog(true);
  };

  const handleAuthorizedVerify = async () => {
    if (loading || inFlightRef.current) {
      return;
    }
    if (!authorizationInput.trim()) {
      setStatus({ type: "error", message: "请输入授权码后再进行授权验证" });
      return;
    }
    setShowAuthorizationDialog(false);
    await executeVerify({
      verifyValue: pendingValue,
      authorization: authorizationInput
    });
  };

  const handleDirectVerify = async () => {
    if (loading || inFlightRef.current) {
      return;
    }
    setShowAuthorizationDialog(false);
    await executeVerify({
      verifyValue: pendingValue,
      authorization: ""
    });
  };

  return (
    <section className="main-card">
      <div className="panel-title">证书验证</div>
      <div className="panel-subtitle">输入证书 Hash 或证书编号进行链上验证</div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>证书编号 / Hash</span>
          <div className="input-with-icon">
            <Search className="input-icon" size={18} />
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="请输入证书 Hash 或证书编号"
            />
          </div>
        </label>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? "验证中..." : <><ShieldCheck size={18} />开始验证</>}
        </button>
      </form>

      {status.message && <div className={`status ${status.type}`}>{status.message}</div>}

      {result?.encrypted ? (
        <div className="verify-result">
          <div className="verify-result-header">
            <ShieldCheck size={16} />
            <span>未授权，已返回加密验证内容</span>
          </div>
          <div className="verify-result-grid">
            <div className="verify-result-item">
              <span className="verify-result-label">密文</span>
              <span className="verify-result-value">{result.payload?.ciphertext || "-"}</span>
            </div>
          </div>
        </div>
      ) : result?.payload ? (
        <div className="verify-result">
          <div className="verify-result-header">
            <ShieldCheck size={16} />
            <span>验证通过，证书信息如下</span>
          </div>
          <div className="verify-result-grid">
            <div className="verify-result-item">
              <span className="verify-result-label">证书 Hash</span>
              <span className="verify-result-value">{result.payload.cert_hash || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">IPFS 地址</span>
              <span className="verify-result-value">{result.payload.ipfs_hash || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">发布者地址</span>
              <span className="verify-result-value">{result.payload.issuer || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">证书发布机构</span>
              <span className="verify-result-value">{result.payload.organizationName || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">机构钱包地址</span>
              <span className="verify-result-value">{result.payload.walletAddress || result.payload.issuer || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">机构认证状态</span>
              <span className="verify-result-value">{result.payload.status || "未认证"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">上链时间</span>
              <span className="verify-result-value">{formatTimestamp(result.payload.timestamp)}</span>
            </div>
          </div>
          {result.payload.ipfs_hash ? (
            <a
              className="verify-result-link primary-link"
              href={buildIpfsUrl(result.payload.ipfs_hash)}
              target="_blank"
              rel="noreferrer"
            >
              <LinkIcon size={14} /> 打开 IPFS 文件
            </a>
          ) : null}
        </div>
      ) : (
        <span className="verify-result-empty">验证完成后展示证书信息</span>
      )}
      {showAuthorizationDialog ? (
        <div className="dialog-overlay">
          <div className="dialog-card">
            <div className="dialog-title">跨机构验证授权</div>
            <div className="dialog-subtitle">
              请输入正确授权码获取可见结果；若直接验证将返回加密不可见内容。
            </div>
            <label className="field">
              <span>授权码</span>
              <input
                type="password"
                value={authorizationInput}
                onChange={(event) => setAuthorizationInput(event.target.value)}
                placeholder="请输入授权码"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setShowAuthorizationDialog(false)}>
                取消
              </button>
              <button type="button" className="ghost" onClick={handleDirectVerify} disabled={loading}>
                直接验证
              </button>
              <button type="button" className="primary" onClick={handleAuthorizedVerify} disabled={loading}>
                授权验证
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
