import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, getActor, setActor } from '../api.js';
import { code, fmtDate } from '../constants.js';
import { useLookup, useProject } from '../context.jsx';
import { Icon } from './ui.jsx';

/** Chọn "Bạn là ai" để ghi tên vào lịch sử thay đổi (chưa có đăng nhập) */
export function ActorSelect() {
  const { lookup } = useLookup();
  const [name, setName] = useState(getActor() ?? '');
  const names = lookup.allMembers.map((m) => m.name);
  return (
    <label className="actor-select" title="Tên này được ghi vào lịch sử thay đổi">
      <Icon name="people" size={16} />
      <select
        aria-label="Bạn là"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setActor(e.target.value);
        }}
      >
        <option value="">Bạn là… (chưa chọn)</option>
        {name && !names.includes(name) && <option value={name}>{name}</option>}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
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
