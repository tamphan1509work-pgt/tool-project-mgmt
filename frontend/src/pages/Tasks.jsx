import CategoryBadge from '../components/CategoryBadge.jsx';
import { categoryFilter } from '../categories.js';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import DetailPage, { InfoList, LinkedList, Section } from '../components/DetailPage.jsx';
import ResourceList, { Filters, SearchBox, useParamSetter } from '../components/ResourceList.jsx';
import { Badge, ErrorBox, Icon, Prose } from '../components/ui.jsx';
import { code, fmtDate, fmtDateTime, isOverdue, LABELS, options } from '../constants.js';
import { useAsync, useProject, useToast } from '../context.jsx';
import { Subtasks, TaskDocuments, TaskLinks, TaskTitleMeta } from './TaskParts.jsx';
import { taskFields } from '../forms.js';

const FILTERS = [
  { name: 'status', label: 'Trạng thái', options: options('taskStatus') },
  { name: 'priority', label: 'Ưu tiên', options: options('priority') },
  { name: 'assignee', label: 'Người làm', source: 'people' },
  categoryFilter,
  { name: 'overdue', label: 'Quá hạn', type: 'toggle' },
  { name: 'parent_id', label: 'Ẩn subtask', type: 'toggle', value: 'none' },
];

const Due = ({ task }) =>
  task.due_date ? (
    <span className={isOverdue(task) ? 'text-danger' : ''} title={isOverdue(task) ? 'Quá hạn' : undefined}>
      {fmtDate(task.due_date)}
    </span>
  ) : (
    <span className="muted">—</span>
  );

function ViewSwitch({ view, setView }) {
  return (
    <div className="segmented" role="tablist">
      <button className={view !== 'board' ? 'active' : ''} onClick={() => setView('')} title="Dạng bảng">
        <Icon name="list" size={16} /> Bảng
      </button>
      <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')} title="Kanban">
        <Icon name="board" size={16} /> Kanban
      </button>
    </div>
  );
}

