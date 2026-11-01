import { Link } from 'react-router-dom';
import { api } from '../api.js';
import DetailPage, { InfoList, Section } from '../components/DetailPage.jsx';
import Gantt, { ZOOMS } from '../components/Gantt.jsx';
import ResourceList, { useParamSetter } from '../components/ResourceList.jsx';
import { Badge, ErrorBox, Loading } from '../components/ui.jsx';
import { code, fmtDate, isOverdue } from '../constants.js';
import { useAsync, useLookup, useProject } from '../context.jsx';
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
      {view === 'gantt' ? (
        <GanttView />
      ) : (
        <ResourceList
          resource="members"
          noun="thành viên"
          scoped={false}
          formFields={memberFields}
          nameOf={(m) => m.name}
          onChanged={refreshLookup}
          searchPlaceholder="Tìm theo tên, chức danh, email, số điện thoại…"
          columns={[
            {
              key: 'name',
              title: 'Họ tên',
              sort: 'name',
              render: (m) => (
                <div className="person-cell">
                  <strong>{m.name}</strong>
                  {m.position && <span className="muted small">{m.position}</span>}
                </div>
              ),
            },
            { key: 'email', title: 'Email', width: 220, className: 'small' },
            { key: 'phone', title: 'Điện thoại', width: 130, className: 'small' },
            { key: 'project_count', title: 'Số dự án', sort: 'project_count', width: 100, className: 'num' },
            {
              key: 'open_task_count',
              title: 'Task đang làm',
              sort: 'open_task_count',
              width: 130,
              className: 'num',
              render: (m) => (
                <>
                  {m.open_task_count}
                  {m.overdue_task_count > 0 && (
                    <span className="text-danger small" title="Task quá hạn">
                      {' '}
                      ({m.overdue_task_count} quá hạn)
                    </span>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
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

export function MemberDetail() {
  const { refreshLookup } = useLookup();
  return (
    <DetailPage
      resource="members"
      backLabel="Danh sách thành viên"
      formFields={memberFields}
      scoped={false}
      nameOf={(m) => m.name}
      onChanged={refreshLookup}
      badges={(m) => m.position && <span className="badge badge-gray">{m.position}</span>}
    >
      {(m) => {
        const openTasks = m.tasks.filter((t) => t.status !== 'done');
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
                              <td className={t.status === 'done' ? 'strike' : ''}>{t.title}</td>
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
