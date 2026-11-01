import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { code, fmtDate, isClosed, label, LABELS, todayStr } from '../constants.js';
import { Badge } from './ui.jsx';

const DAY_MS = 86400000;
export const ZOOMS = {
  day: { label: 'Ngày', px: 30 },
  week: { label: 'Tuần', px: 12 },
  month: { label: 'Tháng', px: 4 },
};
const MONTHS = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];

/** "YYYY-MM-DD" -> số ngày (UTC) để tính khoảng cách không lệch múi giờ */
const dayNum = (s) => Math.floor(Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const fromDayNum = (n) => new Date(n * DAY_MS);
const iso = (n) => fromDayNum(n).toISOString().slice(0, 10);

/** Khoảng thời gian của task: bắt đầu (hoặc ngày tạo) -> hạn (hoặc ngày hoàn thành) */
function taskSpan(t) {
  let start = dayNum(t.start_date ?? t.created_at);
  let end = t.due_date ? dayNum(t.due_date) : t.completed_at ? dayNum(t.completed_at) : start;
  if (end < start) start = end;
  return { start, end, open: !t.due_date };
}

/** Khoảng thời gian dự án; thiếu ngày thì suy ra từ các task */
function projectSpan(p) {
  const spans = p.tasks.map(taskSpan);
  const start = p.start_date
    ? dayNum(p.start_date)
    : spans.length
      ? Math.min(...spans.map((s) => s.start))
      : dayNum(todayStr());
  let end = p.end_date ? dayNum(p.end_date) : spans.length ? Math.max(...spans.map((s) => s.end)) : start;
  if (end < start) end = start;
  return { start, end, open: !p.end_date };
}

function Bar({ span, rangeStart, px, className, title, children, to }) {
  const left = (span.start - rangeStart) * px;
  const width = Math.max(px, (span.end - span.start + 1) * px);
  const inside = width >= 90;
  const Tag = to ? Link : 'div';
  return (
    <Tag to={to} className={`g-bar ${className} ${span.open ? 'g-open' : ''}`} style={{ left, width }} title={title}>
      {inside && <span className="g-bar-text">{children}</span>}
      {!inside && (
        <span className="g-bar-outside" style={{ left: width + 6 }}>
          {children}
        </span>
      )}
    </Tag>
  );
}

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/**
 * Biểu đồ Gantt theo thành viên: thành viên -> dự án tham gia (kèm vai trò) -> task đang làm.
 * data: kết quả GET /api/gantt
 */
export default function Gantt({ data, zoom = 'week', showMemberRows = true }) {
  const px = ZOOMS[zoom]?.px ?? ZOOMS.week.px;
  const scrollRef = useRef(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const today = dayNum(data.today);

  const { rows, rangeStart, days } = useMemo(() => {
    const rows = [];
    let min = today;
    let max = today;
    for (const m of data.members) {
      const taskCount = m.projects.reduce((n, p) => n + p.tasks.length, 0);
      if (showMemberRows) rows.push({ kind: 'member', key: `m${m.id}`, member: m, taskCount });
      if (showMemberRows && collapsed.has(m.id)) continue;
      if (!m.projects.length) rows.push({ kind: 'empty', key: `e${m.id}` });
      for (const p of m.projects) {
        const span = projectSpan(p);
        min = Math.min(min, span.start);
        max = Math.max(max, span.end);
        rows.push({ kind: 'project', key: `m${m.id}p${p.id}`, project: p, span });
        for (const t of p.tasks) {
          const ts = taskSpan(t);
          min = Math.min(min, ts.start);
          max = Math.max(max, ts.end);
          rows.push({ kind: 'task', key: `m${m.id}t${t.id}`, task: t, span: ts, project: p });
        }
      }
    }
    // Bắt đầu từ thứ Hai để lưới tuần thẳng hàng
    let start = min - 3;
    const weekday = (fromDayNum(start).getUTCDay() + 6) % 7; // 0 = thứ Hai
    start -= weekday;
    const end = max + 10;
    return { rows, rangeStart: start, days: end - start + 1 };
  }, [data, collapsed, showMemberRows, today]);

  // Cuộn tới ngày hôm nay khi mở / đổi mức thu phóng
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, (today - rangeStart) * px - 160);
  }, [today, rangeStart, px]);

  const width = days * px;
  const months = [];
  const ticks = [];
  for (let d = rangeStart; d < rangeStart + days; d++) {
    const date = fromDayNum(d);
    if (d === rangeStart || date.getUTCDate() === 1) {
      months.push({ d, text: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` });
    }
    if (zoom === 'day') ticks.push({ d, text: date.getUTCDate(), weekend: date.getUTCDay() % 6 === 0 });
    else if (zoom === 'week' && date.getUTCDay() === 1) ticks.push({ d, text: fmtDate(iso(d)).slice(0, 5) });
  }

  const toggle = (id) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!data.members.length) return <div className="empty">Không có thành viên nào phù hợp.</div>;

  return (
    <div className="gantt" style={{ '--day': `${px}px` }}>
      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-inner" style={{ width: `calc(var(--g-label) + ${width}px)` }}>
          <div className="g-row g-head">
            <div className="g-label">Thành viên / Dự án / Task</div>
            <div className="g-track" style={{ width }}>
              <div className="g-months">
                {months.map((m) => (
                  <span key={m.d} style={{ left: (m.d - rangeStart) * px }}>
                    {m.text}
                  </span>
                ))}
              </div>
              {ticks.length > 0 && (
                <div className="g-ticks">
                  {ticks.map((t) => (
                    <span
                      key={t.d}
                      className={t.weekend ? 'weekend' : ''}
                      style={{ left: (t.d - rangeStart) * px, width: zoom === 'day' ? px : undefined }}
                    >
                      {t.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="g-body">
            <div className="g-today" style={{ left: `calc(var(--g-label) + ${(today - rangeStart) * px + px / 2}px)` }}>
              <span>Hôm nay</span>
            </div>
            {rows.map((r) => {
              if (r.kind === 'member') {
                const m = r.member;
                const isCollapsed = collapsed.has(m.id);
                return (
                  <div key={r.key} className="g-row g-row-member">
                    <div className="g-label">
                      <button
                        className="g-toggle"
                        onClick={() => toggle(m.id)}
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                      >
                        {isCollapsed ? '▸' : '▾'}
                      </button>
                      <span className="avatar">{initials(m.name)}</span>
                      <span className="g-member-text">
                        <Link to={`/members/${m.id}`}>{m.name}</Link>
                        <span className="muted small">
                          {m.projects.length} dự án · {r.taskCount} task
                        </span>
                      </span>
                    </div>
                    <div className="g-track" style={{ width }} />
                  </div>
                );
              }
              if (r.kind === 'empty') {
                return (
                  <div key={r.key} className="g-row">
                    <div className="g-label g-indent-1 muted small">Chưa tham gia dự án nào</div>
                    <div className="g-track" style={{ width }} />
                  </div>
                );
              }
              if (r.kind === 'project') {
                const p = r.project;
                return (
                  <div key={r.key} className="g-row g-row-project">
                    <div className="g-label g-indent-1">
                      <span className="mono">{p.code}</span>
                      <span className="g-ellipsis" title={p.name}>
                        {p.name}
                      </span>
                      {p.role ? (
                        <Badge kind="memberRole" value={p.role} />
                      ) : (
                        <span className="muted small" title="Được giao task nhưng chưa là thành viên dự án">
                          (ngoài dự án)
                        </span>
                      )}
                    </div>
                    <div className="g-track" style={{ width }}>
                      <Bar
                        span={r.span}
                        rangeStart={rangeStart}
                        px={px}
                        to={`/projects/${p.id}`}
                        className="g-bar-project"
                        title={`${p.code} · ${p.name}\n${fmtDate(iso(r.span.start))} → ${
                          r.span.open ? 'chưa xác định' : fmtDate(iso(r.span.end))
                        }${p.role ? `\nVai trò: ${label('memberRole', p.role)}` : ''}`}
                      >
                        {p.code} · {p.role ? label('memberRole', p.role) : 'ngoài dự án'}
                      </Bar>
                    </div>
                  </div>
                );
              }
              const t = r.task;
              const overdue = t.due_date && !isClosed(t.status) && dayNum(t.due_date) < today;
              return (
                <div key={r.key} className="g-row g-row-task">
                  <div className="g-label g-indent-2">
                    <Link to={`/tasks/${t.id}`} className="g-ellipsis" title={t.title}>
                      <span className="mono muted">{code('tasks', t.id)}</span> {t.title}
                      {t.involvement === 'support' && <span className="muted small"> (hỗ trợ)</span>}
                    </Link>
                  </div>
                  <div className="g-track" style={{ width }}>
                    <Bar
                      span={r.span}
                      rangeStart={rangeStart}
                      px={px}
                      to={`/tasks/${t.id}`}
                      className={`g-task g-status-${t.status} ${overdue ? 'g-overdue' : ''}`}
                      title={`${code('tasks', t.id)} · ${t.title}\nTrạng thái: ${label('taskStatus', t.status)}${
                        t.involvement === 'support' ? '\nVai trò: Hỗ trợ' : ''
                      }\n${fmtDate(
                        iso(r.span.start),
                      )} → ${t.due_date ? fmtDate(t.due_date) : 'chưa có hạn'}${overdue ? ' (quá hạn)' : ''}`}
                    >
                      {t.title}
                    </Bar>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="g-legend">
        <span>
          <i className="g-sw g-bar-project" /> Thời gian dự án
        </span>
        {Object.keys(LABELS.taskStatus).map((s) => (
          <span key={s}>
            <i className={`g-sw g-status-${s}`} /> {label('taskStatus', s)}
          </span>
        ))}
        <span>
          <i className="g-sw g-status-todo g-overdue" /> Quá hạn
        </span>
        <span>
          <i className="g-sw g-status-todo g-open" /> Chưa có hạn
        </span>
      </div>
    </div>
  );
}
