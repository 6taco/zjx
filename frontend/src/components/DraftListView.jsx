import { RefreshCw, FileCheck } from "lucide-react";
import { formatDateTime } from "../utils/helpers.js";

export default function DraftListView({
  draftListLoading,
  draftListStatus,
  draftListData,
  draftActionLoadingId,
  onRefresh,
  onApprove
}) {
  return (
    <section className="main-card wide">
      <div className="panel-header list-header">
        <div>
          <div className="panel-title">草稿箱</div>
          <div className="panel-subtitle">
            查看普通用户提交的待确认草稿，仅所属机构管理员可确认发布
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="ghost icon-btn"
            onClick={onRefresh}
            disabled={draftListLoading}
            title="刷新草稿箱"
          >
            <RefreshCw size={16} className={draftListLoading ? "spin" : ""} />
            刷新
          </button>
        </div>
      </div>
      {draftListStatus.message ? (
        <div className={`status ${draftListStatus.type}`}>{draftListStatus.message}</div>
      ) : null}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>草稿ID</th>
              <th>证书编号</th>
              <th>证书名称</th>
              <th>持证人</th>
              <th>提交机构</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {draftListLoading ? (
              <tr>
                <td colSpan="7" className="table-empty">
                  <RefreshCw className="spin empty-icon" size={24} />
                  加载中...
                </td>
              </tr>
            ) : draftListData.length > 0 ? (
              draftListData.map((item) => (
                <tr key={item.id}>
                  <td>{item.draft_id || item.id}</td>
                  <td>{item.cert_no || "-"}</td>
                  <td>{item.cert_name || "-"}</td>
                  <td>{item.owner_name || "-"}</td>
                  <td>{item.submitted_organization || "-"}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost small action-btn"
                      onClick={() => onApprove(item)}
                      disabled={draftActionLoadingId === Number(item.id)}
                    >
                      {draftActionLoadingId === Number(item.id) ? <RefreshCw className="spin" size={14} /> : null}
                      确认发布
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="table-empty">
                  <FileCheck size={32} className="empty-icon" />
                  <p>暂无待确认草稿</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
