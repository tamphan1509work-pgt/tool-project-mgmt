import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, ErrorBox, Loading } from '../components/ui.jsx';
import { code, fmtDate, LABELS } from '../constants.js';
import { useAsync, useProject } from '../context.jsx';

function Stat({ to, label, value, sub, tone }) {
  return (
    <Link to={to} className={`card stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Link>
  );
}

/** Thanh phân bố trạng thái (stacked bar) + chú thích có thể bấm để lọc */
function Distribution({ title, kind, counts, link }) {
  const entries = Object.keys(LABELS[kind])
    .map((k) => [k, counts[k] ?? 0])
    .filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <div className="card section">
      <div className="section-head">
        <h3>{title}</h3>
        <span className="muted small">{total} mục</span>
      </div>
      {total === 0 ? (
        <div className="muted">Chưa có dữ liệu</div>
      ) : (
        <>
          <div
            className="dist-bar"
            role="img"
            aria-label={entries.map(([k, n]) => `${LABELS[kind][k][0]}: ${n}`).join(', ')}
          >
            {entries.map(([k, n]) => (
              <div
                key={k}
                className={`seg seg-${LABELS[kind][k][1]}`}
                style={{ flexGrow: n }}
                title={`${LABELS[kind][k][0]}: ${n}`}
              />
            ))}
          </div>
          <ul className="dist-legend">
            {entries.map(([k, n]) => (
              <li key={k}>
                <Link to={`${link}?status=${k}`}>
                  <span className={`dot seg-${LABELS[kind][k][1]}`} />
                  {LABELS[kind][k][0]}
                  <strong>{n}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ListCard({ title, items, empty, render, more }) {
  return (
    <div className="card section">
      <div className="section-head">
        <h3>{title}</h3>
        {more}
      </div>
      {items.length === 0 ? <div className="muted">{empty}</div> : <ul className="linked-list">{items.map(render)}</ul>}
    </div>
  );
}

export default function Dashboard() {
  const { projectId } = useProject();
  const { data, loading, error, reload } = useAsync(() => api.dashboard({ project_id: projectId }), [projectId]);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={reload} />;
  const { counts } = data;

  const p = data.project;
  return (
    <div className="dashboard">
      <div className="project-banner">
        <div>
          <span className="mono muted">{p.code}</span>
          <h2>{p.name}</h2>
        </div>
        <div className="project-banner-meta">
          <Badge kind="projectStatus" value={p.status} />
          <span className="muted small">
            {counts.members} thành viên · {counts.documents} tài liệu
          </span>
          <Link to={`/projects/${p.id}`} className="small">
            Thông tin & thành viên →
          </Link>
        </div>
      </div>
      <div className="stats">
        <Stat
          to="/meetings"
          label="Biên bản họp"
          value={counts.meetings}
          sub={`${data.upcomingMeetings.length} cuộc họp sắp tới`}
        />
        <Stat
          to="/tasks"
          label="Task"
          value={counts.tasks}
          sub={`${data.taskStatus.done ?? 0} hoàn thành · ${counts.overdueTasks} quá hạn`}
          tone={counts.overdueTasks ? 'warn' : undefined}
        />
        <Stat
          to="/test-cases"
          label="Tỉ lệ test đạt"
          value={data.testPassRate == null ? '—' : `${data.testPassRate}%`}
          sub={`${counts.testCases} test case · ${data.testStatus.not_run ?? 0} chưa chạy`}
        />
        <Stat
          to="/bugs?open=true"
          label="Bug đang mở"
          value={counts.openBugs}
          sub={`${(data.openBugSeverity.critical ?? 0) + (data.openBugSeverity.blocker ?? 0)} nghiêm trọng / blocker`}
          tone={counts.openBugs ? 'danger' : undefined}
        />
      </div>

      <div className="grid-3">
        <Distribution title="Task theo trạng thái" kind="taskStatus" counts={data.taskStatus} link="/tasks" />
        <Distribution title="Kết quả test" kind="testStatus" counts={data.testStatus} link="/test-cases" />
        <Distribution title="Bug theo trạng thái" kind="bugStatus" counts={data.bugStatus} link="/bugs" />
      </div>

      <div className="grid-2">
        <ListCard
          title="Task quá hạn"
          items={data.overdueTasks}
          empty="Không có task quá hạn 🎉"
          more={
            counts.overdueTasks > 0 && (
              <Link to="/tasks?overdue=true" className="small">
                Xem tất cả
              </Link>
            )
          }
          render={(t) => (
            <li key={t.id}>
              <Link to={`/tasks/${t.id}`}>
                <span className="mono">{code('tasks', t.id)}</span> {t.title}
              </Link>
              <span className="linked-meta">
                {t.assignee && <span className="muted">{t.assignee}</span>}
                <span className="text-danger">{fmtDate(t.due_date)}</span>
              </span>
            </li>
          )}
        />
        <ListCard
          title="Bug nghiêm trọng đang mở"
          items={data.criticalBugs}
          empty="Không có bug nghiêm trọng"
          render={(b) => (
            <li key={b.id}>
              <Link to={`/bugs/${b.id}`}>
                <span className="mono">{code('bugs', b.id)}</span> {b.title}
              </Link>
              <span className="linked-meta">
                <Badge kind="bugSeverity" value={b.severity} />
                <Badge kind="bugStatus" value={b.status} />
              </span>
            </li>
          )}
        />
        <ListCard
          title="Task đến hạn trong 7 ngày"
          items={data.dueSoonTasks}
          empty="Không có"
          render={(t) => (
            <li key={t.id}>
              <Link to={`/tasks/${t.id}`}>
                <span className="mono">{code('tasks', t.id)}</span> {t.title}
              </Link>
              <span className="linked-meta">
                <Badge kind="taskStatus" value={t.status} />
                <span>{fmtDate(t.due_date)}</span>
              </span>
            </li>
          )}
        />
        <ListCard
          title="Cuộc họp"
          items={[...data.upcomingMeetings.map((m) => ({ ...m, upcoming: true })), ...data.recentMeetings].slice(0, 6)}
          empty="Chưa có cuộc họp"
          render={(m) => (
            <li key={m.id}>
              <Link to={`/meetings/${m.id}`}>{m.title}</Link>
              <span className="linked-meta">
                {m.upcoming && <span className="badge badge-blue">Sắp tới</span>}
                <span>
                  {fmtDate(m.meeting_date)} {m.start_time}
                </span>
              </span>
            </li>
          )}
        />
      </div>
    </div>
  );
}
