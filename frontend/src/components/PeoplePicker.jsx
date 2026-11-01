import { useMemo, useRef, useState } from 'react';
import { useLookup } from '../context.jsx';
import { Avatar } from './Avatar.jsx';
import { fold } from './MentionTextarea.jsx';

/**
 * Chọn nhiều người (PIC, Hỗ trợ): gõ để tìm thành viên dự án, Enter / bấm để thêm;
 * gõ tên ngoài danh sách rồi Enter cũng thêm được. Backspace khi ô trống để bỏ người cuối.
 * value: ['Tên', ...]
 */
export default function PeoplePicker({ id, value = [], onChange, placeholder = 'Gõ tên để thêm…' }) {
  const { lookup } = useLookup();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const chosen = new Set(value.map((n) => n.toLowerCase()));

  // Thành viên dự án trước, sau đó các tên đã dùng trong dự án
  const options = useMemo(() => {
    const byKey = new Map();
    for (const m of lookup.members) byKey.set(m.name.toLowerCase(), { name: m.name, email: m.email, member: true });
    for (const n of lookup.people) if (!byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), { name: n });
    return [...byKey.values()];
  }, [lookup.members, lookup.people]);

  const matches = options
    .filter((o) => !chosen.has(o.name.toLowerCase()))
    .filter((o) => !q.trim() || fold(o.name).includes(fold(q.trim())))
    .slice(0, 8);

  const add = (name) => {
    const n = name.replace(/,/g, ' ').trim().replace(/\s+/g, ' ');
    if (n && !chosen.has(n.toLowerCase())) onChange([...value, n]);
    setQ('');
    setActive(0);
    inputRef.current?.focus();
  };
  const remove = (name) => onChange(value.filter((n) => n !== name));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (matches.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === ',') {
      // Không gửi form khi đang chọn người
      if (q.trim() || (open && matches.length && e.key === 'Enter')) {
        e.preventDefault();
        add(open && matches[active] ? matches[active].name : q);
      }
    } else if (e.key === 'Backspace' && !q && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const avatarOf = (name) => lookup.allMembers.find((m) => m.name.toLowerCase() === name.toLowerCase())?.avatar;

  return (
    <div className="people-picker" onClick={() => inputRef.current?.focus()}>
      {value.map((n) => (
        <span key={n} className="people-chip">
          <Avatar name={n} src={avatarOf(n)} size={20} />
          {n}
          <button
            type="button"
            aria-label={`Bỏ ${n}`}
            onClick={(e) => {
              e.stopPropagation();
              remove(n);
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        value={q}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        // Menu dùng onMouseDown + preventDefault nên ô nhập không mất focus khi chọn; rời ô là đóng ngay
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && matches.length > 0}
      />
      {open && matches.length > 0 && (
        <ul className="mention-menu people-menu" role="listbox">
          {matches.map((o, i) => (
            <li
              key={o.name}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                add(o.name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Avatar name={o.name} src={avatarOf(o.name)} size={24} />
              <span className="mention-name">{o.name}</span>
              {o.email && <span className="muted small">{o.email}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
