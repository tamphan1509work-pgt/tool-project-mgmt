import CategoryBadge from '../components/CategoryBadge.jsx';
import { categoryFilter } from '../categories.js';
import { Link } from 'react-router-dom';
import DetailPage, { InfoList, Section } from '../components/DetailPage.jsx';
import ResourceList from '../components/ResourceList.jsx';
import { Badge, Prose } from '../components/ui.jsx';
import { code, fmtDateTime, options } from '../constants.js';
import { bugFields } from '../forms.js';

// Các bước chuyển trạng thái gợi ý theo quy trình xử lý bug
const TRANSITIONS = {
  new: [
    ['in_progress', 'Bắt đầu xử lý'],
    ['rejected', 'Từ chối'],
  ],
  in_progress: [['resolved', 'Đánh dấu đã sửa']],
  resolved: [
    ['closed', 'Xác nhận & đóng'],
    ['reopened', 'Mở lại'],
  ],
  reopened: [['in_progress', 'Bắt đầu xử lý']],
  closed: [['reopened', 'Mở lại']],
  rejected: [['reopened', 'Mở lại']],
};

export function BugList() {
  return (
    <ResourceList
      resource="bugs"
      noun="bug"
      formFields={bugFields}
      searchPlaceholder="Tìm theo tiêu đề, mô tả, môi trường, người…"
      filters={[
        { name: 'status', label: 'Trạng thái', options: options('bugStatus') },
        { name: 'severity', label: 'Mức độ', options: options('bugSeverity') },
        { name: 'priority', label: 'Ưu tiên', options: options('priority') },
        { name: 'assignee', label: 'Người xử lý', source: 'people' },
        categoryFilter,
        { name: 'open', label: 'Chỉ bug đang mở', type: 'toggle' },
      ]}
      columns={[
        { key: 'title', title: 'Tiêu đề', sort: 'title', render: (b) => <strong>{b.title}</strong> },
        {
          key: 'severity',
          title: 'Mức độ',
          sort: 'severity',
          width: 130,
          render: (b) => <Badge kind="bugSeverity" value={b.severity} />,
        },
        {
          key: 'priority',
          title: 'Ưu tiên',
          sort: 'priority',
          width: 120,
          render: (b) => <Badge kind="priority" value={b.priority} />,
        },
        {
          key: 'status',
          title: 'Trạng thái',
          sort: 'status',
          width: 120,
          render: (b) => <Badge kind="bugStatus" value={b.status} />,
        },
        { key: 'category_id', title: 'Danh mục', width: 150, render: (r) => <CategoryBadge id={r.category_id} /> },
        {
          key: 'assignee',
          title: 'Người xử lý',
          width: 150,
          render: (b) => b.assignee || <span className="muted">Chưa giao</span>,
        },
        {
          key: 'created_at',
          title: 'Ngày tạo',
          sort: 'created_at',
          width: 130,
          className: 'muted small',
          render: (b) => fmtDateTime(b.created_at),
        },
      ]}
    />
  );
}

export function BugDetail() {
  return (
    <DetailPage
      resource="bugs"
      backLabel="Danh sách bug"
      formFields={bugFields}
      badges={(b) => (
        <>
          <Badge kind="bugStatus" value={b.status} />
          <Badge kind="bugSeverity" value={b.severity} />
          <Badge kind="priority" value={b.priority} />
        </>
      )}
      actions={(b, { update }) =>
        TRANSITIONS[b.status]?.map(([status, text]) => (
          <button key={status} className="btn btn-primary-ghost" onClick={() => update({ status }, text)}>
            {text}
          </button>
        ))
      }
    >
      {(b) => (
        <div className="detail-grid">
          <div className="detail-main">
            <Section title="Mô tả">
              <Prose text={b.description} />
            </Section>
            <Section title="Các bước tái hiện">
              <Prose text={b.steps_to_reproduce} />
            </Section>
            <div className="two-col">
              <Section title="Kết quả mong đợi">
                <Prose text={b.expected_result} />
              </Section>
              <Section title="Kết quả thực tế">
                <Prose text={b.actual_result} />
              </Section>
            </div>
          </div>
          <aside className="detail-side">
            <Section title="Thông tin">
              <InfoList
                items={[
                  ['Danh mục', <CategoryBadge key="c" id={b.category_id} full />],
                  ['Người xử lý', b.assignee],
                  ['Người báo cáo', b.reporter],
                  ['Môi trường', b.environment],
                  ['Đã sửa lúc', fmtDateTime(b.resolved_at)],
                  [
                    'Test case',
                    b.test_case && (
                      <Link to={`/test-cases/${b.test_case.id}`}>
                        {code('test-cases', b.test_case.id)} · {b.test_case.title}
                      </Link>
                    ),
                  ],
                  [
                    'Task',
                    b.task && (
                      <Link to={`/tasks/${b.task.id}`}>
                        {code('tasks', b.task.id)} · {b.task.title}
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
