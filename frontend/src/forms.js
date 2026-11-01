import { CATEGORY_COLORS } from './categories.js';
import { options, todayStr } from './constants.js';

export const meetingFields = [
  { name: 'title', label: 'Tiêu đề cuộc họp', required: true, full: true },
  { name: 'meeting_date', label: 'Ngày họp', type: 'date', required: true, default: todayStr() },
  { name: 'start_time', label: 'Giờ bắt đầu', type: 'time' },
  { name: 'location', label: 'Địa điểm / Link họp' },
  { name: 'facilitator', label: 'Người chủ trì', type: 'person' },
  {
    name: 'attendees',
    label: 'Thành phần tham dự',
    type: 'textarea',
    rows: 2,
    placeholder: 'Mỗi người cách nhau dấu phẩy',
  },
  { name: 'agenda', label: 'Nội dung / Agenda', type: 'textarea', rows: 4 },
  { name: 'notes', label: 'Biên bản (nội dung thảo luận)', type: 'textarea', rows: 8 },
  { name: 'decisions', label: 'Quyết định / Kết luận', type: 'textarea', rows: 4 },
  {
    name: 'files',
    label: 'Tệp đính kèm',
    type: 'files',
    hint: 'File được tải lên sau khi lưu biên bản. File đã đính kèm xem ở trang chi tiết.',
  },
];

export const taskFields = [
  { name: 'title', label: 'Tên task', required: true, full: true },
  {
    name: 'status',
    label: 'Trạng thái',
    type: 'select',
    options: options('taskStatus'),
    required: true,
    default: 'todo',
  },
  {
    name: 'priority',
    label: 'Độ ưu tiên',
    type: 'select',
    options: options('priority'),
    required: true,
    default: 'medium',
  },
  { name: 'assignee', label: 'PIC (người phụ trách)', type: 'person' },
  { name: 'requester', label: 'Người yêu cầu', type: 'person' },
  { name: 'category_id', label: 'Danh mục', type: 'category' },
  { name: 'estimate_hours', label: 'Ước lượng (giờ)', type: 'number' },
  { name: 'start_date', label: 'Ngày bắt đầu', type: 'date' },
  { name: 'due_date', label: 'Hạn hoàn thành', type: 'date' },
  { name: 'milestone_id', label: 'Milestone', type: 'ref', source: 'milestones' },
  { name: 'meeting_id', label: 'Từ cuộc họp', type: 'ref', source: 'meetings' },
  {
    name: 'parent_id',
    label: 'Là subtask của (task cha)',
    type: 'ref',
    source: 'tasks',
    // chỉ task cấp cao nhất mới làm task cha được, và không chọn chính nó
    filter: (t, record) => !t.parent_id && t.id !== record?.id,
  },
  {
    name: 'document_ids',
    label: 'Tài liệu liên quan (thiết kế, đặc tả)',
    type: 'documents',
    hint: 'Chọn từ các tài liệu của dự án trong mục Tài liệu.',
  },
  {
    name: 'description',
    label: 'Mô tả',
    type: 'richtext',
    placeholder: 'Mô tả chi tiết task: yêu cầu, tiêu chí hoàn thành, ảnh minh hoạ, bảng…',
  },
];

export const testCaseFields = [
  { name: 'title', label: 'Tên test case', required: true, full: true },
  { name: 'module', label: 'Module / Chức năng', type: 'module' },
  { name: 'category_id', label: 'Danh mục', type: 'category' },
  {
    name: 'type',
    label: 'Loại test',
    type: 'select',
    options: options('testType'),
    required: true,
    default: 'functional',
  },
  {
    name: 'priority',
    label: 'Độ ưu tiên',
    type: 'select',
    options: options('priority'),
    required: true,
    default: 'medium',
  },
  { name: 'task_id', label: 'Task liên quan', type: 'ref', source: 'tasks' },
  { name: 'preconditions', label: 'Điều kiện tiên quyết', type: 'textarea', rows: 2 },
  { name: 'steps', label: 'Các bước thực hiện', type: 'textarea', rows: 6, placeholder: '1. ...\n2. ...' },
  { name: 'expected_result', label: 'Kết quả mong đợi', type: 'textarea', rows: 3 },
];

