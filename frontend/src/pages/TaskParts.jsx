import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Section } from '../components/DetailPage.jsx';
import DocumentPicker from '../components/DocumentPicker.jsx';
import { Badge, Icon } from '../components/ui.jsx';
import { code, fmtDate, isOverdue, label } from '../constants.js';
import { useLookup, useToast } from '../context.jsx';
import { DocLink } from './Documents.jsx';

/** Ô tên task trong bảng / Kanban: subtask của ai, tiến độ subtask, bị chặn */
export function TaskTitleMeta({ task }) {
  return (
    <span className="task-meta">
      {task.parent_id && (
        <span className="muted small" title={task.parent_title}>
          ↳ Subtask của {code('tasks', task.parent_id)}
        </span>
      )}
      {task.subtask_count > 0 && (
        <span className="chip" title="Subtask đã xong / tổng">
          ☑ {task.subtask_done_count}/{task.subtask_count} subtask
        </span>
      )}
      {task.blocked_by_count > 0 && task.status !== 'done' && (
        <span className="chip chip-danger" title="Đang chờ task phụ thuộc hoàn thành">
          ⛔ chờ {task.blocked_by_count} task
        </span>
      )}
    </span>
  );
}

/* ---------------- Subtask ---------------- */
export function Subtasks({ task, reload }) {
  const toast = useToast();
  const { lookup, refreshLookup } = useLookup();
  const [form, setForm] = useState({ title: '', assignee: '', due_date: '' });
  const [busy, setBusy] = useState(false);
  const done = task.subtasks.filter((s) => s.status === 'done').length;
  const total = task.subtasks.length;

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const s = await api.create('tasks', {
        project_id: task.project_id,
        parent_id: task.id,
        title: form.title,
        assignee: form.assignee || task.assignee || null,
        due_date: form.due_date || null,
        priority: task.priority,
      });
      toast(`Đã thêm subtask ${code('tasks', s.id)}`);
      setForm({ title: '', assignee: form.assignee, due_date: '' });
      reload();
      refreshLookup();
    } catch (err) {
      toast(Object.values(err.details ?? {})[0] ?? err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s) => {
    try {
      await api.update('tasks', s.id, { status: s.status === 'done' ? 'todo' : 'done' });
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Section title={`Subtask (${done}/${total})`}>
      {total > 0 && (
        <>
          <div className="progress" title={`${done}/${total} subtask đã xong`}>
            <div style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <ul className="subtask-list">
            {task.subtasks.map((s, i) => (
              <li key={s.id} className={s.status === 'done' ? 'is-done' : ''}>
                <span className="col-stt">{i + 1}</span>
                <input
                  type="checkbox"
                  checked={s.status === 'done'}
                  onChange={() => toggle(s)}
                  aria-label={`Đánh dấu hoàn thành ${s.title}`}
                />
                <Link to={`/tasks/${s.id}`} className="subtask-title">
                  <span className="mono muted">{code('tasks', s.id)}</span> {s.title}
                </Link>
                <span className="linked-meta">
                  {s.assignee && <span className="muted">{s.assignee}</span>}
                  {s.due_date && <span className={isOverdue(s) ? 'text-danger' : ''}>{fmtDate(s.due_date)}</span>}
                  <Badge kind="taskStatus" value={s.status} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="inline-form" onSubmit={add}>
        <input
          placeholder="Thêm subtask…"
          aria-label="Tên subtask"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={{ flex: 3 }}
        />
        <input
          placeholder={task.assignee ? `Người làm (mặc định: ${task.assignee})` : 'Người làm'}
          aria-label="Người làm subtask"
          list="subtask-people"
          value={form.assignee}
          onChange={(e) => setForm({ ...form, assignee: e.target.value })}
          style={{ flex: 2 }}
        />
        <datalist id="subtask-people">
          {lookup.people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <input
          type="date"
          aria-label="Hạn subtask"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
        />
        <button className="btn btn-primary" disabled={busy || !form.title.trim()}>
          <Icon name="plus" /> Thêm
        </button>
      </form>
    </Section>
  );
}

/* ---------------- Tài liệu liên quan (chọn từ mục Tài liệu) ---------------- */
export function TaskDocuments({ task, reload }) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);

  const unlink = async (doc) => {
    try {
      await api.update('tasks', task.id, { document_ids: task.document_ids.filter((id) => id !== doc.id) });
      toast(`Đã gỡ ${code('documents', doc.id)} khỏi task`);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Section
      title={`Tài liệu liên quan (${task.documents.length})`}
      extra={
        <button className="btn btn-sm btn-primary-ghost" onClick={() => setPicking(true)}>
          <Icon name="plus" size={16} /> Thêm tài liệu
        </button>
      }
    >
      {task.documents.length === 0 ? (
        <div className="muted">
          Chưa liên kết tài liệu thiết kế / đặc tả nào. Bấm "Thêm tài liệu" để chọn từ mục Tài liệu.
        </div>
      ) : (
        <ul className="linked-list">
          {task.documents.map((d) => (
            <li key={d.id}>
              <Link to={`/documents/${d.id}`}>
                <span className="mono">{code('documents', d.id)}</span> {d.title}
              </Link>
              <span className="linked-meta">
                <Badge kind="documentType" value={d.type} />
                {d.version && <span className="muted">v{d.version}</span>}
                <DocLink url={d.url} />
                <button className="icon-btn danger" title="Gỡ tài liệu khỏi task" onClick={() => unlink(d)}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {picking && (
        <DocumentPicker
          excludeIds={task.document_ids}
          onClose={() => setPicking(false)}
          onConfirm={async (ids) => {
            try {
              await api.update('tasks', task.id, { document_ids: [...task.document_ids, ...ids] });
              toast(`Đã thêm ${ids.length} tài liệu vào ${code('tasks', task.id)}`);
              setPicking(false);
              reload();
            } catch (err) {
              toast(err.message, 'error');
            }
          }}
        />
      )}
    </Section>
  );
}

/* ---------------- Task liên quan & phụ thuộc ---------------- */
const LINK_GROUPS = [
  { key: 'depends_on', title: 'Phụ thuộc vào', hint: 'Các task này cần xong trước' },
  { key: 'blocks', title: 'Đang chặn', hint: 'Các task này chờ task hiện tại xong' },
  { key: 'relates', title: 'Liên quan', hint: '' },
];
const LINK_TYPES = [
  { value: 'depends_on', label: 'Phụ thuộc vào (task kia phải xong trước)' },
  { value: 'blocks', label: 'Đang chặn (task kia chờ task này)' },
  { value: 'relates', label: 'Liên quan' },
];

export function TaskLinks({ task, reload }) {
  const toast = useToast();
  const { lookup } = useLookup();
  const [form, setForm] = useState({ type: 'depends_on', other_task_id: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const linkedIds = useMemo(
    () => new Set(LINK_GROUPS.flatMap((g) => task.links[g.key].map((t) => t.id))),
    [task.links],
  );
  const candidates = lookup.tasks.filter((t) => t.id !== task.id && !linkedIds.has(t.id));
  const waiting = task.links.depends_on.filter((t) => t.status !== 'done');
  const count = linkedIds.size;

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addTaskLink(task.id, { type: form.type, other_task_id: Number(form.other_task_id) });
      toast('Đã thêm liên kết');
      setForm({ ...form, other_task_id: '' });
      reload();
    } catch (err) {
      setError(Object.values(err.details ?? {})[0] ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    try {
      await api.removeTaskLink(t.link_id);
      toast('Đã gỡ liên kết');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Section title={`Task liên quan & phụ thuộc (${count})`}>
      {waiting.length > 0 && task.status !== 'done' && (
        <div className="warn-box">
          ⛔ Task này đang chờ {waiting.length} task phụ thuộc chưa hoàn thành:{' '}
          {waiting.map((t) => code('tasks', t.id)).join(', ')}
        </div>
      )}
      {count === 0 && <div className="muted">Chưa liên kết với task nào.</div>}
      {LINK_GROUPS.map(
        (g) =>
          task.links[g.key].length > 0 && (
            <div key={g.key} className="link-group">
              <div className="link-group-title">
                {g.title} {g.hint && <span className="muted small">· {g.hint}</span>}
              </div>
              <ul className="linked-list">
                {task.links[g.key].map((t) => (
                  <li key={t.link_id}>
                    <Link to={`/tasks/${t.id}`}>
                      <span className="mono">{code('tasks', t.id)}</span> {t.title}
                    </Link>
                    <span className="linked-meta">
                      {t.assignee && <span className="muted">{t.assignee}</span>}
                      <Badge kind="taskStatus" value={t.status} />
                      <button className="icon-btn danger" title="Gỡ liên kết" onClick={() => remove(t)}>
                        <Icon name="close" size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
      <form className="inline-form link-form" onSubmit={add}>
        <select
          aria-label="Loại liên kết"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          style={{ flex: 2 }}
        >
          {LINK_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Task liên kết"
          value={form.other_task_id}
          onChange={(e) => setForm({ ...form, other_task_id: e.target.value })}
          style={{ flex: 3 }}
        >
          <option value="">— Chọn task —</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {code('tasks', t.id)} · {t.title} ({label('taskStatus', t.status)})
            </option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={busy || !form.other_task_id}>
          <Icon name="plus" /> Liên kết
        </button>
      </form>
      {error && <div className="field-error">{error}</div>}
    </Section>
  );
}
