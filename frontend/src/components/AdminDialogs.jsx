import { RefreshCw } from "lucide-react";
import { certificateCategoryOptions } from "../utils/helpers.js";

export function AdminEditDialog({
  dialog,
  onChange,
  onClose,
  onSubmit,
  loadingId
}) {
  if (!dialog.open) {
    return null;
  }
  const isLoading = loadingId === Number(dialog.target?.id || 0);

  return (
    <div className="dialog-overlay">
      <div className="dialog-card">
        <div className="dialog-title">修改证书信息</div>
        <div className="dialog-subtitle">
          当前证书编号：{dialog.target?.cert_no ?? dialog.target?.id}
        </div>
        <form className="dialog-form" onSubmit={onSubmit}>
          <label className="field">
            <span>证书名称</span>
            <input
              name="cert_name"
              value={dialog.form.cert_name}
              onChange={onChange}
              placeholder="请输入证书名称"
            />
          </label>
          <label className="field">
            <span>持证人</span>
            <input
              name="owner_name"
              value={dialog.form.owner_name}
              onChange={onChange}
              placeholder="请输入持证人姓名"
            />
          </label>
          <label className="field">
            <span>发布机构</span>
            <input
              name="issuer"
              value={dialog.form.issuer}
              onChange={onChange}
              placeholder="请输入发布机构"
            />
          </label>
          <label className="field">
            <span>证书编号</span>
            <input
              name="cert_no"
              value={dialog.form.cert_no}
              onChange={onChange}
              placeholder="请输入证书编号"
            />
          </label>
          <label className="field">
            <span>证书类别</span>
            <select
              name="cert_category"
              value={dialog.form.cert_category}
              onChange={onChange}
            >
              <option value="">请选择类别</option>
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
              value={dialog.form.issue_date}
              onChange={onChange}
            />
          </label>
          <div className="dialog-actions">
            <button type="button" className="ghost" onClick={onClose} disabled={isLoading}>
              取消
            </button>
            <button type="submit" className="primary" disabled={isLoading}>
              {isLoading ? <RefreshCw className="spin" size={16} /> : null}
              保存修改
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminDeleteDialog({
  dialog,
  onClose,
  onSubmit,
  loadingId
}) {
  if (!dialog.open) {
    return null;
  }
  const isLoading = loadingId === Number(dialog.target?.id || 0);

  return (
    <div className="dialog-overlay">
      <div className="dialog-card danger">
        <div className="dialog-title">确认删除证书</div>
        <div className="dialog-subtitle">
          即将删除证书【{dialog.target?.cert_no ?? dialog.target?.id}】，删除后不可恢复。
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={isLoading}>
            取消
          </button>
          <button type="button" className="primary danger-btn" onClick={onSubmit} disabled={isLoading}>
            {isLoading ? <RefreshCw className="spin" size={16} /> : null}
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
