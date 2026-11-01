import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { categoryTree } from '../categories.js';
import { code, fmtDate, fmtDateTime } from '../constants.js';
import { useAsync, useLookup } from '../context.jsx';
import {
  bugFields,
  categoryFields,
  documentFields,
  meetingFields,
  memberFields,
  milestoneFields,
  projectFields,
  taskFields,
  testCaseFields,
} from '../forms.js';
import { Section } from './DetailPage.jsx';

const FIELDS = {
  meetings: meetingFields,
  tasks: taskFields,
  'test-cases': testCaseFields,
  bugs: bugFields,
  documents: documentFields,
  projects: projectFields,
  members: memberFields,
  categories: categoryFields,
  milestones: milestoneFields,
};

const SETTING_LABELS = {
  web_enabled: 'Thông báo trên web',
  email_enabled: 'Email nhắc deadline',
  remind_days_before: 'Nhắc trước hạn (ngày)',
  email_hour: 'Giờ gửi email',
  include_milestones: 'Nhắc cả milestone',
  email_to_assignee: 'Gửi cho người thực hiện',
  email_to_pm: 'Gửi cho PM dự án',
  extra_emails: 'Email nhận thêm',
};

export const ENTITY_LABELS = {
  meetings: 'Biên bản họp',
  tasks: 'Task',
  'test-cases': 'Test case',
  bugs: 'Bug',
  documents: 'Tài liệu',
  projects: 'Dự án',
  members: 'Thành viên',
  categories: 'Danh mục',
  milestones: 'Milestone',
  settings: 'Cài đặt',
};

const ACTION_LABELS = {
  create: 'đã tạo',
  update: 'đã cập nhật',
  delete: 'đã xoá',
  attach: 'đã đính kèm file',
  detach: 'đã xoá file',
  link: 'đã liên kết task',
  unlink: 'đã gỡ liên kết',
  run: 'đã thực thi test',
  'delete-run': 'đã xoá lần chạy test',
  member: 'đã thay đổi thành viên',
  account: 'đã thay đổi tài khoản đăng nhập',
};

function useFormatter() {
  const { lookup } = useLookup();
  const tree = categoryTree(lookup.categories);
  return (entity, change, side) => {
    const value = change[side];
    const text = change[`${side}Text`];
    if (value === null || value === undefined || value === '') return <span className="muted">(trống)</span>;
    if (entity === 'settings') {
      if (typeof value === 'boolean') return value ? 'Bật' : 'Tắt';
      return String(value);
    }
    const f = (FIELDS[entity] ?? []).find((x) => x.name === change.field);
    if (text) return text;
    if (!f) return String(value);
    switch (f.type) {
      case 'select':
        return f.options.find((o) => o.value === value)?.label ?? String(value);
      case 'date':
        return fmtDate(value);
      case 'checkbox':
        return Number(value) ? 'Bật' : 'Tắt';
      case 'category':
        return tree.find((c) => c.id === value)?.path ?? `#${value}`;
      default:
        return String(value);
    }
  };
}

const fieldLabel = (entity, field) =>
  entity === 'settings'
    ? (SETTING_LABELS[field] ?? field)
    : ((FIELDS[entity] ?? []).find((x) => x.name === field)?.label ?? field);

function Changes({ entity, changes }) {
  const format = useFormatter();
  if (!changes?.length) return null;
  return (
    <table className="history-changes">
      <tbody>
        {changes.map((c) => (
          <tr key={c.field}>
            <th>{fieldLabel(entity, c.field)}</th>
            {c.added || c.removed ? (
              <td colSpan={2}>
                {c.added?.length > 0 && (
                  <span className="text-success">+ {c.added.map((x) => x.label).join(', ')}</span>
                )}
                {c.added?.length > 0 && c.removed?.length > 0 && ' · '}
                {c.removed?.length > 0 && (
                  <span className="text-danger">− {c.removed.map((x) => x.label).join(', ')}</span>
                )}
              </td>
            ) : (
              <>
                <td className="history-from">{format(entity, c, 'from')}</td>
                <td className="history-to">→ {format(entity, c, 'to')}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Entry({ h, showEntity }) {
  const deleted = h.action === 'delete';
  const target =
    showEntity && h.entity !== 'settings' ? (
      deleted ? (
        <span>
          {ENTITY_LABELS[h.entity]} {code(h.entity, h.entity_id)}
        </span>
      ) : (
        <Link to={`/${h.entity}/${h.entity_id}`}>
          {ENTITY_LABELS[h.entity]} {code(h.entity, h.entity_id)}
        </Link>
      )
    ) : null;
  return (
    <li className={`history-entry history-${h.action}`}>
      <div className="history-line">
        <strong>{h.actor || 'Ai đó'}</strong> {ACTION_LABELS[h.action] ?? h.action} {target}
        <span className="muted small history-time">{fmtDateTime(h.created_at)}</span>
      </div>
      {h.summary && h.action !== 'create' && <div className="history-summary">{h.summary}</div>}
      <Changes entity={h.entity} changes={h.changes} />
    </li>
  );
}

/** Danh sách lịch sử, có nút "Xem thêm". params: { entity, entity_id } hoặc { project_id } */
export function HistoryList({ params, showEntity = false, reloadKey }) {
  const [limit, setLimit] = useState(20);
  const { data, error } = useAsync(() => api.history({ ...params, limit }), [JSON.stringify(params), limit, reloadKey]);
  if (error) return <div className="error-box">{error.message}</div>;
  if (!data) return <div className="muted">Đang tải…</div>;
  if (!data.items.length) return <div className="muted">Chưa có thay đổi nào được ghi nhận.</div>;
  return (
    <>
      <ul className="history-list">
        {data.items.map((h) => (
          <Entry key={h.id} h={h} showEntity={showEntity} />
        ))}
      </ul>
      {data.total > data.items.length && (
        <button className="btn btn-sm" onClick={() => setLimit((n) => n + 30)}>
          Xem thêm ({data.total - data.items.length})
        </button>
      )}
    </>
  );
}

/** Mục "Lịch sử thay đổi" ở cuối trang chi tiết */
export default function HistorySection({ entity, id, reloadKey }) {
  const [open, setOpen] = useState(true);
  return (
    <Section
      title="Lịch sử thay đổi"
      extra={
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Thu gọn' : 'Mở rộng'}
        </button>
      }
    >
      {open && <HistoryList params={{ entity, entity_id: id }} reloadKey={reloadKey} />}
    </Section>
  );
}
