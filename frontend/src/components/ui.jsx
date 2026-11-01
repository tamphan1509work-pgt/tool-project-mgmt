import { useEffect } from 'react';
import { LABELS } from '../constants.js';

export function Badge({ kind, value }) {
  if (!value) return null;
  const [text, tone] = LABELS[kind]?.[value] ?? [value, 'gray'];
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  meeting:
    'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14v11zM7 11h5v5H7z',
  task: 'M19 3h-4.18A3 3 0 0012 1a3 3 0 00-2.82 2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 0a1 1 0 110 2 1 1 0 010-2zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  test: 'M7 2v2h1v6.4L3.3 18.6A2 2 0 005 21.5h14a2 2 0 001.7-2.9L16 10.4V4h1V2H7zm3 2h4v7l2.9 5H7.1L10 11V4z',
  bug: 'M20 8h-2.81a5.98 5.98 0 00-1.82-1.96L17 4.41 15.59 3l-2.17 2.17a6 6 0 00-2.83 0L8.41 3 7 4.41l1.62 1.63A5.98 5.98 0 006.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81A6 6 0 0012 21a6 6 0 005.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  doc: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  people:
    'M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05A4.22 4.22 0 0117 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  clip: 'M16.5 6v11.5a4 4 0 01-8 0V5a2.5 2.5 0 015 0v10.5a1 1 0 01-2 0V6H10v9.5a2.5 2.5 0 005 0V5a4 4 0 00-8 0v12.5a5.5 5.5 0 0011 0V6h-1.5z',
  link: 'M3.9 12a3.1 3.1 0 013.1-3.1h4V7H7a5 5 0 000 10h4v-1.9H7A3.1 3.1 0 013.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 010 6.2h-4V17h4a5 5 0 000-10z',
  folder: 'M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  trash: 'M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  print:
    'M19 8H5a3 3 0 00-3 3v6h4v4h12v-4h4v-6a3 3 0 00-3-3zm-3 11H8v-5h8v5zm3-7a1 1 0 110-2 1 1 0 010 2zm-1-9H6v4h12V3z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  menu: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="pagination">
      <span>
        {offset + 1}–{Math.min(offset + limit, total)} / {total}
      </span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Trước
      </button>
      <span>
        Trang {page}/{pages}
      </span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Sau ›
      </button>
    </div>
  );
}

export function Loading() {
  return <div className="muted pad">Đang tải…</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-box">
      {error.message}
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

/** Văn bản nhiều dòng, giữ xuống dòng */
export function Prose({ text, placeholder = '—' }) {
  return text ? <div className="prose">{text}</div> : <span className="muted">{placeholder}</span>;
}
