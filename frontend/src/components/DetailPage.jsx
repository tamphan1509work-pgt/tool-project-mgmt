import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { code, fmtDateTime } from '../constants.js';
import { useAsync, useConfirm, useLookup, useProject, useToast } from '../context.jsx';
import EntityForm from './EntityForm.jsx';
import { ErrorBox, Icon, Loading, Modal } from './ui.jsx';

/**
 * Khung trang chi tiết: tải bản ghi, header (mã, tiêu đề, sửa, xoá), modal sửa.
 * children: (data, { reload, update }) => JSX
 */
export default function DetailPage({
  resource,
  backLabel,
  formFields,
  actions,
  badges,
  children,
  scoped = true,
  codeOf = (row) => code(resource, row.id),
  nameOf = (row) => row.title,
  onChanged,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshLookup } = useLookup();
  const [editing, setEditing] = useState(false);
  const { projectId, setProjectId } = useProject();
  const { data, loading, error, reload } = useAsync(() => api.get(resource, id), [resource, id]);

  // Mở link của bản ghi thuộc dự án khác -> chuyển dự án hiện tại theo bản ghi
  // (chỉ một lần cho mỗi bản ghi, để người dùng vẫn đổi được dự án bằng bộ chọn)
  const switchedFor = useRef(null);
  useEffect(() => {
    if (!scoped || !data?.project_id) return;
    const key = `${resource}:${data.id}`;
    if (switchedFor.current === key) return;
    switchedFor.current = key;
    if (data.project_id !== projectId) setProjectId(data.project_id);
  }, [scoped, resource, data?.id, data?.project_id, projectId, setProjectId]);

  /** Cập nhật nhanh một vài field (VD đổi trạng thái) */
  const update = async (patch, msg = 'Đã cập nhật') => {
    try {
      await api.update(resource, id, patch);
      toast(msg);
      reload();
      refreshLookup();
      onChanged?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const save = async (values) => {
    const updated = await api.update(resource, id, values);
    toast(`Đã cập nhật ${codeOf(updated)}`);
    setEditing(false);
    reload();
    refreshLookup();
    onChanged?.();
  };

  const remove = async () => {
    const extra =
      resource === 'projects' ? ' Toàn bộ biên bản họp, task, test case, bug và tài liệu của dự án cũng bị xoá.' : '';
    if (!(await confirm(`Xoá ${codeOf(data)} "${nameOf(data)}"?${extra} Thao tác không thể hoàn tác.`))) return;
    try {
      await api.remove(resource, id);
      toast(`Đã xoá ${codeOf(data)}`);
      refreshLookup();
      onChanged?.();
      navigate(`/${resource}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading && !data) return <Loading />;
  if (error && !data)
    return (
      <>
        <Link to={`/${resource}`} className="back-link">
          <Icon name="back" size={16} /> {backLabel}
        </Link>
        <ErrorBox error={error} onRetry={error.status === 404 ? undefined : reload} />
      </>
    );

  return (
    <div className="detail">
      <Link to={`/${resource}`} className="back-link no-print">
        <Icon name="back" size={16} /> {backLabel}
      </Link>
      <div className="detail-head">
        <div>
          <div className="detail-code mono">{codeOf(data)}</div>
          <h1>{nameOf(data)}</h1>
          <div className="detail-badges">
            {badges?.(data)}
            <span className="muted small">
              Tạo {fmtDateTime(data.created_at)} · Cập nhật {fmtDateTime(data.updated_at)}
            </span>
          </div>
        </div>
        <div className="detail-actions no-print">
          {actions?.(data, { update, reload })}
          <button className="btn" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> Sửa
          </button>
          <button className="btn btn-danger-ghost" onClick={remove}>
            <Icon name="trash" size={16} /> Xoá
          </button>
        </div>
      </div>

      {children(data, { reload, update })}

      {editing && (
        <Modal wide title={`Sửa ${codeOf(data)}`} onClose={() => setEditing(false)}>
          <EntityForm fields={formFields} initial={data} onSubmit={save} onCancel={() => setEditing(false)} />
        </Modal>
      )}
    </div>
  );
}

/** Danh sách cặp nhãn / giá trị */
export function InfoList({ items }) {
  return (
    <dl className="info-list">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v || v === 0 ? v : <span className="muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, extra }) {
  return (
    <section className="card section">
      <div className="section-head">
        <h3>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** Danh sách các bản ghi liên kết ngắn gọn */
export function LinkedList({ resource, items, render, empty = 'Không có' }) {
  if (!items?.length) return <div className="muted">{empty}</div>;
  return (
    <ul className="linked-list">
      {items.map((it) => (
        <li key={it.id}>
          <Link to={`/${resource}/${it.id}`}>
            <span className="mono">{code(resource, it.id)}</span> {it.title}
          </Link>
          <span className="linked-meta">{render?.(it)}</span>
        </li>
      ))}
    </ul>
  );
}
