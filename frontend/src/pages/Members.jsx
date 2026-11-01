import { Avatar } from '../components/Avatar.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import DetailPage, { InfoList, Section } from '../components/DetailPage.jsx';
import Gantt, { ZOOMS } from '../components/Gantt.jsx';
import ResourceList, { useParamSetter } from '../components/ResourceList.jsx';
import { Badge, ErrorBox, Icon, Loading, Modal } from '../components/ui.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { code, fmtDate, fmtDateTime, isOverdue, isClosed } from '../constants.js';
import { useAsync, useConfirm, useLookup, useProject, useToast } from '../context.jsx';
import { useAuth } from '../auth.jsx';
import { memberFields } from '../forms.js';

const TABS = [
  { value: '', label: 'Danh sách thành viên' },
  { value: 'gantt', label: 'Biểu đồ Gantt' },
];

function ZoomSwitch({ zoom, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Thu phóng thời gian">
      {Object.entries(ZOOMS).map(([key, z]) => (
        <button key={key} className={zoom === key ? 'active' : ''} onClick={() => onChange(key)}>
          {z.label}
        </button>
      ))}
    </div>
  );
}

/** Gantt có bộ lọc: dự án, thành viên, hiện task đã xong, thu phóng (lưu trên URL) */
function GanttView() {
  const [params, setParam] = useParamSetter();
  const { projects } = useProject();
  const { lookup } = useLookup();
  const projectId = params.get('gp') ?? '';
  const memberId = params.get('gm') ?? '';
  const includeDone = params.get('done') === 'true';
  const zoom = ZOOMS[params.get('zoom')] ? params.get('zoom') : 'week';

  const { data, loading, error, reload } = useAsync(
    () => api.gantt({ project_id: projectId, member_id: memberId, include_done: includeDone || undefined }),
    [projectId, memberId, includeDone],
  );

  return (
    <>
      <div className="toolbar">
        <select aria-label="Dự án" value={projectId} onChange={(e) => setParam('gp', e.target.value)}>
          <option value="">Tất cả dự án</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Thành viên" value={memberId} onChange={(e) => setParam('gm', e.target.value)}>
          <option value="">Tất cả thành viên</option>
          {lookup.allMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(e) => setParam('done', e.target.checked ? 'true' : '')}
          />
          Hiện cả task đã hoàn thành
        </label>
        <div className="spacer" />
        <ZoomSwitch zoom={zoom} onChange={(z) => setParam('zoom', z === 'week' ? '' : z)} />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && <Gantt data={data} zoom={zoom} />}
    </>
  );
}

