import {
  LayoutDashboard,
  Search,
  ShieldCheck,
  LogOut,
  User,
  Shield,
  FileCheck,
  X,
  KeyRound
} from "lucide-react";

export default function Sidebar({
  currentView,
  setCurrentView,
  isSidebarOpen,
  setIsSidebarOpen,
  canApproveDrafts,
  isSuperAdmin,
  profile,
  username,
  onLogout
}) {
  const navigate = (view) => {
    setCurrentView(view);
    setIsSidebarOpen(false);
  };

  return (
    <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
      <div className="sidebar-brand">
        <Shield className="brand-icon" size={24} />
        <span>电子证书可信平台</span>
        <button className="mobile-close" onClick={() => setIsSidebarOpen(false)}>
          <X size={20} />
        </button>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${currentView === "dashboard" ? "active" : ""}`}
          onClick={() => navigate("dashboard")}
        >
          <LayoutDashboard size={20} />
          <span>工作台</span>
        </button>
        <button
          className={`nav-item ${currentView === "list" ? "active" : ""}`}
          onClick={() => navigate("list")}
        >
          <Search size={20} />
          <span>证书查询</span>
        </button>
        <button
          className={`nav-item ${currentView === "verify" ? "active" : ""}`}
          onClick={() => navigate("verify")}
        >
          <ShieldCheck size={20} />
          <span>链上验证</span>
        </button>
        {canApproveDrafts ? (
          <button
            className={`nav-item ${currentView === "drafts" ? "active" : ""}`}
            onClick={() => navigate("drafts")}
          >
            <FileCheck size={20} />
            <span>草稿箱</span>
          </button>
        ) : null}
        {isSuperAdmin ? (
          <button
            className={`nav-item ${currentView === "authCode" ? "active" : ""}`}
            onClick={() => navigate("authCode")}
          >
            <KeyRound size={20} />
            <span>授权码管理</span>
          </button>
        ) : null}
      </nav>
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">
            <User size={20} />
          </div>
          <div className="user-info">
            <strong>{profile?.username || username}</strong>
            <span>{profile?.organization || "已登录用户"}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          <LogOut size={18} />
          退出登录
        </button>
      </div>
    </aside>
  );
}
