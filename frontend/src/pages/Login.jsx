import { useState } from 'react';
import { useAuth } from '../auth.jsx';

const IS_DEMO = import.meta.env.MODE === 'demo';
const DEMO_ACCOUNTS = [
  ['an.nguyen@example.com', 'Nguyễn Văn An', 'Quản trị viên · PM'],
  ['binh.tran@example.com', 'Trần Thị Bình', 'BA'],
  ['dung.pham@example.com', 'Phạm Thu Dung', 'Tester'],
];

function PasswordInput({ id, value, onChange, autoComplete, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
      />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow((v) => !v)} aria-pressed={show}>
        {show ? 'Ẩn' : 'Hiện'}
      </button>
    </div>
  );
}

/** Màn hình đăng nhập (hoặc tạo tài khoản quản trị đầu tiên khi hệ thống chưa có tài khoản) */
export default function LoginPage() {
  const auth = useAuth();
  const isSetup = auth.status === 'setup';
  const [form, setForm] = useState({
    name: '',
    email: IS_DEMO ? DEMO_ACCOUNTS[0][0] : '',
    password: IS_DEMO ? '123456' : '',
    confirm: '',
    remember: true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isSetup && form.password !== form.confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    try {
      if (isSetup) await auth.setup({ name: form.name, email: form.email, password: form.password });
      else await auth.login(form.email, form.password, form.remember);
    } catch (err) {
      setError(Object.values(err.details ?? {})[0] ?? err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-brand">
          <span className="brand-logo">✓</span> Project Hub
        </div>
        <h1>{isSetup ? 'Tạo tài khoản quản trị' : 'Đăng nhập'}</h1>
        <p className="muted">
          {isSetup
            ? 'Hệ thống chưa có tài khoản nào. Tạo tài khoản quản trị viên đầu tiên để bắt đầu.'
            : 'Quản lý dự án phần mềm: meeting minutes, task, test report, bug, tài liệu.'}
        </p>
        {auth.expired && !isSetup && <div className="warn-box">Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.</div>}
        <form className="login-form" onSubmit={submit}>
          {isSetup && (
            <div className="field">
              <label htmlFor="login-name">Họ tên</label>
              <input
                id="login-name"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Mật khẩu</label>
            <PasswordInput
              id="login-password"
              value={form.password}
              onChange={set('password')}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
            />
          </div>
          {isSetup ? (
            <div className="field">
              <label htmlFor="login-confirm">Nhập lại mật khẩu</label>
              <PasswordInput
                id="login-confirm"
                value={form.confirm}
                onChange={set('confirm')}
                autoComplete="new-password"
              />
              <div className="hint">Ít nhất 6 ký tự.</div>
            </div>
          ) : (
            <label className="toggle">
              <input type="checkbox" checked={form.remember} onChange={(e) => set('remember')(e.target.checked)} />
              Ghi nhớ đăng nhập (30 ngày)
            </label>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Đang xử lý…' : isSetup ? 'Tạo tài khoản & đăng nhập' : 'Đăng nhập'}
          </button>
        </form>
        {IS_DEMO && !isSetup && (
          <div className="demo-accounts">
            <div className="muted small">
              Tài khoản demo (mật khẩu <code>123456</code>) — bấm để điền:
            </div>
            <ul>
              {DEMO_ACCOUNTS.map(([email, name, role]) => (
                <li key={email}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setForm((f) => ({ ...f, email, password: '123456' }))}
                  >
                    {name}
                  </button>{' '}
                  <span className="muted small">
                    {role} · {email}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
