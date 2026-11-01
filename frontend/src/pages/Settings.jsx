import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading, Modal } from '../components/ui.jsx';
import { useConfirm, useToast } from '../context.jsx';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function Toggle({ checked, onChange, label, hint, id }) {
  return (
    <label className="setting-toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {hint && <span className="muted small setting-hint">{hint}</span>}
      </span>
    </label>
  );
}

function PreviewModal({ data, onClose }) {
  return (
    <Modal wide title="Xem trước email nhắc deadline" onClose={onClose}>
      {data.digests.length === 0 ? (
        <div className="empty">Hiện không có task / milestone nào trễ hoặc sắp đến hạn cần gửi email.</div>
      ) : (
        <div className="email-previews">
          <p className="muted small">{data.digests.length} người nhận. Nội dung dưới đây là email sẽ được gửi.</p>
          {data.digests.map((d) => (
            <details key={d.to} className="email-preview">
              <summary>
                <strong>{d.to}</strong> · {d.subject}
              </summary>
              <pre className="preview-text">{d.text}</pre>
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState(null); // { settings, email }
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [report, setReport] = useState(null);

  useEffect(() => {
    api
      .settings()
      .then((d) => {
        setState(d);
        setForm(d.settings);
      })
      .catch(setError);
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!form) return <Loading />;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(state.settings);
  const isDemo = import.meta.env.MODE === 'demo';

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const d = await api.saveSettings(form);
      setState(d);
      setForm(d.settings);
      toast('Đã lưu cài đặt');
      window.dispatchEvent(new Event('pm:settings-changed'));
    } catch (err) {
      setErrors(err.details ?? {});
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async () => {
    try {
      setPreview(await api.previewEmails());
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const sendNow = async () => {
    if (!(await confirm('Gửi email nhắc deadline ngay bây giờ?', { confirmLabel: 'Gửi email' }))) return;
    try {
      const r = await api.runEmails();
      setReport(r);
      toast(
        `Đã gửi ${r.sent.length} email${r.errors.length ? `, ${r.errors.length} lỗi` : ''}`,
        r.errors.length ? 'error' : 'success',
      );
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="settings">
      <section className="card section">
        <div className="section-head">
          <h3>Thông báo trên web</h3>
        </div>
        <Toggle
          id="web_enabled"
          checked={form.web_enabled}
          onChange={set('web_enabled')}
          label="Hiện chuông thông báo task / milestone trễ hoặc sắp đến hạn"
          hint="Chuông ở góc trên bên phải; bấm vào để xem danh sách và mở nhanh từng mục."
        />
      </section>

      <section className="card section">
        <div className="section-head">
          <h3>Email nhắc deadline</h3>
        </div>
        <Toggle
          id="email_enabled"
          checked={form.email_enabled}
          onChange={set('email_enabled')}
          label="Gửi email tổng hợp hằng ngày"
          hint="Mỗi người nhận một email liệt kê các mục trễ / sắp đến hạn của họ; mỗi mục chỉ được nhắc một lần mỗi ngày."
        />
        <div className={`settings-grid ${form.email_enabled ? '' : 'is-disabled'}`}>
          <div className="field">
            <label htmlFor="email_hour">Giờ gửi mỗi ngày</label>
            <select
              id="email_hour"
              value={form.email_hour}
              onChange={(e) => set('email_hour')(Number(e.target.value))}
              disabled={!form.email_enabled}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            {errors.email_hour && <div className="field-error">{errors.email_hour}</div>}
          </div>
          <div className="field">
            <span className="field-label">Người nhận</span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={form.email_to_assignee}
                onChange={(e) => set('email_to_assignee')(e.target.checked)}
                disabled={!form.email_enabled}
              />
              Người thực hiện task
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={form.email_to_pm}
                onChange={(e) => set('email_to_pm')(e.target.checked)}
                disabled={!form.email_enabled}
              />
              PM của dự án (gồm cả milestone)
            </label>
          </div>
          <div className="field field-full">
            <label htmlFor="extra_emails">Email nhận thêm (nhận tất cả)</label>
            <input
              id="extra_emails"
              placeholder="VD: truongphong@congty.com, qa-lead@congty.com"
              value={form.extra_emails}
              onChange={(e) => set('extra_emails')(e.target.value)}
              disabled={!form.email_enabled}
            />
            {errors.extra_emails ? (
              <div className="field-error">{errors.extra_emails}</div>
            ) : (
              <div className="hint">
                Từng thành viên có thể tắt email của mình ở trang <Link to="/members">Thành viên</Link> (Sửa → Email
                nhắc deadline). Email của người thực hiện lấy theo tên trùng với thành viên.
              </div>
            )}
          </div>
        </div>
        <div className={`smtp-status ${state.email.configured ? 'ok' : 'warn'}`}>
          {state.email.configured ? (
            <>
              ✓ Máy chủ gửi email đã cấu hình · gửi từ <strong>{state.email.from}</strong>
            </>
          ) : isDemo ? (
            <>Bản demo không gửi email thật. Dùng "Xem trước email" để xem nội dung sẽ gửi.</>
          ) : (
            <>
              ⚠ Chưa cấu hình máy chủ gửi email. Đặt biến môi trường <code>SMTP_HOST</code>, <code>SMTP_PORT</code>,{' '}
              <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>MAIL_FROM</code> (và <code>APP_URL</code> để email
              có link) rồi khởi động lại máy chủ.
            </>
          )}
        </div>
        <div className="settings-actions">
          <button className="btn" onClick={showPreview}>
            Xem trước email
          </button>
          <button className="btn" onClick={sendNow} disabled={!state.email.configured}>
            Gửi ngay
          </button>
        </div>
        {report && (
          <div className="muted small">
            Kết quả: đã gửi {report.sent.map((x) => `${x.to} (${x.count} mục)`).join(', ') || 'không có'}
            {report.skipped.length > 0 && ` · bỏ qua ${report.skipped.length} (đã nhắc hôm nay)`}
            {report.errors.length > 0 && ` · lỗi: ${report.errors.map((x) => `${x.to}: ${x.error}`).join('; ')}`}
          </div>
        )}
      </section>

      <section className="card section">
        <div className="section-head">
          <h3>Phạm vi nhắc</h3>
        </div>
        <div className="settings-grid">
          <div className="field">
            <label htmlFor="remind_days_before">Nhắc trước hạn (ngày)</label>
            <input
              id="remind_days_before"
              type="number"
              min="0"
              max="30"
              value={form.remind_days_before}
              onChange={(e) => set('remind_days_before')(Number(e.target.value))}
            />
            {errors.remind_days_before ? (
              <div className="field-error">{errors.remind_days_before}</div>
            ) : (
              <div className="hint">0 = chỉ nhắc khi đã trễ hạn.</div>
            )}
          </div>
          <div className="field">
            <span className="field-label">Áp dụng cho</span>
            <label className="toggle">
              <input type="checkbox" checked disabled /> Task chưa hoàn thành
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={form.include_milestones}
                onChange={(e) => set('include_milestones')(e.target.checked)}
              />
              Milestone chưa hoàn thành
            </label>
          </div>
        </div>
      </section>

      <div className="settings-save">
        {dirty && <span className="muted small">Có thay đổi chưa lưu</span>}
        <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
        </button>
      </div>
      {preview && <PreviewModal data={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
