import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import CopyLinkButton from '../components/CopyLink.jsx';
import DetailPage, { InfoList, Section } from '../components/DetailPage.jsx';
import EntityForm from '../components/EntityForm.jsx';
import { Badge, Empty, ErrorBox, Icon, Loading, Modal, Prose } from '../components/ui.jsx';
import { code, fmtDate, fmtDateTime, isOverdue, todayStr, isClosed } from '../constants.js';
import { useAuth } from '../auth.jsx';
import { useAsync, useConfirm, useLookup, useToast } from '../context.jsx';
import { milestoneFields } from '../forms.js';

const isLate = (m) => m.due_date < todayStr() && !['completed', 'cancelled'].includes(m.status);
const pctOf = (m) => (m.task_count ? Math.round((m.done_count / m.task_count) * 100) : 0);

export function MilestoneProgress({ m }) {
  const pct = pctOf(m);
  return (
    <div className="ms-progress" title={`${m.done_count}/${m.task_count} task hoàn thành`}>
      <div className="progress">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="small muted">
        {m.done_count}/{m.task_count} task · {pct}%
      </span>
    </div>
  );
}

export function MilestoneDue({ m }) {
  return (
    <span className={isLate(m) ? 'text-danger' : ''}>
      {fmtDate(m.due_date)}
      {isLate(m) && ' · trễ hạn'}
    </span>
  );
}