/** Công tắc Bật / Tắt (role="switch") */
function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`switch-btn ${checked ? 'on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <span className="switch-knob" />
    </button>
  );
}

const ROLE_FILTERS = [
  {
    name: 'role',
    label: 'Tài khoản',
    options: [
      { value: 'member', label: 'Thành viên' },
      { value: 'admin', label: 'Quản trị viên' },
    ],
  },
  {
    name: 'status',
    label: 'Trạng thái',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
  },
];

/** Bảng thành viên: chức danh, tài khoản (Thành viên / Quản trị viên), trạng thái Active / Inactive */
function MemberTable({ onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = Boolean(user?.is_admin);
  const [version, setVersion] = useState(0);
  const [pwFor, setPwFor] = useState(null); // { member, activate }
  const refresh = () => setVersion((v) => v + 1);

  const isActive = (m) => Boolean(m.has_account) && !m.account_disabled;

  const setActive = async (m, on) => {
    if (on && !m.has_account) {
      // Chưa có tài khoản: cần đặt mật khẩu để kích hoạt
      if (!m.email) {
        toast(`${m.name} chưa có email (dùng để đăng nhập). Hãy thêm email trước.`, 'error');
        return;
      }
      setPwFor({ member: m, activate: true });
      return;
    }
    if (
      !on &&
      !(await confirm(`Tắt tài khoản của ${m.name}? Người này sẽ không đăng nhập được cho tới khi bật lại.`, {
        confirmLabel: 'Tắt tài khoản',
      }))
    )
      return;
    try {
      await api.saveAccount(m.id, { disabled: !on });
      toast(on ? `Đã bật tài khoản của ${m.name}` : `Đã tắt tài khoản của ${m.name}`);
      refresh();
    } catch (err) {
      toast(Object.values(err.details ?? {})[0] ?? err.message, 'error');
    }
  };

  const savePassword = async (password) => {
    const { member, activate } = pwFor;
    await api.saveAccount(member.id, activate ? { password, disabled: false } : { password });
    toast(
      !member.has_account ? `Đã tạo tài khoản và kích hoạt cho ${member.name}` : `Đã đổi mật khẩu của ${member.name}`,
    );
    setPwFor(null);
    refresh();
  };

  return (
    <>
      <ResourceList
        resource="members"
        noun="thành viên"
        scoped={false}
        formFields={memberFields}
        nameOf={(m) => m.name}
        onChanged={() => {
          onChanged();
          refresh();
        }}
        reloadKey={version}
        filters={ROLE_FILTERS}
        searchPlaceholder="Tìm theo tên, chức danh, email, số điện thoại…"
        rowActions={(m) =>
          isAdmin && (
            <button
              className="icon-btn"
              title={m.has_account ? 'Đổi mật khẩu' : 'Tạo tài khoản đăng nhập'}
              aria-label={m.has_account ? `Đổi mật khẩu của ${m.name}` : `Tạo tài khoản cho ${m.name}`}
              onClick={() =>
                m.email || m.has_account
                  ? setPwFor({ member: m, activate: false })
                  : toast(`${m.name} chưa có email (dùng để đăng nhập).`, 'error')
              }
            >
              <Icon name="key" size={16} />
            </button>
          )
        }
        columns={[
          {
            key: 'avatar',
            title: 'Avatar',
            width: 64,
            render: (m) => <Avatar name={m.name} src={m.avatar} size={34} />,
          },
          { key: 'name', title: 'Họ tên', sort: 'name', className: 'nowrap', render: (m) => <strong>{m.name}</strong> },
          {
            key: 'position',
            title: 'Chức danh',
            sort: 'position',
            width: 180,
            render: (m) => m.position || <span className="muted">—</span>,
          },
          { key: 'email', title: 'Email', width: 210, className: 'small' },
          { key: 'phone', title: 'Điện thoại', width: 120, className: 'small nowrap' },
          {
            key: 'is_admin',
            title: 'Tài khoản',
            width: 130,
            render: (m) =>
              m.is_admin ? (
                <span className="badge badge-purple">Quản trị viên</span>
              ) : (
                <span className="badge badge-gray">Thành viên</span>
              ),
          },
          {
            key: 'status',
            title: 'Trạng thái',
            width: 130,
            render: (m) => {
              const active = isActive(m);
              const canToggle = isAdmin && m.id !== user?.id;
              return (
                <span className="status-cell" onClick={(e) => e.stopPropagation()}>
                  {canToggle && (
                    <Switch
                      checked={active}
                      onChange={(on) => setActive(m, on)}
                      label={active ? `Tắt tài khoản của ${m.name}` : `Bật tài khoản của ${m.name}`}
                    />
                  )}
                  {canToggle ? (
                    <span className={`status-text ${active ? 'is-active' : ''}`}>{active ? 'Active' : 'Inactive'}</span>
                  ) : (
                    <span className={`badge ${active ? 'badge-green' : 'badge-gray'}`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </span>
              );
            },
          },
          { key: 'project_count', title: 'Số dự án', sort: 'project_count', width: 90, className: 'num' },
          {
            key: 'open_task_count',
            title: 'Task đang làm',
            sort: 'open_task_count',
            width: 120,
            className: 'num',
            render: (m) => (
              <>
                {m.open_task_count}
                {m.overdue_task_count > 0 && (
                  <span className="text-danger small" title="Task quá hạn">
                    {' '}
                    ({m.overdue_task_count} trễ)
                  </span>
                )}
              </>
            ),
          },
        ]}
      />
      {pwFor && (
        <SetPasswordModal
          title={
            pwFor.member.has_account
              ? `Đổi mật khẩu của ${pwFor.member.name}`
              : `Tạo tài khoản cho ${pwFor.member.name}`
          }
          hint={
            pwFor.member.has_account
              ? 'Mật khẩu mới có hiệu lực ngay; các phiên đăng nhập hiện tại của thành viên này sẽ bị đăng xuất.'
              : `Thành viên đăng nhập bằng email ${pwFor.member.email} và mật khẩu này.`
          }
          onClose={() => setPwFor(null)}
          onSave={savePassword}
        />
      )}
    </>
  );
}

export function MemberList() {
  const [params, setParam] = useParamSetter();
  const { refreshLookup } = useLookup();
  const view = params.get('view') ?? '';
  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={view === t.value}
            className={view === t.value ? 'active' : ''}
            onClick={() => setParam('view', t.value, { keepPage: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {view === 'gantt' ? <GanttView /> : <MemberTable onChanged={refreshLookup} />}
    </>
  );
}

function MemberGantt({ member }) {
  const [params, setParam] = useParamSetter();
  const includeDone = params.get('done') === 'true';
  const zoom = ZOOMS[params.get('zoom')] ? params.get('zoom') : 'week';
  const { data, error, reload } = useAsync(
    () => api.gantt({ member_id: member.id, include_done: includeDone || undefined }),
    [member.id, member.updated_at, includeDone],
  );
  return (
    <Section
      title="Biểu đồ Gantt"
      extra={
        <div className="section-tools">
          <label className="toggle small">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => setParam('done', e.target.checked ? 'true' : '')}
            />
            Hiện task đã xong
          </label>
          <ZoomSwitch zoom={zoom} onChange={(z) => setParam('zoom', z === 'week' ? '' : z)} />
        </div>
      }
    >
      <ErrorBox error={error} onRetry={reload} />
      {data && <Gantt data={data} zoom={zoom} showMemberRows={false} />}
    </Section>
  );
}

function SetPasswordModal({ title, onClose, onSave, hint }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(pw);
    } catch (err) {
      setError(Object.values(err.details ?? {})[0] ?? err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="account-password">Mật khẩu (ít nhất 6 ký tự)</label>
          <PasswordInput id="account-password" autoComplete="new-password" value={pw} onChange={setPw} autoFocus />
          <div className="hint">{hint ?? 'Gửi mật khẩu này cho thành viên; họ có thể tự đổi sau khi đăng nhập.'}</div>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btn-primary" disabled={busy || pw.length < 6}>
            Lưu
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Tài khoản đăng nhập của thành viên (quản trị viên quản lý) */
function AccountSection({ member, reload }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState(null); // 'create' | 'reset'
  const { data: acc, reload: reloadAcc } = useAsync(() => api.account(member.id), [member.id, member.updated_at]);
  const isSelf = user?.id === member.id;
  const isAdmin = user?.is_admin;

  const save = async (patch, msg) => {
    try {
      await api.saveAccount(member.id, patch);
      toast(msg);
      reloadAcc();
      reload();
    } catch (err) {
      toast(Object.values(err.details ?? {})[0] ?? err.message, 'error');
      throw err;
    }
  };
  const remove = async () => {
    if (!(await confirm(`Xoá tài khoản đăng nhập của ${member.name}? Thành viên vẫn được giữ lại.`))) return;
    try {
      await api.removeAccount(member.id);
      toast('Đã xoá tài khoản đăng nhập');
      reloadAcc();
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Section title="Tài khoản đăng nhập">
      {acc === null || acc === undefined ? (
        <div className="account-box">
          <div className="muted">
            {acc === undefined ? 'Đang tải…' : 'Chưa có tài khoản. Thành viên này chưa đăng nhập được vào hệ thống.'}
          </div>
          {isAdmin && acc === null && (
            <div className="account-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setModal('create')} disabled={!member.email}>
                Tạo tài khoản
              </button>
              {!member.email && <span className="muted small">Cần có email (dùng để đăng nhập).</span>}
            </div>
          )}
        </div>
      ) : (
        <div className="account-box">
          <InfoList
            items={[
              ['Email đăng nhập', member.email],
              [
                'Trạng thái',
                acc.disabled ? (
                  <span className="badge badge-red">Đã khoá</span>
                ) : (
                  <span className="badge badge-green">Đang hoạt động</span>
                ),
              ],
              ['Quyền', acc.is_admin ? <span className="badge badge-purple">Quản trị viên</span> : 'Thành viên'],
              ['Đăng nhập gần nhất', fmtDateTime(acc.last_login_at) || 'Chưa đăng nhập'],
            ]}
          />
          {isSelf && <div className="muted small">Đổi mật khẩu của bạn ở menu tài khoản (góc trên bên phải).</div>}
          {isAdmin && (
            <div className="account-actions">
              <button className="btn btn-sm" onClick={() => setModal('reset')}>
                Đổi mật khẩu
              </button>
              {!isSelf && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      save(
                        { is_admin: !acc.is_admin },
                        acc.is_admin ? 'Đã gỡ quyền quản trị' : 'Đã cấp quyền quản trị',
                      ).catch(() => {})
                    }
                  >
                    {acc.is_admin ? 'Gỡ quyền quản trị' : 'Cấp quyền quản trị'}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      save({ disabled: !acc.disabled }, acc.disabled ? 'Đã bật tài khoản' : 'Đã tắt tài khoản').catch(
                        () => {},
                      )
                    }
                  >
                    {acc.disabled ? 'Bật tài khoản (Active)' : 'Tắt tài khoản (Inactive)'}
                  </button>
                  <button className="btn btn-sm btn-danger-ghost" onClick={remove}>
                    Xoá tài khoản
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {modal && (
        <SetPasswordModal
          title={modal === 'create' ? `Tạo tài khoản cho ${member.name}` : `Đổi mật khẩu của ${member.name}`}
          onClose={() => setModal(null)}
          onSave={async (password) => {
            await save({ password }, modal === 'create' ? 'Đã tạo tài khoản đăng nhập' : 'Đã đổi mật khẩu');
            setModal(null);
          }}
        />
      )}
    </Section>
  );
}

export function MemberDetail() {
  const { refreshLookup } = useLookup();
  const isAdmin = Boolean(useAuth().user?.is_admin);
  return (
    <DetailPage
      resource="members"
      // Thành viên chỉ xem / sửa hồ sơ của mình, không vào được danh sách thành viên
      canDelete={isAdmin}
      backTo={isAdmin ? undefined : '/'}
      backLabel={isAdmin ? 'Danh sách thành viên' : 'Trang chủ'}
      formFields={memberFields}
      scoped={false}
      nameOf={(m) => m.name}
      onChanged={refreshLookup}
      badges={(m) => (
        <>
          <Avatar name={m.name} src={m.avatar} size={40} />
          {m.position && <span className="badge badge-gray">{m.position}</span>}
        </>
      )}
    >
      {(m, { reload }) => {
        const openTasks = m.tasks.filter((t) => !isClosed(t.status));
        return (
          <>
            <MemberGantt member={m} />
            <div className="detail-grid">
              <div className="detail-main">
                <Section title={`Dự án đang tham gia (${m.projects.length})`}>
                  {m.projects.length === 0 ? (
                    <div className="muted">
                      Chưa tham gia dự án nào. Thêm vào dự án ở trang chi tiết của <Link to="/projects">dự án</Link>.
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table compact">
                        <thead>
                          <tr>
                            <th className="col-stt">STT</th>
                            <th style={{ width: 80 }}>Mã</th>
                            <th>Dự án</th>
                            <th style={{ width: 200 }}>Vai trò</th>
                            <th style={{ width: 140 }}>Trạng thái dự án</th>
                            <th style={{ width: 100 }}>Tham gia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.projects.map((p, i) => (
                            <tr key={p.id}>
                              <td className="col-stt">{i + 1}</td>
                              <td className="mono">{p.code}</td>
                              <td>
                                <Link to={`/projects/${p.id}`}>{p.name}</Link>
                              </td>
                              <td>
                                <Badge kind="memberRole" value={p.role} />
                              </td>
                              <td>
                                <Badge kind="projectStatus" value={p.status} />
                              </td>
                              <td className="small">{fmtDate(p.joined_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
                <Section title={`Task được giao (${openTasks.length} đang làm / ${m.tasks.length})`}>
                  {m.tasks.length === 0 ? (
                    <div className="muted">Chưa được giao task nào.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table compact">
                        <thead>
                          <tr>
                            <th className="col-stt">STT</th>
                            <th style={{ width: 90 }}>Mã</th>
                            <th>Task</th>
                            <th style={{ width: 70 }}>Dự án</th>
                            <th style={{ width: 120 }}>Trạng thái</th>
                            <th style={{ width: 100 }}>Hạn</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.tasks.map((t, i) => (
                            <tr key={t.id}>
                              <td className="col-stt">{i + 1}</td>
                              <td className="mono">
                                <Link to={`/tasks/${t.id}`}>{code('tasks', t.id)}</Link>
                              </td>
                              <td className={isClosed(t.status) ? 'strike' : ''}>{t.title}</td>
                              <td className="mono small">{t.project_code}</td>
                              <td>
                                <Badge kind="taskStatus" value={t.status} />
                              </td>
                              <td className={`small ${isOverdue(t) ? 'text-danger' : ''}`}>{fmtDate(t.due_date)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              </div>
              <aside className="detail-side">
                <AccountSection member={m} reload={reload} />
                <Section title="Thông tin liên hệ">
                  <InfoList
                    items={[
                      ['Chức danh', m.position],
                      ['Email', m.email],
                      ['Điện thoại', m.phone],
                    ]}
                  />
                </Section>
              </aside>
            </div>
          </>
        );
      }}
    </DetailPage>
  );
}
