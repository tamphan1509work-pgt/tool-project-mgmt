import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import DetailPage, { InfoList, Section } from '../components/DetailPage.jsx';
import ResourceList from '../components/ResourceList.jsx';
import { Badge, Icon, Prose } from '../components/ui.jsx';
import { fmtDate, options } from '../constants.js';
import { useConfirm, useLookup, useProject, useToast } from '../context.jsx';
import { projectFields } from '../forms.js';

const period = (p) =>
  p.start_date || p.end_date ? `${fmtDate(p.start_date) || '…'} → ${fmtDate(p.end_date) || '…'}` : '';

export function ProjectList() {
  const { refreshProjects, projectId } = useProject();
  return (
    <ResourceList
      resource="projects"
      noun="dự án"
      scoped={false}
      formFields={projectFields}
      codeOf={(p) => p.code}
      nameOf={(p) => p.name}
      onChanged={refreshProjects}
      searchPlaceholder="Tìm theo mã, tên, mô tả dự án…"
      filters={[{ name: 'status', label: 'Trạng thái', options: options('projectStatus') }]}
      columns={[
        {
          key: 'name',
          title: 'Tên dự án',
          sort: 'name',
          render: (p) => (
            <>
              <strong>{p.name}</strong>
              {p.id === projectId && <span className="badge badge-blue tiny">Đang chọn</span>}
            </>
          ),
        },
        {
          key: 'status',
          title: 'Trạng thái',
          sort: 'status',
          width: 150,
          render: (p) => <Badge kind="projectStatus" value={p.status} />,
        },
        { key: 'period', title: 'Thời gian', sort: 'start_date', width: 200, className: 'small', render: period },
        { key: 'member_count', title: 'Thành viên', width: 100, className: 'num' },
        {
          key: 'open_task_count',
          title: 'Task mở',
          width: 90,
          className: 'num',
          render: (p) => `${p.open_task_count}/${p.task_count}`,
        },
        {
          key: 'open_bug_count',
          title: 'Bug mở',
          width: 80,
          className: 'num',
          render: (p) => <span className={p.open_bug_count ? 'text-danger' : ''}>{p.open_bug_count}</span>,
        },
      ]}
    />
  );
}

