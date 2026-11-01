// Nhãn hiển thị & màu cho các giá trị enum
export const LABELS = {
  priority: {
    low: ['Thấp', 'gray'],
    medium: ['Trung bình', 'blue'],
    high: ['Cao', 'amber'],
    critical: ['Khẩn cấp', 'red'],
  },
  taskStatus: {
    todo: ['To Do', 'gray'],
    in_progress: ['In Progress', 'blue'],
    done_dev: ['Done Dev', 'purple'],
    testing: ['Testing', 'amber'],
    ready_release: ['Ready Release', 'teal'],
    released: ['Released', 'green'],
    canceled: ['Canceled', 'red'],
  },
  testType: {
    functional: ['Chức năng', 'gray'],
    integration: ['Tích hợp', 'gray'],
    regression: ['Hồi quy', 'gray'],
    smoke: ['Smoke', 'gray'],
    performance: ['Hiệu năng', 'gray'],
    security: ['Bảo mật', 'gray'],
    ui: ['Giao diện', 'gray'],
  },
  testStatus: {
    not_run: ['Chưa chạy', 'gray'],
    passed: ['Đạt', 'green'],
    failed: ['Không đạt', 'red'],
    blocked: ['Bị chặn', 'amber'],
  },
  bugSeverity: {
    minor: ['Nhẹ', 'gray'],
    major: ['Nặng', 'amber'],
    critical: ['Nghiêm trọng', 'red'],
    blocker: ['Blocker', 'darkred'],
  },
  projectStatus: {
    planning: ['Lên kế hoạch', 'blue'],
    active: ['Đang triển khai', 'green'],
    on_hold: ['Tạm dừng', 'amber'],
    completed: ['Hoàn thành', 'gray'],
    cancelled: ['Đã huỷ', 'red'],
  },
  memberRole: {
    pm: ['Quản lý dự án (PM)', 'purple'],
    ba: ['Phân tích nghiệp vụ (BA)', 'blue'],
    tech_lead: ['Trưởng nhóm kỹ thuật', 'purple'],
    developer: ['Lập trình viên', 'gray'],
    tester: ['Kiểm thử (QA/Tester)', 'amber'],
    designer: ['Thiết kế UI/UX', 'green'],
    devops: ['DevOps', 'gray'],
    stakeholder: ['Khách hàng / Stakeholder', 'gray'],
  },
  documentType: {
    design: ['Thiết kế', 'purple'],
    specification: ['Tài liệu đặc tả', 'blue'],
  },
  documentStatus: {
    draft: ['Bản nháp', 'gray'],
    in_review: ['Đang review', 'amber'],
    approved: ['Đã duyệt', 'green'],
    obsolete: ['Hết hiệu lực', 'red'],
  },
  milestoneStatus: {
    planned: ['Kế hoạch', 'gray'],
    in_progress: ['Đang thực hiện', 'blue'],
    completed: ['Hoàn thành', 'green'],
    cancelled: ['Đã huỷ', 'red'],
  },
  bugStatus: {
    new: ['Mới', 'blue'],
    in_progress: ['Đang xử lý', 'purple'],
    resolved: ['Đã sửa', 'green'],
    closed: ['Đã đóng', 'gray'],
    reopened: ['Mở lại', 'red'],
    rejected: ['Từ chối', 'gray'],
  },
};

export const options = (kind) => Object.entries(LABELS[kind]).map(([value, [label]]) => ({ value, label }));
// Nhãn của trạng thái task cũ (chỉ còn xuất hiện trong lịch sử thay đổi)
const LEGACY = { taskStatus: { review: 'Đang review (cũ)', done: 'Hoàn thành (cũ)' } };
export const label = (kind, value) => LABELS[kind]?.[value]?.[0] ?? LEGACY[kind]?.[value] ?? value ?? '';

export const PREFIX = {
  meetings: 'MTG',
  tasks: 'TASK',
  'test-cases': 'TC',
  bugs: 'BUG',
  documents: 'DOC',
  members: 'MEM',
  milestones: 'MS',
};
export const code = (resource, id) =>
  resource === 'projects' ? `#${id}` : `${PREFIX[resource]}-${String(id).padStart(3, '0')}`;

/** "2026-01-05" -> "05/01/2026" */
export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Thời điểm UTC từ SQLite ("YYYY-MM-DD HH:MM:SS") -> giờ địa phương dạng dd/mm/yyyy hh:mm:ss */
export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(s) ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return s;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const todayStr = () => new Date().toLocaleDateString('sv');

/** Task đã đóng (Released / Canceled): không còn tính trễ hạn, tính là xong trong tiến độ */
export const CLOSED_TASK_STATUSES = ['released', 'canceled'];
export const isClosed = (status) => CLOSED_TASK_STATUSES.includes(status);

export const isOverdue = (task) => task.due_date && !isClosed(task.status) && task.due_date < todayStr();
