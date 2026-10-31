// Nhãn hiển thị & màu cho các giá trị enum
export const LABELS = {
  priority: {
    low: ['Thấp', 'gray'],
    medium: ['Trung bình', 'blue'],
    high: ['Cao', 'amber'],
    critical: ['Khẩn cấp', 'red'],
  },
  taskStatus: {
    todo: ['Cần làm', 'gray'],
    in_progress: ['Đang làm', 'blue'],
    review: ['Đang review', 'purple'],
    done: ['Hoàn thành', 'green'],
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
export const label = (kind, value) => LABELS[kind]?.[value]?.[0] ?? value ?? '';

export const PREFIX = { meetings: 'MTG', tasks: 'TASK', 'test-cases': 'TC', bugs: 'BUG' };
export const code = (resource, id) => `${PREFIX[resource]}-${String(id).padStart(3, '0')}`;

/** "2026-01-05" -> "05/01/2026" */
export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Thời điểm UTC từ SQLite ("YYYY-MM-DD HH:MM:SS") -> giờ địa phương */
export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export const todayStr = () => new Date().toLocaleDateString('sv');

export const isOverdue = (task) => task.due_date && task.status !== 'done' && task.due_date < todayStr();