export const bugFields = [
  { name: 'title', label: 'Tiêu đề bug', required: true, full: true },
  {
    name: 'severity',
    label: 'Mức độ nghiêm trọng',
    type: 'select',
    options: options('bugSeverity'),
    required: true,
    default: 'major',
  },
  {
    name: 'priority',
    label: 'Độ ưu tiên',
    type: 'select',
    options: options('priority'),
    required: true,
    default: 'medium',
  },
  {
    name: 'status',
    label: 'Trạng thái',
    type: 'select',
    options: options('bugStatus'),
    required: true,
    default: 'new',
  },
  { name: 'environment', label: 'Môi trường', placeholder: 'VD: Chrome 130 / Windows 11 / staging' },
  { name: 'category_id', label: 'Danh mục', type: 'category' },
  { name: 'assignee', label: 'Người xử lý', type: 'person' },
  { name: 'reporter', label: 'Người báo bug', type: 'person' },
  { name: 'test_case_id', label: 'Test case liên quan', type: 'ref', source: 'testCases' },
  { name: 'task_id', label: 'Task liên quan', type: 'ref', source: 'tasks' },
  { name: 'description', label: 'Mô tả', type: 'textarea', rows: 3 },
  { name: 'steps_to_reproduce', label: 'Các bước tái hiện', type: 'textarea', rows: 4, placeholder: '1. ...\n2. ...' },
  { name: 'expected_result', label: 'Kết quả mong đợi', type: 'textarea', rows: 2 },
  { name: 'actual_result', label: 'Kết quả thực tế', type: 'textarea', rows: 2 },
];

export const projectFields = [
  {
    name: 'code',
    label: 'Mã dự án',
    required: true,
    placeholder: 'VD: PAY, CRM',
    hint: '2–12 ký tự, chữ in hoa, số, - hoặc _',
  },
  { name: 'name', label: 'Tên dự án', required: true },
  {
    name: 'status',
    label: 'Trạng thái',
    type: 'select',
    options: options('projectStatus'),
    required: true,
    default: 'active',
  },
  { name: 'start_date', label: 'Ngày bắt đầu', type: 'date' },
  { name: 'end_date', label: 'Ngày kết thúc dự kiến', type: 'date' },
  { name: 'description', label: 'Mô tả', type: 'textarea', rows: 4 },
];

export const documentFields = [
  { name: 'title', label: 'Tên tài liệu', required: true, full: true },
  {
    name: 'type',
    label: 'Loại tài liệu',
    type: 'select',
    options: options('documentType'),
    required: true,
    default: 'specification',
  },
  {
    name: 'status',
    label: 'Trạng thái',
    type: 'select',
    options: options('documentStatus'),
    required: true,
    default: 'draft',
  },
  { name: 'version', label: 'Phiên bản', placeholder: 'VD: 1.0' },
  { name: 'category_id', label: 'Danh mục', type: 'category' },
  { name: 'author', label: 'Người soạn', type: 'person' },
  {
    name: 'url',
    label: 'Link tài liệu',
    type: 'url',
    full: true,
    placeholder: 'https://… (Google Drive, Figma, Confluence…)',
  },
  { name: 'description', label: 'Mô tả / Tóm tắt nội dung', type: 'textarea', rows: 4 },
];

export const memberFields = [
  { name: 'name', label: 'Họ tên', required: true },
  { name: 'position', label: 'Chức danh', placeholder: 'VD: Backend Developer' },
  { name: 'email', label: 'Email', placeholder: 'ten@congty.com' },
  { name: 'phone', label: 'Số điện thoại' },
  {
    name: 'email_notifications',
    label: 'Email nhắc deadline',
    type: 'checkbox',
    checkboxLabel: 'Nhận email nhắc task / milestone trễ hoặc sắp đến hạn',
    default: 1,
    full: true,
  },
];

export const categoryFields = [
  { name: 'name', label: 'Tên danh mục', required: true },
  {
    name: 'parent_id',
    label: 'Thuộc danh mục (danh mục cha)',
    type: 'category',
    excludeSelf: true,
    emptyLabel: '— Không có (danh mục gốc) —',
  },
  { name: 'color', label: 'Màu nhãn', type: 'select', options: CATEGORY_COLORS, required: true, default: 'blue' },
  { name: 'description', label: 'Mô tả', type: 'textarea', rows: 3 },
];

export const milestoneFields = [
  { name: 'name', label: 'Tên milestone', required: true, full: true },
  { name: 'start_date', label: 'Ngày bắt đầu', type: 'date' },
  { name: 'due_date', label: 'Hạn hoàn thành', type: 'date', required: true },
  {
    name: 'status',
    label: 'Trạng thái',
    type: 'select',
    options: options('milestoneStatus'),
    required: true,
    default: 'planned',
  },
  { name: 'description', label: 'Mục tiêu / Mô tả', type: 'textarea', rows: 3 },
];
