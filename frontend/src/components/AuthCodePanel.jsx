import { RefreshCw, KeyRound } from "lucide-react";
import { formatDateTime } from "../utils/helpers.js";

export default function AuthCodePanel({
  authCodeDuration,
  setAuthCodeDuration,
  authCodeLoading,
  authCodeStatus,
  authCodeResult,
  onGenerate
}) {
  return (
    <section className="main-card wide">
      <div className="panel-title">跨机构验证授权码生成</div>
      <div className="panel-subtitle">
        仅总管理员可生成授权码，可按时效控制可用窗口
      </div>
      <div className="auth-form">
        <label className="field">
          <span>授权码时效</span>
          <select
            value={authCodeDuration}
            onChange={(event) => setAuthCodeDuration(event.target.value)}
          >
            <option value="10">10 分钟</option>
            <option value="30">30 分钟</option>
            <option value="60">1 小时</option>
            <option value="180">3 小时</option>
            <option value="720">12 小时</option>
            <option value="1440">24 小时</option>
          </select>
        </label>
        <button
          type="button"
          className="primary submit-btn"
          onClick={onGenerate}
          disabled={authCodeLoading}
        >
          {authCodeLoading ? <RefreshCw className="spin" size={18} /> : <KeyRound size={18} />}
          {authCodeLoading ? "生成中..." : "生成授权码"}
        </button>
      </div>
      {authCodeStatus.message ? (
        <div className={`status ${authCodeStatus.type}`}>{authCodeStatus.message}</div>
      ) : null}
      {authCodeResult ? (
        <div className="verify-result">
          <div className="verify-result-header">
            <KeyRound size={16} />
            <span>最新授权码</span>
          </div>
          <div className="verify-result-grid">
            <div className="verify-result-item">
              <span className="verify-result-label">授权码</span>
              <span className="verify-result-value">{authCodeResult.code || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">时效（分钟）</span>
              <span className="verify-result-value">{authCodeResult.ttlMinutes || "-"}</span>
            </div>
            <div className="verify-result-item">
              <span className="verify-result-label">过期时间</span>
              <span className="verify-result-value">{formatDateTime(authCodeResult.expiresAt)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
