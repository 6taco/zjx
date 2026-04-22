import {
  ShieldCheck,
  Lock,
  Mail,
  Building2,
  Shield,
  FileCheck,
  User,
  KeyRound,
  RefreshCw
} from "lucide-react";

export default function LoginPage({
  mode,
  form,
  loading,
  status,
  canSubmit,
  emailCodeLoading,
  emailCodeStatus,
  emailCodeCountdown,
  onSwitchMode,
  onChange,
  onSubmit,
  onSendEmailCode
}) {
  const isRegister = mode === "register";

  return (
    <>
      <div className="auth-hero">
        <div className="hero-brand">
          <Shield className="brand-icon" size={24} />
          电子证书跨机构可信验证平台
        </div>
        <h1>可信身份管理</h1>
        <p>基于区块链与去中心化存储的安全、便捷、可扩展的用户认证与证书发布平台</p>
        <div className="hero-tags">
          <span><ShieldCheck size={14} /> 智能合约上链</span>
          <span><Lock size={14} /> IPFS 永久存储</span>
          <span><FileCheck size={14} /> OCR 智能识别</span>
        </div>
        <div className="hero-card">
          <h3>功能亮点</h3>
          <ul>
            <li>注册即刻创建用户档案，安全加密存储</li>
            <li>上传证书自动识别关键信息并一键发布上链</li>
            <li>支持跨机构可信验证，防止数据篡改与伪造</li>
          </ul>
        </div>
      </div>

      <div className="auth-panel">
        <div className="panel-header">
          <div className="tabs">
            <button
              type="button"
              className={mode === "login" ? "tab active" : "tab"}
              onClick={() => onSwitchMode("login")}
            >
              <User size={16} />
              登录
            </button>
            <button
              type="button"
              className={mode === "register" ? "tab active" : "tab"}
              onClick={() => onSwitchMode("register")}
            >
              <FileCheck size={16} />
              注册
            </button>
          </div>
          <div className="panel-title">
            {isRegister ? "欢迎注册新账号" : "欢迎回来"}
          </div>
          <div className="panel-subtitle">
            {isRegister
              ? "创建账号后即可登录进入工作台"
              : "登录后可管理和发布您的电子证书"}
          </div>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="field">
            <span>用户名</span>
            <div className="input-with-icon">
              <User className="input-icon" size={18} />
              <input
                name="username"
                value={form.username}
                onChange={onChange}
                placeholder="请输入用户名"
                autoComplete="username"
              />
            </div>
          </label>
          <label className="field">
            <span>密码</span>
            <div className="input-with-icon">
              <Lock className="input-icon" size={18} />
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={onChange}
                placeholder="请输入密码"
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </div>
          </label>
          {isRegister && (
            <>
              <label className="field">
                <span>邮箱</span>
                <div className="input-with-icon">
                  <Mail className="input-icon" size={18} />
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={onChange}
                    placeholder="name@example.com"
                  />
                </div>
              </label>
              <label className="field">
                <span>邮箱验证码</span>
                <div className="verify-code-row">
                  <div className="input-with-icon verify-code-input">
                    <KeyRound className="input-icon" size={18} />
                    <input
                      name="emailCode"
                      value={form.emailCode}
                      onChange={onChange}
                      placeholder="请输入6位验证码"
                      maxLength={6}
                    />
                  </div>
                  <button
                    type="button"
                    className="ghost small verify-code-btn"
                    disabled={emailCodeLoading || emailCodeCountdown > 0}
                    onClick={onSendEmailCode}
                  >
                    {emailCodeLoading
                      ? "发送中..."
                      : emailCodeCountdown > 0
                        ? `${emailCodeCountdown}s`
                        : "发送验证码"}
                  </button>
                </div>
              </label>
              {emailCodeStatus.message && (
                <div className={`status ${emailCodeStatus.type}`}>{emailCodeStatus.message}</div>
              )}
              <label className="field">
                <span>机构</span>
                <div className="input-with-icon">
                  <Building2 className="input-icon" size={18} />
                  <input
                    name="organization"
                    value={form.organization}
                    onChange={onChange}
                    placeholder="请输入机构名称"
                  />
                </div>
              </label>
              <input type="hidden" name="role" value="user" />
            </>
          )}

          <button type="submit" className="primary submit-btn" disabled={!canSubmit || loading}>
            {loading ? <RefreshCw className="spin" size={18} /> : (isRegister ? "创建账号" : "登录账号")}
          </button>
        </form>

        {status.message && (
          <div className={`status ${status.type}`}>{status.message}</div>
        )}
      </div>
    </>
  );
}