/** Tab "Milestone" trong chi tiết dự án */
export function MilestoneList({ project }) {
  const isAdmin = Boolean(useAuth().user?.is_admin);
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshLookup } = useLookup();
  const [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useAsync(
    () => api.list('milestones', { project_id: project.id, limit: 200, sort: 'due_date', order: 'asc' }),
    [project.id],
  );

  const save = async (values) => {
    if (editing.id) {
      await api.update('milestones', editing.id, values);
      toast(`Đã cập nhật milestone "${values.name}"`);
    } else {
      const m = await api.create('milestones', { ...values, project_id: project.id });
      toast(`Đã tạo ${code('milestones', m.id)}`);
    }
    setEditing(null);
    reload();
    refreshLookup();
  };

  const remove = async (m) => {
    const msg = `Xoá milestone "${m.name}"?${m.task_count ? ` ${m.task_count} task sẽ được gỡ khỏi milestone (task không bị xoá).` : ''}`;
    if (!(await confirm(msg))) return;
    try {
      await api.remove('milestones', m.id);
      toast(`Đã xoá milestone "${m.name}"`);
      reload();
      refreshLookup();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className="toolbar">
        <p className="muted small" style={{ margin: 0 }}>
          Milestone là các mốc quan trọng của dự án. Gắn task vào milestone để theo dõi tiến độ.
        </p>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Icon name="plus" /> Thêm milestone
          </button>
        )}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty>Dự án chưa có milestone nào.</Empty>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="col-stt">STT</th>
                <th style={{ width: 80 }}>Mã</th>
                <th>Milestone</th>
                <th style={{ width: 130 }}>Trạng thái</th>
                <th style={{ width: 170 }}>Hạn</th>
                <th style={{ width: 200 }}>Tiến độ</th>
                <th style={{ width: 116 }} />
              </tr>
            </thead>
            <tbody>
              {data.items.map((m, i) => (
                <tr key={m.id}>
                  <td className="col-stt">{i + 1}</td>
                  <td className="mono">
                    <Link to={`/milestones/${m.id}`}>{code('milestones', m.id)}</Link>
                  </td>
                  <td>
                    <Link to={`/milestones/${m.id}`} className="strong-link">
                      {m.name}
                    </Link>
                    {m.description && <div className="muted small">{m.description}</div>}
                  </td>
                  <td>
                    <Badge kind="milestoneStatus" value={m.status} />
                  </td>
                  <td className="small">
                    {m.start_date && <span className="muted">{fmtDate(m.start_date)} → </span>}
                    <MilestoneDue m={m} />
                  </td>
                  <td>
                    <MilestoneProgress m={m} />
                  </td>
                  <td className="row-actions">
                    <CopyLinkButton compact resource="milestones" id={m.id} label={code('milestones', m.id)} />
                    {isAdmin && (
                      <>
                        <button className="icon-btn" title="Sửa" onClick={() => setEditing(m)}>
                          <Icon name="edit" size={16} />
                        </button>
                        <button className="icon-btn danger" title="Xoá" onClick={() => remove(m)}>
                          <Icon name="trash" size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal
          wide
          title={editing.id ? `Sửa ${code('milestones', editing.id)}` : 'Thêm milestone'}
          onClose={() => setEditing(null)}
        >
          <EntityForm
            fields={milestoneFields}
            initial={editing}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            submitLabel={editing.id ? 'Lưu thay đổi' : 'Tạo milestone'}
          />
        </Modal>
      )}
    </>
  );
}

export function MilestoneDetail() {
  const isAdmin = Boolean(useAuth().user?.is_admin);
  return (
    <DetailPage
      readOnly={!isAdmin}
      resource="milestones"
      backLabel="Các milestone của dự án"
      backTo={(m) => `/projects/${m.project_id}?tab=milestones`}
      formFields={milestoneFields}
      nameOf={(m) => m.name}
      badges={(m) => (
        <>
          <Badge kind="milestoneStatus" value={m.status} />
          {isLate(m) && <span className="badge badge-red">Trễ hạn</span>}
        </>
      )}
    >
      {(m) => {
        const done = m.tasks.filter((t) => isClosed(t.status)).length;
        const summary = { task_count: m.tasks.length, done_count: done };
        return (
          <div className="detail-grid">
            <div className="detail-main">
              <Section title="Mục tiêu / Mô tả">
                <Prose text={m.description} placeholder="Chưa có mô tả" />
              </Section>
              <Section
                title={`Task trong milestone (${m.tasks.length})`}
                extra={
                  <Link to={`/tasks?milestone_id=${m.id}`} className="small">
                    Xem trong danh sách task
                  </Link>
                }
              >
                <MilestoneProgress m={summary} />
                {m.tasks.length === 0 ? (
                  <div className="muted">Chưa có task nào. Mở task, bấm Sửa và chọn milestone này.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table compact">
                      <thead>
                        <tr>
                          <th className="col-stt">STT</th>
                          <th style={{ width: 90 }}>Mã</th>
                          <th>Task</th>
                          <th style={{ width: 150 }}>Người làm</th>
                          <th style={{ width: 100 }}>Hạn</th>
                          <th style={{ width: 120 }}>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.tasks.map((t, i) => (
                          <tr key={t.id}>
                            <td className="col-stt">{i + 1}</td>
                            <td className="mono">
                              <Link to={`/tasks/${t.id}`}>{code('tasks', t.id)}</Link>
                            </td>
                            <td className={isClosed(t.status) ? 'strike' : ''}>
                              {t.parent_id && <span className="muted small">↳ </span>}
                              {t.title}
                            </td>
                            <td>{t.assignee || <span className="muted">Chưa giao</span>}</td>
                            <td className={`small ${isOverdue(t) ? 'text-danger' : ''}`}>{fmtDate(t.due_date)}</td>
                            <td>
                              <Badge kind="taskStatus" value={t.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </div>
            <aside className="detail-side">
              <Section title="Thông tin">
                <InfoList
                  items={[
                    ['Ngày bắt đầu', fmtDate(m.start_date)],
                    ['Hạn hoàn thành', <MilestoneDue key="d" m={m} />],
                    ['Hoàn thành lúc', fmtDateTime(m.completed_at)],
                    [
                      'Dự án',
                      <Link key="p" to={`/projects/${m.project_id}?tab=milestones`}>
                        Xem các milestone của dự án
                      </Link>,
                    ],
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