function Board({ switcher }) {
  const [params, setParam] = useParamSetter();
  const toast = useToast();
  const [dragOver, setDragOver] = useState(null);
  const { projectId } = useProject();
  const query = Object.fromEntries(params);
  delete query.view;
  delete query.status;
  const { data, error, reload, setData } = useAsync(
    () =>
      api.list('tasks', {
        ...query,
        project_id: projectId,
        limit: 500,
        sort: query.sort || 'priority',
        order: query.order || 'desc',
      }),
    [params.toString(), projectId],
  );

  const move = async (taskId, status) => {
    const task = data.items.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    setData({ ...data, items: data.items.map((t) => (t.id === taskId ? { ...t, status } : t)) });
    try {
      await api.update('tasks', taskId, { status });
      toast(`${code('tasks', taskId)} → ${LABELS.taskStatus[status][0]}`);
    } catch (err) {
      toast(err.message, 'error');
      reload();
    }
  };

  return (
    <>
      <div className="toolbar">
        <SearchBox value={params.get('q') ?? ''} onChange={(v) => setParam('q', v)} />
        <Filters filters={FILTERS.filter((f) => f.name !== 'status')} params={params} setParam={setParam} />
        <div className="spacer" />
        {switcher}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <div className="board">
        {options('taskStatus').map((col) => {
          const items = data?.items.filter((t) => t.status === col.value) ?? [];
          return (
            <div
              key={col.value}
              className={`board-col ${dragOver === col.value ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.value);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                move(Number(e.dataTransfer.getData('text/plain')), col.value);
              }}
            >
              <div className="board-col-head">
                <Badge kind="taskStatus" value={col.value} />
                <span className="muted">{items.length}</span>
              </div>
              {items.map((t) => (
                <div
                  key={t.id}
                  className="board-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                >
                  <Link to={`/tasks/${t.id}`} className="board-card-title">
                    {t.title}
                  </Link>
                  <TaskTitleMeta task={t} />
                  {t.category_id && (
                    <div>
                      <CategoryBadge id={t.category_id} />
                    </div>
                  )}
                  <div className="board-card-meta">
                    <span className="mono muted">{code('tasks', t.id)}</span>
                    <Badge kind="priority" value={t.priority} />
                  </div>
                  <div className="board-card-meta">
                    <span>{t.assignee || <span className="muted">Chưa giao</span>}</span>
                    <Due task={t} />
                  </div>
                  <select
                    className="board-mobile-move"
                    value={t.status}
                    aria-label="Chuyển trạng thái"
                    onChange={(e) => move(t.id, e.target.value)}
                  >
                    {options('taskStatus').map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function TaskList() {
  const [params, setParam] = useParamSetter();
  const view = params.get('view');
  const switcher = <ViewSwitch view={view} setView={(v) => setParam('view', v, { keepPage: true })} />;
  if (view === 'board') return <Board switcher={switcher} />;
  return (
    <ResourceList
      resource="tasks"
      noun="task"
      formFields={taskFields}
      filters={FILTERS}
      headerExtra={switcher}
      searchPlaceholder="Tìm theo tên, mô tả, người làm, mã…"
      columns={[
        {
          key: 'title',
          title: 'Tên task',
          sort: 'title',
          render: (t) => (
            <div className="person-cell">
              <strong>{t.title}</strong>
              <TaskTitleMeta task={t} />
            </div>
          ),
        },
        {
          key: 'status',
          title: 'Trạng thái',
          sort: 'status',
          width: 130,
          render: (t) => <Badge kind="taskStatus" value={t.status} />,
        },
        {
          key: 'priority',
          title: 'Ưu tiên',
          sort: 'priority',
          width: 120,
          render: (t) => <Badge kind="priority" value={t.priority} />,
        },
        { key: 'category_id', title: 'Danh mục', width: 150, render: (r) => <CategoryBadge id={r.category_id} /> },
        { key: 'assignee', title: 'Người làm', width: 160 },
        { key: 'due_date', title: 'Hạn', sort: 'due_date', width: 110, render: (t) => <Due task={t} /> },
      ]}
    />
  );
}

export function TaskDetail() {
  return (
    <DetailPage
      resource="tasks"
      backLabel="Danh sách task"
      formFields={taskFields}
      badges={(t) => (
        <>
          <Badge kind="taskStatus" value={t.status} />
          <Badge kind="priority" value={t.priority} />
          {isOverdue(t) && <span className="badge badge-red">Quá hạn</span>}
          {t.parent && (
            <Link to={`/tasks/${t.parent.id}`} className="badge badge-purple">
              ↳ Subtask của {code('tasks', t.parent.id)}
            </Link>
          )}
        </>
      )}
      actions={(t, { update }) => (
        <select
          value={t.status}
          aria-label="Đổi trạng thái"
          onChange={(e) =>
            update({ status: e.target.value }, `Đã chuyển sang "${LABELS.taskStatus[e.target.value][0]}"`)
          }
        >
          {options('taskStatus').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    >
      {(t, { reload }) => (
        <div className="detail-grid">
          <div className="detail-main">
            <Section title="Mô tả">
              <Prose text={t.description} placeholder="Chưa có mô tả" />
            </Section>
            {!t.parent && <Subtasks task={t} reload={reload} />}
            <TaskDocuments task={t} reload={reload} />
            <TaskLinks task={t} reload={reload} />
            <Section
              title={`Test case (${t.test_cases.length})`}
              extra={
                <Link to={`/test-cases?task_id=${t.id}`} className="small">
                  Xem trong Test report
                </Link>
              }
            >
              <LinkedList
                resource="test-cases"
                items={t.test_cases}
                render={(x) => <Badge kind="testStatus" value={x.status} />}
                empty="Chưa có test case nào liên kết"
              />
            </Section>
            <Section title={`Bug (${t.bugs.length})`}>
              <LinkedList
                resource="bugs"
                items={t.bugs}
                render={(x) => (
                  <>
                    <Badge kind="bugSeverity" value={x.severity} /> <Badge kind="bugStatus" value={x.status} />
                  </>
                )}
                empty="Chưa có bug nào liên kết"
              />
            </Section>
          </div>
          <aside className="detail-side">
            <Section title="Thông tin">
              <InfoList
                items={[
                  ...(t.parent
                    ? [
                        [
                          'Thuộc task',
                          t.parent && (
                            <Link to={`/tasks/${t.parent.id}`}>
                              {code('tasks', t.parent.id)} · {t.parent.title}
                            </Link>
                          ),
                        ],
                      ]
                    : []),
                  ['Danh mục', <CategoryBadge key="c" id={t.category_id} full />],
                  ['Người thực hiện', t.assignee],
                  ['Ngày bắt đầu', fmtDate(t.start_date)],
                  ['Hạn hoàn thành', <Due key="d" task={t} />],
                  ['Ước lượng', t.estimate_hours != null ? `${t.estimate_hours} giờ` : null],
                  ['Hoàn thành lúc', fmtDateTime(t.completed_at)],
                  [
                    'Từ cuộc họp',
                    t.meeting && (
                      <Link to={`/meetings/${t.meeting.id}`}>
                        {code('meetings', t.meeting.id)} · {t.meeting.title}
                      </Link>
                    ),
                  ],
                ]}
              />
            </Section>
          </aside>
        </div>
      )}
    </DetailPage>
  );
}
