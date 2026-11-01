import { useState } from 'react';
import { Icon } from './ui.jsx';

/** Ô nhập mật khẩu có icon con mắt để ẩn / hiện mật khẩu */
export default function PasswordInput({ id, value, onChange, autoComplete, placeholder, autoFocus, required = true }) {
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
        autoFocus={autoFocus}
        required={required}
      />
      <button
        type="button"
        className="password-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={show}
        title={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}
