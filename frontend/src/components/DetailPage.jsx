import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { code, fmtDateTime } from '../constants.js';
import { useAsync, useConfirm, useLookup, useToast } from '../context.jsx';
import EntityForm from './EntityForm.jsx';
import { ErrorBox, Icon, Loading, Modal } from './ui.jsx';

/**
 * Khung trang chi tiết: tải bản ghi, header (mã, tiêu đề, sửa, xoá), modal sửa.
 * children: (data, { reload, update }) => JSX
 */
export default function DetailPage({ resource, backLabel, formFields, actions, badges, children }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshLookup } = useLookup();
  const [editing, setEditing] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api.get(resource, id), [resource, id]);

  /** Cập nhật nhanh một vài field (VD đổi trạng thái) */
  const update = async (patch, msg = 'Đã cập nhật') => {
    try {
      await api.update(resource, id, patch);
      toast(msg);
      reload();
      refreshLookup();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const save = async (values) => {
    await api.update(resource, id, values);
    toast(`Đã cập nhật ${code(resource, id)}`);
    setEditing(false);
    reload();
    refreshLookup();
  };

  const remove = async () => {
    if (!(await confirm(`Xoá ${code(resource, id)} "${data.title}"? Thao tác không thể hoàn tác.`))) return;
    try {
      await api.remove(resource, id);
      toast(`Đã xoá ${code(resource, id)}`);
      refreshLookup();
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
          <div className="detail-code mono">{code(resource, data.id)}</div>
          <h1>{data.title}</h1>
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
        <Modal wide title={`Sửa ${code(resource, data.id)}`} onClose={() => setEditing(false)}>
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
