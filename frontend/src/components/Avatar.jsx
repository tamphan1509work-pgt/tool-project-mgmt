import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLookup, useToast } from '../context.jsx';

const PALETTE = ['#4f46e5', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0f766e', '#be185d'];
const colorOf = (name = '') =>
  PALETTE[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
export const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

/** Ảnh đại diện: ảnh đã tải lên, hoặc chữ cái đầu trên nền màu riêng của từng người */
export function Avatar({ name, src, size = 28 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src) return <img className="avatar-img" src={src} alt="" style={style} />;
  return (
    <span className="avatar-initials" style={{ ...style, background: colorOf(name) }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/** Tooltip nổi (vẽ ngoài bảng nên không bị khung cuộn che) */
function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setTip(null);
  return { tip, handlers: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide } };
}

/**
 * Avatar của một người theo tên (khớp với danh bạ thành viên); rê chuột / focus hiện tên và email.
 * Tên không khớp thành viên nào (VD "Phòng Kinh doanh") vẫn hiện chữ cái đầu và tên.
 */
export function PersonAvatar({ name, size = 28, showName = false }) {
  const { lookup } = useLookup();
  const { tip, handlers } = useTooltip();
  if (!name) return <span className="muted">—</span>;
  const key = name.trim().toLowerCase();
  const m = lookup.allMembers.find((x) => x.name.trim().toLowerCase() === key);
  const label = m?.email ? `${name} (${m.email})` : name;
  return (
    <span className="person-avatar" tabIndex={0} aria-label={label} {...handlers}>
      <Avatar name={name} src={m?.avatar} size={size} />
      {showName && <span className="person-name">{name}</span>}
      {tip &&
        createPortal(
          <span className="person-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
            <strong>{name}</strong>
            {m?.email ? <span>{m.email}</span> : <span className="person-tip-muted">Không có email</span>}
          </span>,
          document.body,
        )}
    </span>
  );
}

/** Thu nhỏ & cắt vuông ảnh thành 128×128 JPEG (data URL) */
function resizeImage(file, size = 128) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh'));
    };
    img.src = url;
  });
}

/** Ô chọn ảnh đại diện trong form thành viên */
export function AvatarField({ id, value, onChange, name }) {
  const toast = useToast();
  const ref = useRef(null);
  return (
    <div className="avatar-field">
      <Avatar name={name || '?'} src={value || null} size={64} />
      <div className="avatar-field-actions">
        <button type="button" className="btn btn-sm" onClick={() => ref.current?.click()}>
          {value ? 'Đổi ảnh' : 'Chọn ảnh'}
        </button>
        {value && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange('')}>
            Xoá ảnh
          </button>
        )}
        <span className="muted small">Ảnh được cắt vuông và thu nhỏ còn 128×128 px.</span>
      </div>
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const file = e.target.files[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) return toast('Ảnh quá lớn (tối đa 10 MB)', 'error');
          try {
            onChange(await resizeImage(file));
          } catch (err) {
            toast(err.message, 'error');
          }
        }}
      />
    </div>
  );
}

/** "A, B" hoặc ['A', 'B'] -> ['A', 'B'] */
export const splitPeople = (v) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((x) => x.trim()).filter(Boolean);

/**
 * Nhiều người (PIC, Hỗ trợ): avatar xếp chồng, rê chuột từng avatar hiện tên & email.
 * showName: hiện tên cạnh avatar (dạng danh sách, dùng ở trang chi tiết)
 */
export function PeopleAvatars({ value, size = 26, max = 4, showName = false, empty }) {
  const names = splitPeople(value);
  if (!names.length) return empty ?? <span className="muted">—</span>;
  if (showName) {
    return (
      <span className="people-list">
        {names.map((n) => (
          <PersonAvatar key={n} name={n} size={size} showName />
        ))}
      </span>
    );
  }
  const shown = names.length > max ? names.slice(0, max - 1) : names;
  const rest = names.length - shown.length;
  return (
    <span className="people-stack" aria-label={names.join(', ')}>
      {shown.map((n) => (
        <PersonAvatar key={n} name={n} size={size} />
      ))}
      {rest > 0 && (
        <span className="people-more" title={names.slice(shown.length).join(', ')} style={{ width: size, height: size }}>
          +{rest}
        </span>
      )}
    </span>
  );
}
