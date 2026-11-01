import { useState } from 'react';
import { code } from '../constants.js';
import { useLookup } from '../context.jsx';
import DocumentPicker from './DocumentPicker.jsx';
import { Badge, Icon } from './ui.jsx';

/** Field "Tài liệu liên quan" trong form task: danh sách đã chọn + nút mở hộp chọn từ mục Tài liệu */
export default function DocumentsField({ id, value = [], onChange }) {
  const { lookup } = useLookup();
  const [open, setOpen] = useState(false);
  const byId = new Map(lookup.documents.map((d) => [d.id, d]));
  const selected = value.map((v) => byId.get(v)).filter(Boolean);

  return (
    <div className="documents-field" id={id}>
      {selected.length > 0 && (
        <ul className="pending-files">
          {selected.map((d) => (
            <li key={d.id}>
              <span className="mono muted">{code('documents', d.id)}</span>
              <span className="pending-name">{d.title}</span>
              <Badge kind="documentType" value={d.type} />
              {d.version && <span className="muted small">v{d.version}</span>}
              <button
                type="button"
                className="icon-btn danger"
                title="Bỏ tài liệu này"
                onClick={() => onChange(value.filter((x) => x !== d.id))}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-sm btn-primary-ghost" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> {selected.length ? 'Thêm tài liệu khác' : 'Thêm tài liệu liên quan'}
      </button>
      {open && (
        <DocumentPicker
          excludeIds={value}
          onClose={() => setOpen(false)}
          confirmLabel="Chọn"
          onConfirm={(ids) => {
            onChange([...value, ...ids]);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
