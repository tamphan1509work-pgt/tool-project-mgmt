import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { code, fmtDate } from '../constants.js';
import { useConfirm, useProject, useToast } from '../context.jsx';
import { Icon, Modal } from './ui.jsx';

function ChangePasswordModal({ onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm) {
      setErrors({ confirm: 'Mật khẩu nhập lại không khớp' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await api.changePassword({ current_password: form.current_password, new_password: form.new_password });
      toast('Đã đổi mật khẩu. Các phiên đăng nhập khác đã được đăng xuất.');
      onClose();
    } catch (err) {
      setErrors(err.details ?? { _: err.message });
      setBusy(false);
    }
  };
  const field = (name, label, autoComplete) => (
    <div className="field">
      <label htmlFor={`pw-${name}`}>{label}</label>
      <input
        id={`pw-${name}`}
        type="password"
        autoComplete={autoComplete}
        value={form[name]}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        required
      />
      {errors[name] && <div className="field-error">{errors[name]}</div>}
    </div>
  );
  return (
    <Modal title="Đổi mật khẩu" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid single">
          {field('current_password', 'Mật khẩu hiện tại', 'current-password')}
          {field('new_password', 'Mật khẩu mới (ít nhất 6 ký tự)', 'new-password')}
          {field('confirm', 'Nhập lại mật khẩu mới', 'new-password')}
        </div>
        {errors._ && <div className="error-box">{errors._}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Đổi mật khẩu
          </button>
        </div>
      </form>
    </Modal>
  );
}

const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Menu người dùng: thông tin tài khoản, đổi mật khẩu, đăng xuất */
export function UserMenu() {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!user) return null;
  const signOut = async () => {
    setOpen(false);
    if (await confirm('Đăng xuất khỏi Project Hub?', { confirmLabel: 'Đăng xuất' })) await logout();
  };
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Tài khoản">
        <span className="avatar">{initialsOf(user.name)}</span>
        <span className="user-name">{user.name}</span>
      </button>
      {open && (
        <div className="user-panel" role="menu">
          <div className="user-info">
            <strong>{user.name}</strong>
            <span className="muted small">{user.email}</span>
            <span className="small">
              {user.is_admin ? (
                <span className="badge badge-purple">Quản trị viên</span>
              ) : (
                <span className="badge badge-gray">Thành viên</span>
              )}
            </span>
          </div>
          <Link to={`/members/${user.id}`} className="user-item" role="menuitem">
            Hồ sơ của tôi
          </Link>
          <button className="user-item" role="menuitem" onClick={() => (setOpen(false), setChanging(true))}>
            Đổi mật khẩu
          </button>
          <button className="user-item danger" role="menuitem" onClick={signOut}>
            Đăng xuất
          </button>
        </div>
      )}
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}

const when = (it) =>
  it.kind === 'overdue' ? `Trễ ${-it.days} ngày` : it.days === 0 ? 'Đến hạn hôm nay' : `Còn ${it.days} ngày`;

/** Chuông thông báo task / milestone trễ hoặc sắp đến hạn */
export function NotificationBell() {
  const { projectId } = useProject();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('project');
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .notifications(scope === 'project' && projectId ? { project_id: projectId } : {})
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId, scope, pathname, tick]);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const timer = setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener('pm:settings-changed', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pm:settings-changed', refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  if (!data?.enabled) return null;
  const items = data.items;
  const overdue = items.filter((i) => i.kind === 'overdue').length;

  return (
    <div className="bell" ref={ref}>
      <button
        className={`icon-btn bell-btn ${overdue ? 'has-overdue' : ''}`}
        aria-label={`Thông báo: ${items.length} mục`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={20} />
        {items.length > 0 && <span className="bell-count">{items.length > 99 ? '99+' : items.length}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Thông báo deadline">
          <div className="bell-head">
            <strong>Deadline cần chú ý</strong>
            <div className="segmented">
              <button className={scope === 'project' ? 'active' : ''} onClick={() => setScope('project')}>
                Dự án này
              </button>
              <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
                Tất cả
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="muted pad-sm">Không có task / milestone nào trễ hoặc sắp đến hạn 🎉</div>
          ) : (
            <ul className="bell-list">
              {items.map((it) => (
                <li key={`${it.type}-${it.id}`} className={it.kind}>
                  <Link to={`/${it.type === 'task' ? 'tasks' : 'milestones'}/${it.id}`}>
                    <span className="bell-title">
                      <span className="mono muted">
                        {it.project_code} · {code(it.type === 'task' ? 'tasks' : 'milestones', it.id)}
                      </span>{' '}
                      {it.type === 'milestone' && '◆ '}
                      {it.title}
                    </span>
                    <span className="bell-meta">
                      <span className={it.kind === 'overdue' ? 'text-danger' : 'text-warn'}>{when(it)}</span>
                      <span className="muted">
                        {fmtDate(it.due_date)}
                        {it.assignee && ` · ${it.assignee}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="bell-foot">
            <Link to="/settings">Cài đặt thông báo</Link>
          </div>
        </div>
      )}
    </div>
  );
}