function Members({ project, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { lookup, refreshLookup } = useLookup();
  const { refreshProjects } = useProject();
  const [form, setForm] = useState({ member_id: '', name: '', email: '', role: 'developer' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const inProject = new Set(project.members.map((m) => m.id));
  const candidates = lookup.allMembers.filter((m) => !inProject.has(m.id));
  const isNew = form.member_id === 'new' || (form.member_id === '' && candidates.length === 0);

  const changed = () => {
    reload();
    refreshLookup();
    refreshProjects();
  };

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = isNew
        ? { name: form.name, email: form.email || null, role: form.role }
        : { member_id: Number(form.member_id), role: form.role };
      const m = await api.addMember(project.id, body);
      toast(`Đã thêm ${m.name} vào dự án`);
      setForm({ member_id: '', name: '', email: '', role: form.role });
      changed();
    } catch (err) {
      setErrors(err.details ?? { _: err.message });
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (m, role) => {
    try {
      await api.updateMember(project.id, m.id, { role });
      toast(`Đã đổi vai trò của ${m.name}`);
      changed();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (m) => {
    if (!(await confirm(`Gỡ ${m.name} khỏi dự án ${project.code}?`, { confirmLabel: 'Gỡ khỏi dự án' }))) return;
    try {
      await api.removeMember(project.id, m.id);
      toast(`Đã gỡ ${m.name}`);
      changed();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const canSubmit = isNew ? form.name.trim() : form.member_id;

  return (
    <Section title={`Thành viên dự án (${project.members.length})`}>
      {project.members.length === 0 ? (
        <div className="muted">Dự án chưa có thành viên. Thêm thành viên bên dưới.</div>
      ) : (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th className="col-stt">STT</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th style={{ width: 230 }}>Vai trò trong dự án</th>
                <th style={{ width: 110 }}>Tham gia</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {project.members.map((m, i) => (
                <tr key={m.id}>
                  <td className="col-stt">{i + 1}</td>
                  <td>
                    <strong>{m.name}</strong>
                  </td>
                  <td className="small">{m.email || <span className="muted">—</span>}</td>
                  <td>
                    <select
                      value={m.role}
                      aria-label={`Vai trò của ${m.name}`}
                      onChange={(e) => setRole(m, e.target.value)}
                    >
                      {options('memberRole').map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="small">{fmtDate(m.joined_at)}</td>
                  <td>
                    <button className="icon-btn danger" title="Gỡ khỏi dự án" onClick={() => remove(m)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="member-form" onSubmit={add}>
        <div className="member-form-title">Thêm thành viên</div>
        <div className="inline-form">
          <select
            aria-label="Chọn người"
            value={isNew ? 'new' : form.member_id}
            onChange={(e) => setForm({ ...form, member_id: e.target.value })}
            style={{ flex: 2 }}
          >
            {candidates.length > 0 && <option value="">— Chọn người có sẵn —</option>}
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.email ? ` (${m.email})` : ''}
              </option>
            ))}
            <option value="new">+ Người mới…</option>
          </select>
          {isNew && (
            <>
              <input
                placeholder="Họ tên *"
                aria-label="Họ tên"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={{ flex: 2 }}
              />
              <input
                type="email"
                placeholder="Email"
                aria-label="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={{ flex: 2 }}
              />
            </>
          )}
          <select
            aria-label="Vai trò"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            style={{ flex: 2 }}
          >
            {options('memberRole').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={busy || !canSubmit}>
            <Icon name="plus" /> Thêm
          </button>
        </div>
        {Object.values(errors).length > 0 && <div className="field-error">{Object.values(errors).join(' · ')}</div>}
      </form>
    </Section>
  );
}

function StatLink({ to, label, value, sub, onOpen }) {
  return (
    <Link to={to} className="mini-stat" onClick={onOpen}>
      <span className="mini-stat-value">{value}</span>
      <span className="mini-stat-label">{label}</span>
      {sub && <span className="mini-stat-sub">{sub}</span>}
    </Link>
  );
}

export function ProjectDetail() {
  const navigate = useNavigate();
  const { setProjectId, refreshProjects, projectId } = useProject();
  return (
    <DetailPage
      resource="projects"
      backLabel="Danh sách dự án"
      formFields={projectFields}
      scoped={false}
      codeOf={(p) => p.code}
      nameOf={(p) => p.name}
      onChanged={refreshProjects}
      badges={(p) => (
        <>
          <Badge kind="projectStatus" value={p.status} />
          {p.id === projectId && <span className="badge badge-blue">Dự án đang chọn</span>}
        </>
      )}
      actions={(p) => (
        <button
          className="btn btn-primary"
          onClick={() => {
            setProjectId(p.id);
            navigate('/');
          }}
        >
          Mở dự án
        </button>
      )}
    >
      {(p, { reload }) => {
        const open = () => setProjectId(p.id);
        const s = p.stats;
        return (
          <div className="detail-grid">
            <div className="detail-main">
              <section className="card section">
                <div className="mini-stats">
                  <StatLink to="/meetings" label="Biên bản họp" value={s.meetings} onOpen={open} />
                  <StatLink to="/tasks" label="Task" value={s.tasks} sub={`${s.doneTasks} hoàn thành`} onOpen={open} />
                  <StatLink
                    to="/test-cases"
                    label="Test case"
                    value={s.testCases}
                    sub={`${s.passedTests} đạt`}
                    onOpen={open}
                  />
                  <StatLink to="/bugs" label="Bug" value={s.bugs} sub={`${s.openBugs} đang mở`} onOpen={open} />
                  <StatLink to="/documents" label="Tài liệu" value={s.documents} onOpen={open} />
                </div>
              </section>
              <Members project={p} reload={reload} />
            </div>
            <aside className="detail-side">
              <Section title="Thông tin dự án">
                <InfoList
                  items={[
                    [
                      'Mã dự án',
                      <span key="c" className="mono">
                        {p.code}
                      </span>,
                    ],
                    ['Ngày bắt đầu', fmtDate(p.start_date)],
                    ['Ngày kết thúc dự kiến', fmtDate(p.end_date)],
                    ['Mô tả', p.description && <Prose text={p.description} />],
                  ]}
                />
              </Section>
            </aside>
          </div>
        );
      }}
    </DetailPage>
  );
}
