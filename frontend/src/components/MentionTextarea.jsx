import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLookup } from '../context.jsx';
import { Avatar } from './Avatar.jsx';

/** Bỏ dấu tiếng Việt + chữ thường để tìm tên gần đúng ("hu" khớp "Huy", "chau" khớp "Châu") */
export const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const rank = (p, q) => {
  const name = fold(p.name);
  if (name.startsWith(q)) return 0;
  if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
  return 2;
};

/** Đoạn "@..." đang gõ ngay trước con trỏ (null nếu không phải đang nhắc tên) */
function mentionQuery(text, caret) {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null; // "email@abc" không phải nhắc tên
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@]/.test(query)) return null;
  return { start: at, query };
}

/**
 * Ô nhập bình luận có gợi ý @thành viên của dự án.
 * Gõ "@" rồi vài chữ của tên -> chọn bằng chuột hoặc ↑ ↓ Enter / Tab.
 * people: [{ id, name, email }] (thành viên dự án), excludeId: không gợi ý chính mình
 */
export default function MentionTextarea({ value, onChange, onSubmit, onCancel, people, excludeId, ...rest }) {
  const ref = useRef(null);
  const { lookup } = useLookup();
  const [state, setState] = useState(null); // { start, query }
  const [active, setActive] = useState(0);
  const pendingCaret = useRef(null);
  // Đặt con trỏ ngay sau tên vừa chèn, trước khi người dùng gõ tiếp
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const matches = useMemo(() => {
    if (!state) return [];
    const q = fold(state.query.trim());
    return people
      .filter((p) => p.id !== excludeId)
      .filter((p) => {
        const name = fold(p.name);
        return !q || name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q)) || name.includes(q);
      })
      .sort((a, b) => rank(a, q) - rank(b, q))
      .slice(0, 6);
  }, [state, people, excludeId]);
  const open = Boolean(state) && matches.length > 0;

  const sync = (el) => {
    const next = mentionQuery(el.value, el.selectionStart ?? el.value.length);
    setState(next);
    if (next?.query !== state?.query) setActive(0);
  };

  const pick = (p) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const insert = `@${p.name} `;
    const next = value.slice(0, state.start) + insert + value.slice(caret);
    pendingCaret.current = state.start + insert.length;
    onChange(next);
    setState(null);
  };

  const onKeyDown = (e) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a + step + matches.length) % matches.length);
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[active] ?? matches[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setState(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit?.();
    } else if (e.key === 'Escape') onCancel?.();
  };

  return (
    <div className="mention-input">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && sync(e.target)}
        onClick={(e) => sync(e.target)}
        onBlur={() => setTimeout(() => setState(null), 150)}
        aria-autocomplete="list"
        aria-expanded={open}
        {...rest}
      />
      {open && (
        <ul className="mention-menu" role="listbox" aria-label="Chọn thành viên để nhắc tên">
          {matches.map((p, i) => {
            const info = lookup.allMembers.find((m) => m.id === p.id);
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <Avatar name={p.name} src={info?.avatar} size={24} />
                <span className="mention-name">{p.name}</span>
                {p.email && <span className="muted small">{p.email}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
