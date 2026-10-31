import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import DetailPage, { InfoList, Section } from '../components/DetailPage.jsx';
import ResourceList from '../components/ResourceList.jsx';
import { Badge, Icon, Prose } from '../components/ui.jsx';
import { code, fmtDate, isOverdue, options, todayStr } from '../constants.js';
import { useLookup, useToast } from '../context.jsx';
import { meetingFields } from '../forms.js';

export function MeetingList() {
  const today = todayStr();
  return (
    <ResourceList
      resource="meetings"
      noun="biên bản họp"
      formFields={meetingFields}
      searchPlaceholder="Tìm theo tiêu đề, nội dung, người tham dự…"
      columns={[
        {
          key: 'meeting_date',
          title: 'Ngày họp',
          sort: 'meeting_date',
          width: 140,
          render: (m) => (
            <>
              {fmtDate(m.meeting_date)} {m.start_time && <span className="muted">{m.start_time}</span>}
              {m.meeting_date >= today && <span className="badge badge-blue tiny">Sắp tới</span>}
            </>
          ),
        },
        { key: 'title', title: 'Tiêu đề', sort: 'title', render: (m) => <strong>{m.title}</strong> },
        { key: 'facilitator', title: 'Chủ trì', width: 160 },
        { key: 'location', title: 'Địa điểm', width: 160, className: 'muted' },
      ]}
    />
  );
}

function ActionItems({ meeting, reload }) {
  const toast = useToast();
  const { lookup, refreshLookup } = useLookup();
  const [form, setForm] = useState({ title: '', assignee: '', due_date: '' });
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const t = await api.create('tasks', {
        title: form.title,
        assignee: form.assignee || null,
        due_date: form.due_date || null,
        meeting_id: meeting.id,
      });
      toast(`Đã tạo ${code('tasks', t.id)}`);
      setForm({ title: '', assignee: '', due_date: '' });
      reload();
      refreshLookup();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (task, status) => {
    try {
      await api.update('tasks', task.id, { status });
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Section title={`Action items (${meeting.action_items.length})`}>
      {meeting.action_items.length > 0 && (
        <div className="table-wrap">
        <table className="table compact">
          <tbody>
            {meeting.action_items.map((t) => (
              <tr key={t.id}>
                <td className="mono" style={{ width: 90 }}>
                  <Link to={`/tasks/${t.id}`}>{code('tasks', t.id)}</Link>
                </td>
                <td className={t.status === 'done' ? 'strike' : ''}>{t.title}</td>
                <td style={{ width: 150 }}>{t.assignee || <span className="muted">Chưa giao</span>}</td>
                <td style={{ width: 110 }} className={isOverdue(t) ? 'text-danger' : ''}>
                  {fmtDate(t.due_date)}
                </td>
                <td style={{ width: 140 }} className="no-print">
                  <select value={t.status} onChange={(e) => setStatus(t, e.target.value)} aria-label="Trạng thái">
                    {options('taskStatus').map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="print-only">
                  <Badge kind="taskStatus" value={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <form className="inline-form no-print" onSubmit={add}>
        <input
          placeholder="Thêm action item mới…"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={{ flex: 3 }}
        />
        <input
          placeholder="Người thực hiện"
          list="ai-people"
          value={form.assignee}
          onChange={(e) => setForm({ ...form, assignee: e.target.value })}
          style={{ flex: 1.5 }}
        />
        <datalist id="ai-people">
          {lookup.people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <input
          type="date"
          aria-label="Hạn"
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

export function MeetingDetail() {
  return (
    <DetailPage
      resource="meetings"
      backLabel="Danh sách biên bản họp"
      formFields={meetingFields}
      actions={() => (
        <button className="btn" onClick={() => window.print()}>
          <Icon name="print" size={16} /> In / PDF
        </button>
      )}
    >
      {(m, { reload }) => (
        <div className="detail-grid">
          <div className="detail-main">
            <Section title="Nội dung / Agenda">
              <Prose text={m.agenda} />
            </Section>
            <Section title="Biên bản">
              <Prose text={m.notes} placeholder="Chưa ghi biên bản" />
            </Section>
            <Section title="Quyết định / Kết luận">
              <Prose text={m.decisions} />
            </Section>
            <ActionItems meeting={m} reload={reload} />
          </div>
          <aside className="detail-side">
            <Section title="Thông tin">
              <InfoList
                items={[
                  ['Ngày họp', fmtDate(m.meeting_date)],
                  ['Giờ', m.start_time],
                  ['Địa điểm', m.location],
                  ['Chủ trì', m.facilitator],
                  ['Tham dự', m.attendees && <Prose text={m.attendees} />],
                ]}
              />
            </Section>
          </aside>
        </div>
      )}
    </DetailPage>
  );
}
