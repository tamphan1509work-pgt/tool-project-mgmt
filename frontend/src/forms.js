import { options, todayStr } from './constants.js';

export const meetingFields = [
  { name: 'title', label: 'Tiêu đề cuộc họp', required: true, full: true },
  { name: 'meeting_date', label: 'Ngày họp', type: 'date', required: true, default: todayStr() },
  { name: 'start_time', label: 'Giờ bắt đầu', type: 'time' },
  { name: 'location', label: 'Địa điểm / Link họp' },
  { name: 'facilitator', label: 'Người chủ trì', type: 'person' },
  { name: 'attendees', label: 'Thành phần tham dự', type: 'textarea', rows: 2, placeholder: 'Mỗi người cách nhau dấu phẩy' },
  { name: 'agenda', label: 'Nội dung / Agenda', type: 'textarea', rows: 4 },
  { name: 'notes', label: 'Biên bản (nội dung thảo luận)', type: 'textarea', rows: 8 },
  { name: 'decisions', label: 'Quyết định / Kết luận', type: 'textarea', rows: 4 },
];

export const taskFields = [
  { name: 'title', label: 'Tên task', required: true, full: true },
  { name: 'status', label: 'Trạng thái', type: 'select', options: options('taskStatus'), required: true, default: 'todo' },
  { name: 'priority', label: 'Độ ưu tiên', type: 'select', options: options('priority'), required: true, default: 'medium' },
  { name: 'assignee', label: 'Người thực hiện', type: 'person' },
  { name: 'estimate_hours', label: 'Ước lượng (giờ)', type: 'number' },
  { name: 'start_date', label: 'Ngày bắt đầu', type: 'date' },
  { name: 'due_date', label: 'Hạn hoàn thành', type: 'date' },
  { name: 'meeting_id', label: 'Từ cuộc họp', type: 'ref', source: 'meetings', full: true },
  { name: 'description', label: 'Mô tả', type: 'textarea', rows: 5 },
];

export const testCaseFields = [
  { name: 'title', label: 'Tên test case', required: true, full: true },
  { name: 'module', label: 'Module / Chức năng', type: 'module' },
  { name: 'type', label: 'Loại test', type: 'select', options: options('testType'), required: true, default: 'functional' },
  { name: 'priority', label: 'Độ ưu tiên', type: 'select', options: options('priority'), required: true, default: 'medium' },
  { name: 'task_id', label: 'Task liên quan', type: 'ref', source: 'tasks' },
  { name: 'preconditions', label: 'Điều kiện tiên quyết', type: 'textarea', rows: 2 },
  { name: 'steps', label: 'Các bước thực hiện', type: 'textarea', rows: 6, placeholder: '1. ...\n2. ...' },
  { name: 'expected_result', label: 'Kết quả mong đợi', type: 'textarea', rows: 3 },
];

export const bugFields = [
  { name: 'title', label: 'Tiêu đề bug', required: true, full: true },
  { name: 'severity', label: 'Mức độ nghiêm trọng', type: 'select', options: options('bugSeverity'), required: true, default: 'major' },
  { name: 'priority', label: 'Độ ưu tiên', type: 'select', options: options('priority'), required: true, default: 'medium' },
  { name: 'status', label: 'Trạng thái', type: 'select', options: options('bugStatus'), required: true, default: 'new' },
  { name: 'environment', label: 'Môi trường', placeholder: 'VD: Chrome 130 / Windows 11 / staging' },
  { name: 'assignee', label: 'Người xử lý', type: 'person' },
  { name: 'reporter', label: 'Người báo cáo', type: 'person' },
  { name: 'test_case_id', label: 'Test case liên quan', type: 'ref', source: 'testCases' },
  { name: 'task_id', label: 'Task liên quan', type: 'ref', source: 'tasks' },
  { name: 'description', label: 'Mô tả', type: 'textarea', rows: 3 },
  { name: 'steps_to_reproduce', label: 'Các bước tái hiện', type: 'textarea', rows: 4, placeholder: '1. ...\n2. ...' },
  { name: 'expected_result', label: 'Kết quả mong đợi', type: 'textarea', rows: 2 },
  { name: 'actual_result', label: 'Kết quả thực tế', type: 'textarea', rows: 2 },
];
