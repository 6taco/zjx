import { useRef, useState } from "react";
import { FileCheck, UploadCloud, RefreshCw } from "lucide-react";

export default function FileVerify() {
  const [authorizationInput, setAuthorizationInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [result, setResult] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
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

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0];
    if (nextFile) {
      setSelectedFileName(nextFile.name);
      setStatus({ type: "info", message: "已选择文件，可点击“验证文件”开始比对" });
    } else {
      setSelectedFileName("");
      setStatus({ type: "", message: "" });
    }
    setResult(null);
  };

  const executeVerify = async ({ selectedFile, authorization }) => {
    if (!(selectedFile instanceof File) || selectedFile.size <= 0) {
      setStatus({ type: "error", message: "未找到待验证文件，请重新上传" });
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
      const formData = new FormData();
      formData.append("file", selectedFile);
      const headers = {};
      if (authorization.trim()) {
        headers["x-verify-authorization"] = authorization.trim();
      }
      const res = await fetch("/api/certificates/verify-file", {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({
          type: "error",
          message: data.message || "文件验证失败"
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
      const nextResult = data.data || null;
      setResult({
        encrypted: false,
        payload: nextResult
      });
      logVerifyResult({
        certHash: nextResult?.chainHash || nextResult?.fileHash,
        resultValue: nextResult?.result || "未知"
      }).catch(() => {
        return undefined;
      });
      if (nextResult?.result === "真实") {
        setStatus({ type: "success", message: "验证成功：文件真实" });
      } else if (nextResult?.result === "未上链") {
        setStatus({ type: "error", message: "验证完成：文件存在于系统中，但尚未上链" });
      } else {
        setStatus({ type: "error", message: "验证完成：文件被篡改" });
      }
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
    const submitFormData = new FormData(event.currentTarget);
    const selectedFile = submitFormData.get("file");
    if (!(selectedFile instanceof File) || selectedFile.size <= 0) {
      setStatus({ type: "error", message: "请先上传证书文件" });
      setResult(null);
      return;
    }
    setPendingFile(selectedFile);
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
    if (!(pendingFile instanceof File) || pendingFile.size <= 0) {
      setStatus({ type: "error", message: "未找到待验证文件，请重新上传" });
      setShowAuthorizationDialog(false);
      return;
    }
    setShowAuthorizationDialog(false);
    await executeVerify({
      selectedFile: pendingFile,
      authorization: authorizationInput
    });
  };

  const handleDirectVerify = async () => {
    if (loading || inFlightRef.current) {
      return;
    }
    if (!(pendingFile instanceof File) || pendingFile.size <= 0) {
      setStatus({ type: "error", message: "未找到待验证文件，请重新上传" });
      setShowAuthorizationDialog(false);
      return;
    }
    setShowAuthorizationDialog(false);
    await executeVerify({
      selectedFile: pendingFile,
      authorization: ""
    });
  };

  return (
    <section className="main-card">
      <div className="panel-title">证书文件真实性验证</div>
      <div className="panel-subtitle">上传证书文件，系统将计算 SHA256 并与链上证书哈希比对</div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>证书文件</span>
          <div className="file-input-wrapper">
            <UploadCloud size={20} className="file-icon" />
            <input name="file" type="file" className="file-input-hidden" onChange={handleFileChange} />
            <span className={`file-name ${selectedFileName ? "selected" : ""}`}>
              {selectedFileName || "点击或拖拽上传证书文件"}
            </span>
          </div>
        </label>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? <RefreshCw className="spin" size={18} /> : <FileCheck size={18} />}
          {loading ? "验证中..." : "验证文件"}
        </button>
      </form>

      {status.message && <div className={`status ${status.type}`}>{status.message}</div>}

      {result?.encrypted ? (
        <div className="verify-result">
          <div className="verify-result-header">
            <FileCheck size={16} />
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
            <FileCheck size={16} />
            <span>文件真实性验证结果</span>
          </div>
          <div className="verify-result-grid">
            <div className="verify-result-item">
              <span className="verify-result-label">文件 Hash</span>
              <span className="verify-result-value">{result.payload.fileHash || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">链上证书 Hash</span>
              <span className="verify-result-value">{result.payload.chainHash || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">验证结果</span>
              <span className="verify-result-value">{result.payload.result || "-"}</span>
            </div>
          </div>
        </div>
      ) : (
        <span className="verify-result-empty">验证完成后展示结果</span>
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
