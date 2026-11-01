import { useState } from 'react';
import { Link } from 'react-router-dom';
import { code, options } from '../constants.js';
import { useLookup } from '../context.jsx';
import CategoryBadge from './CategoryBadge.jsx';
import { Badge, Modal } from './ui.jsx';

/**
 * Hộp chọn tài liệu của dự án (lấy từ mục Tài liệu): tìm kiếm, lọc theo loại, chọn nhiều.
 * excludeIds: tài liệu đã chọn (không hiện lại). onConfirm(ids) trả về Promise hoặc giá trị.
 */
export default function DocumentPicker({ excludeIds = [], onClose, onConfirm, confirmLabel = 'Thêm' }) {
  const { lookup } = useLookup();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const excluded = new Set(excludeIds);
  const available = lookup.documents.filter((d) => !excluded.has(d.id));
  const shown = available.filter(
    (d) =>
      (!type || d.type === type) &&
      (!q || `${d.title} ${code('documents', d.id)} ${d.version ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );

  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm([...picked]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title="Chọn tài liệu liên quan" onClose={onClose}>
      <div className="picker">
        <div className="toolbar">
          <input
            type="search"
            className="search"
            placeholder="Tìm tài liệu theo tên, mã, phiên bản…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <select aria-label="Loại tài liệu" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tất cả loại</option>
            {options('documentType').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {available.length === 0 ? (
          <div className="empty">
            {lookup.documents.length === 0 ? 'Dự án chưa có tài liệu nào.' : 'Đã chọn hết tài liệu của dự án.'}{' '}
            <Link to="/documents" onClick={onClose}>
              Mở mục Tài liệu
            </Link>{' '}
            để thêm tài liệu mới.
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">Không có tài liệu phù hợp.</div>
        ) : (
          <ul className="picker-list">
            {shown.map((d) => (
              <li key={d.id}>
                <label>
                  <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="mono muted">{code('documents', d.id)}</span>
                  <span className="picker-title">{d.title}</span>
                  <Badge kind="documentType" value={d.type} />
                  {d.version && <span className="muted small">v{d.version}</span>}
                  <CategoryBadge id={d.category_id} />
                  <Badge kind="documentStatus" value={d.status} />
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="form-actions">
          <span className="muted small">{picked.size ? `Đã chọn ${picked.size} tài liệu` : ''}</span>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || picked.size === 0} onClick={confirm}>
            {confirmLabel} {picked.size || ''} tài liệu
          </button>
        </div>
      </div>
    </Modal>
  );
}
