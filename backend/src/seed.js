// Tạo dữ liệu mẫu. Chạy: npm run seed  (thêm --reset để xoá dữ liệu cũ)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, transaction } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || resolve(here, '../data/pm.db');

// Băm sẵn của mật khẩu mẫu "123456" (PBKDF2-SHA256, 210000 vòng)
export const SAMPLE_PASSWORD = '123456';
const SAMPLE_PASSWORD_HASH =
  'pbkdf2$210000$a1b2c3d4e5f60718293a4b5c6d7e8f90$d7333f09c24a90326229377a950fba2e90cdcd1d992fa14e4ba50faf6e5365a1';

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv');
};

const TABLES = [
  'task_documents',
  'task_links',
  'attachments',
  'test_runs',
  'bugs',
  'test_cases',
  'tasks',
  'meetings',
  'documents',
  'comments',
  'sessions',
  'accounts',
  'history',
  'notification_log',
  'settings',
  'categories',
  'milestones',
  'project_members',
  'members',
  'projects',
];

export function seed(db, { reset = false } = {}) {
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n > 0;
  if (hasData && !reset) {
    console.log('Database đã có dữ liệu. Dùng --reset để xoá và tạo lại.');
    return false;
  }

  transaction(db, () => {
    if (reset) {
      for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
      db.exec('DELETE FROM sqlite_sequence');
    }

    const insert = (table, row) => {
      const cols = Object.keys(row);
      const info = db
        .prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
        .run(...cols.map((c) => row[c]));
      return Number(info.lastInsertRowid);
    };

    // ---------- Dự án ----------
    const pay = insert('projects', {
      code: 'PAY',
      name: 'Cổng thanh toán v2',
      description: 'Thay thế cổng thanh toán cũ, hỗ trợ thẻ nội địa, ví điện tử và thanh toán QR.',
      status: 'active',
      start_date: day(-21),
      end_date: day(70),
    });
    const crm = insert('projects', {
      code: 'CRM',
      name: 'Ứng dụng CRM nội bộ',
      description: 'Quản lý khách hàng, cơ hội bán hàng và lịch chăm sóc cho đội kinh doanh.',
      status: 'planning',
      start_date: day(10),
      end_date: day(120),
    });

    // ---------- Thành viên & vai trò ----------
    const people = {};
    for (const [name, email, position, phone] of [
      ['Nguyễn Văn An', 'an.nguyen@example.com', 'Project Manager', '0901 234 567'],
      ['Trần Thị Bình', 'binh.tran@example.com', 'Business Analyst', '0902 345 678'],
      ['Lê Minh Châu', 'chau.le@example.com', 'Senior Backend Engineer', '0903 456 789'],
      ['Phạm Thu Dung', 'dung.pham@example.com', 'QA Engineer', '0904 567 890'],
      ['Hoàng Gia Huy', 'huy.hoang@example.com', 'Backend Developer', null],
      ['Vũ Ngọc Lan', 'lan.vu@example.com', 'Frontend Developer', null],
      ['Đỗ Quang Minh', 'minh.do@example.com', 'UI/UX Designer', null],
      ['Bùi Thanh Tâm', 'tam.bui@example.com', 'Mobile Developer', null],
    ]) {
      people[name] = insert('members', { name, email, position, phone });
    }
    // Tài khoản đăng nhập mẫu: mật khẩu "123456" (hash tính sẵn, chỉ dùng cho dữ liệu mẫu — hãy đổi khi dùng thật)
    for (const name of Object.keys(people)) {
      insert('accounts', { member_id: people[name], password_hash: SAMPLE_PASSWORD_HASH, is_admin: name === 'Nguyễn Văn An' ? 1 : 0 });
    }

    const join = (project, name, role) =>
      insert('project_members', { project_id: project, member_id: people[name], role, joined_at: day(-21) });
    join(pay, 'Nguyễn Văn An', 'pm');
    join(pay, 'Trần Thị Bình', 'ba');
    join(pay, 'Lê Minh Châu', 'tech_lead');
    join(pay, 'Hoàng Gia Huy', 'developer');
    join(pay, 'Vũ Ngọc Lan', 'developer');
    join(pay, 'Phạm Thu Dung', 'tester');
    join(pay, 'Đỗ Quang Minh', 'designer');
    join(crm, 'Trần Thị Bình', 'pm');
    join(crm, 'Lê Minh Châu', 'tech_lead');
    join(crm, 'Phạm Thu Dung', 'tester');
    join(crm, 'Vũ Ngọc Lan', 'developer');
    join(crm, 'Đỗ Quang Minh', 'designer');

    // ---------- Tài liệu ----------
    const doc = (row) => insert('documents', row);
    const dSrs = doc({
      project_id: pay,
      title: 'Đặc tả yêu cầu phần mềm (SRS) – Cổng thanh toán',
      type: 'specification',
      version: '1.2',
      status: 'approved',
      url: 'https://docs.example.com/pay/srs',
      author: 'Trần Thị Bình',
      description: 'Yêu cầu chức năng và phi chức năng: thanh toán thẻ, OTP, hoàn tiền, đối soát.',
    });
    const dApi = doc({
      project_id: pay,
      title: 'Đặc tả API thanh toán (OpenAPI)',
      type: 'specification',
      version: '0.9',
      status: 'in_review',
      url: 'https://docs.example.com/pay/api',
      author: 'Lê Minh Châu',
      description: 'Endpoint khởi tạo giao dịch, callback, truy vấn trạng thái, mã lỗi.',
    });
    const dArch = doc({
      project_id: pay,
      title: 'Thiết kế kiến trúc hệ thống',
      type: 'design',
      version: '1.0',
      status: 'approved',
      url: 'https://docs.example.com/pay/architecture',
      author: 'Lê Minh Châu',
      description: 'Sơ đồ service, message queue, cơ sở dữ liệu, luồng callback.',
    });
    const dUi = doc({
      project_id: pay,
      title: 'Thiết kế UI màn hình thanh toán & OTP',
      type: 'design',
      version: '2.1',
      status: 'approved',
      url: 'https://www.figma.com/file/example-pay-ui',
      author: 'Đỗ Quang Minh',
    });
    doc({
      project_id: crm,
      title: 'Tài liệu đặc tả nghiệp vụ CRM',
      type: 'specification',
      version: '0.3',
      status: 'draft',
      url: 'https://docs.example.com/crm/brd',
      author: 'Trần Thị Bình',
    });

    // ---------- Cuộc họp ----------
    const m1 = insert('meetings', {
      project_id: pay,
      title: 'Kick-off dự án Cổng thanh toán v2',
      meeting_date: day(-14),
      start_time: '09:00',
      location: 'Phòng họp A3',
      facilitator: 'Nguyễn Văn An',
      attendees: 'Nguyễn Văn An (PM), Trần Thị Bình (BA), Lê Minh Châu (Tech lead), Phạm Thu Dung (QA)',
      agenda: '1. Mục tiêu & phạm vi dự án\n2. Kiến trúc tổng quan\n3. Kế hoạch sprint 1\n4. Phân công',
      notes:
        'Dự án nhằm thay thế cổng thanh toán cũ, hỗ trợ thêm ví điện tử và QR.\nTech lead đề xuất tách service thanh toán riêng, giao tiếp qua message queue.\nQA cần môi trường staging trước khi bắt đầu sprint 2.',
      decisions:
        '- Sprint kéo dài 2 tuần, bắt đầu từ thứ Hai tới\n- Dùng PostgreSQL cho service thanh toán\n- Daily stand-up lúc 9h15',
    });
    const m2 = insert('meetings', {
      project_id: pay,
      title: 'Sprint 1 Review & Retrospective',
      meeting_date: day(-2),
      start_time: '14:00',
      location: 'Google Meet',
      facilitator: 'Nguyễn Văn An',
      attendees: 'Nguyễn Văn An, Trần Thị Bình, Lê Minh Châu, Phạm Thu Dung, Hoàng Gia Huy',
      agenda: '1. Demo tính năng đã hoàn thành\n2. Điều gì tốt / chưa tốt\n3. Hành động cải tiến',
      notes:
        'Demo thành công luồng thanh toán thẻ nội địa.\nCòn 2 bug nghiêm trọng ở màn hình xác nhận OTP.\nTeam thấy việc review code còn chậm.',
      decisions: '- Giới hạn PR tối đa 400 dòng\n- Ưu tiên sửa bug OTP trong tuần này',
    });
    const enc = (text) => new TextEncoder().encode(text);
    const attach = (meeting_id, name, mime_type, text) => {
      const data = enc(text);
      insert('attachments', { meeting_id, name, mime_type, size: data.length, data });
    };
    attach(
      m1,
      'Kickoff-agenda.md',
      'text/markdown',
      '# Kick-off Cổng thanh toán v2\n\n1. Mục tiêu & phạm vi\n2. Kiến trúc tổng quan\n3. Kế hoạch sprint 1\n4. Phân công\n',
    );
    attach(
      m1,
      'Phan-cong-nhan-su.csv',
      'text/csv',
      'Ho ten,Vai tro\nNguyen Van An,PM\nTran Thi Binh,BA\nLe Minh Chau,Tech lead\nPham Thu Dung,QA\n',
    );
    attach(m2, 'Retro-notes.txt', 'text/plain', 'Tot: demo dung han\nChua tot: review code cham\nHanh dong: PR <= 400 dong\n');

    insert('meetings', {
      project_id: pay,
      title: 'Sprint 2 Planning',
      meeting_date: day(3),
      start_time: '09:30',
      location: 'Phòng họp A3',
      facilitator: 'Trần Thị Bình',
      attendees: 'Toàn bộ team',
      agenda: '1. Rà soát backlog\n2. Ước lượng story\n3. Cam kết sprint 2',
    });
    const mCrm = insert('meetings', {
      project_id: crm,
      title: 'Thu thập yêu cầu với phòng Kinh doanh',
      meeting_date: day(1),
      start_time: '10:00',
      location: 'Phòng họp B1',
      facilitator: 'Trần Thị Bình',
      attendees: 'Trần Thị Bình, Lê Minh Châu, đại diện phòng Kinh doanh',
      agenda: '1. Quy trình bán hàng hiện tại\n2. Khó khăn đang gặp\n3. Mong muốn với CRM',
    });

    // ---------- Task ----------
    const t = (row, docs = []) => {
      const id = insert('tasks', row);
      for (const d of docs) insert('task_documents', { task_id: id, document_id: d });
      return id;
    };
    t(
      {
        project_id: pay,
        title: 'Thiết kế kiến trúc service thanh toán',
        description: 'Vẽ sơ đồ kiến trúc, định nghĩa API giữa các service.',
        status: 'released',
        priority: 'high',
        assignee: 'Lê Minh Châu',
        start_date: day(-13),
        due_date: day(-9),
        estimate_hours: 16,
        meeting_id: m1,
        completed_at: `${day(-9)} 10:00:00`,
      },
      [dArch, dSrs],
    );
    const t2 = t(
      {
        project_id: pay,
        title: 'Xây dựng API thanh toán thẻ nội địa',
        description:
          '<p>Tích hợp cổng <strong>NAPAS</strong> cho thanh toán thẻ nội địa.</p>' +
          '<ol><li>Khởi tạo giao dịch</li><li>Nhận callback và cập nhật đơn hàng</li><li>Truy vấn trạng thái giao dịch</li></ol>' +
          '<table><tbody><tr><th><p>Endpoint</p></th><th><p>Mô tả</p></th></tr>' +
          '<tr><td><p>POST /payments</p></td><td><p>Khởi tạo giao dịch</p></td></tr>' +
          '<tr><td><p>POST /payments/callback</p></td><td><p>NAPAS gọi về khi có kết quả</p></td></tr>' +
          '<tr><td><p>GET /payments/:id</p></td><td><p>Truy vấn trạng thái</p></td></tr></tbody></table>',
        status: 'testing',
        priority: 'critical',
        assignee: 'Hoàng Gia Huy',
        start_date: day(-9),
        due_date: day(1),
        estimate_hours: 40,
        meeting_id: m1,
      },
      [dApi, dSrs, dArch],
    );
    const t3 = t(
      {
        project_id: pay,
        title: 'Màn hình nhập & xác nhận OTP',
        status: 'in_progress',
        priority: 'high',
        assignee: 'Vũ Ngọc Lan',
        start_date: day(-7),
        due_date: day(-1),
        estimate_hours: 12,
      },
      [dUi, dSrs],
    );
    const tStaging = t({
      project_id: pay,
      title: 'Chuẩn bị môi trường staging',
      status: 'in_progress',
      priority: 'medium',
      assignee: 'Lê Minh Châu',
      start_date: day(-1),
      due_date: day(5),
      meeting_id: m1,
    });
    t({
      project_id: pay,
      title: 'Áp dụng quy tắc PR tối đa 400 dòng vào CONTRIBUTING.md',
      status: 'todo',
      priority: 'low',
      assignee: 'Nguyễn Văn An',
      start_date: day(2),
      due_date: day(4),
      meeting_id: m2,
    });
    const tRefund = t(
      {
        project_id: pay,
        title: 'Viết test case cho luồng hoàn tiền',
        status: 'todo',
        priority: 'medium',
        assignee: 'Phạm Thu Dung',
        start_date: day(3),
        due_date: day(10),
      },
      [dSrs],
    );
    t({
      project_id: crm,
      title: 'Phỏng vấn người dùng phòng Kinh doanh',
      status: 'todo',
      priority: 'high',
      assignee: 'Trần Thị Bình',
      start_date: day(1),
      due_date: day(7),
      meeting_id: mCrm,
    });
    t({
      project_id: crm,
      title: 'Đề xuất kiến trúc & công nghệ cho CRM',
      status: 'todo',
      priority: 'medium',
      assignee: 'Lê Minh Châu',
      start_date: day(6),
      due_date: day(16),
    });
    t({
      project_id: crm,
      title: 'Wireframe màn hình quản lý khách hàng',
      status: 'todo',
      priority: 'medium',
      assignee: 'Đỗ Quang Minh',
      start_date: day(8),
      due_date: day(18),
    });
    t({
      project_id: crm,
      title: 'Dựng khung dự án frontend CRM',
      status: 'todo',
      priority: 'low',
      assignee: 'Vũ Ngọc Lan',
      start_date: day(12),
      due_date: day(22),
    });
    t({
      project_id: pay,
      title: 'Tối ưu giao diện thanh toán trên di động',
      status: 'todo',
      priority: 'medium',
      assignee: 'Đỗ Quang Minh',
      start_date: day(0),
      due_date: day(6),
    });

    // ---------- Subtask ----------
    for (const [title, status, assignee, offset] of [
      ['Khởi tạo giao dịch NAPAS', 'released', 'Hoàng Gia Huy', -6],
      ['Xử lý callback & cập nhật đơn hàng', 'done_dev', 'Hoàng Gia Huy', -3],
      ['API truy vấn trạng thái giao dịch', 'in_progress', 'Hoàng Gia Huy', 0],
      ['Viết unit test cho service thanh toán', 'todo', 'Hoàng Gia Huy', 1],
    ]) {
      insert('tasks', {
        project_id: pay,
        parent_id: t2,
        title,
        status,
        assignee,
        priority: 'high',
        due_date: day(offset),
        completed_at: status === 'released' ? `${day(offset)} 17:00:00` : null,
      });
    }
    for (const [title, status] of [
      ['Giao diện nhập OTP 6 số', 'released'],
      ['Đếm ngược & gửi lại OTP', 'in_progress'],
      ['Khoá giao dịch sau 3 lần sai', 'todo'],
    ]) {
      insert('tasks', { project_id: pay, parent_id: t3, title, status, assignee: 'Vũ Ngọc Lan', priority: 'high' });
    }

    // ---------- Liên kết task ----------
    const link = (task_id, other_task_id, type) => insert('task_links', { task_id, other_task_id, type });
    link(t3, t2, 'depends_on'); // màn hình OTP phụ thuộc API thanh toán
    link(tRefund, tStaging, 'depends_on'); // viết test hoàn tiền cần staging
    link(tRefund, t2, 'relates');

    // ---------- Test case & kết quả chạy ----------
    const tc = (row) => insert('test_cases', { project_id: pay, ...row });
    const tc1 = tc({
      title: 'Thanh toán thành công bằng thẻ nội địa hợp lệ',
      module: 'Thanh toán',
      type: 'functional',
      priority: 'critical',
      preconditions: 'Tài khoản test có số dư ≥ 100.000đ',
      steps: '1. Chọn sản phẩm, bấm Thanh toán\n2. Chọn "Thẻ nội địa"\n3. Nhập thông tin thẻ hợp lệ\n4. Nhập OTP đúng',
      expected_result: 'Giao dịch thành công, hiển thị mã giao dịch, trừ tiền đúng số tiền.',
      task_id: t2,
    });
    const tc2 = tc({
      title: 'Nhập sai OTP 3 lần thì khoá giao dịch',
      module: 'OTP',
      type: 'functional',
      priority: 'high',
      steps: '1. Khởi tạo giao dịch\n2. Nhập sai OTP 3 lần liên tiếp',
      expected_result: 'Hiển thị thông báo giao dịch bị khoá, không cho nhập tiếp.',
      task_id: t3,
    });
    const tc3 = tc({
      title: 'OTP hết hạn sau 120 giây',
      module: 'OTP',
      type: 'functional',
      priority: 'medium',
      steps: '1. Khởi tạo giao dịch\n2. Chờ 121 giây\n3. Nhập OTP',
      expected_result: 'Báo OTP hết hạn và cho phép gửi lại OTP.',
      task_id: t3,
    });
    const tc4 = tc({
      title: 'API thanh toán phản hồi dưới 500ms với 200 request/giây',
      module: 'Hiệu năng',
      type: 'performance',
      priority: 'medium',
      expected_result: 'p95 < 500ms, không có lỗi 5xx.',
      task_id: t2,
    });
    tc({
      title: 'Không lộ số thẻ đầy đủ trong log',
      module: 'Bảo mật',
      type: 'security',
      priority: 'high',
      steps: '1. Thực hiện 1 giao dịch\n2. Kiểm tra log ứng dụng',
      expected_result: 'Số thẻ được che, chỉ hiện 4 số cuối.',
    });
    tc({
      title: 'Truy vấn trạng thái giao dịch theo mã',
      module: 'Thanh toán',
      type: 'integration',
      priority: 'medium',
      expected_result: 'Trả về đúng trạng thái giao dịch.',
      task_id: t2,
    });

    let minute = 0;
    const run = (id, result, offset, note, by = 'Phạm Thu Dung') => {
      const at = `${day(offset)} 10:${String(10 + minute++).padStart(2, '0')}:00`;
      const runId = insert('test_runs', { test_case_id: id, result, note, executed_by: by, executed_at: at });
      db.prepare('UPDATE test_cases SET status = ?, last_run_at = ? WHERE id = ?').run(result, at, id);
      return runId;
    };
    run(tc1, 'failed', -4, 'Callback không cập nhật trạng thái đơn hàng');
    run(tc1, 'passed', -1, 'Đã fix, chạy lại OK');
    const failedOtp = run(tc2, 'failed', -2, 'Lần thứ 3 vẫn cho nhập tiếp');
    const log = new TextEncoder().encode(
      '[10:12:01] POST /otp/verify attempt=1 -> 401\n[10:12:09] POST /otp/verify attempt=2 -> 401\n' +
        '[10:12:15] POST /otp/verify attempt=3 -> 401\n[10:12:20] POST /otp/verify attempt=4 -> 401  <-- lẽ ra phải bị khoá\n',
    );
    insert('attachments', {
      test_run_id: failedOtp,
      name: 'otp-verify.log',
      mime_type: 'text/plain',
      size: log.length,
      data: log,
    });
    run(tc3, 'blocked', -2, 'Chưa có môi trường staging để chỉnh thời gian OTP');
    run(tc4, 'passed', -1, 'p95 = 320ms');

    // ---------- Bug ----------
    const b = (row) => insert('bugs', { project_id: pay, ...row });
    b({
      title: 'Nhập sai OTP lần 3 không khoá giao dịch',
      description: 'Sau 3 lần nhập sai, người dùng vẫn có thể tiếp tục nhập OTP.',
      steps_to_reproduce: '1. Khởi tạo giao dịch thẻ nội địa\n2. Nhập sai OTP 3 lần',
      expected_result: 'Giao dịch bị khoá',
      actual_result: 'Vẫn cho nhập tiếp lần 4, 5…',
      environment: 'Chrome 130 / Windows 11 / dev',
      severity: 'critical',
      priority: 'high',
      status: 'in_progress',
      assignee: 'Vũ Ngọc Lan',
      reporter: 'Phạm Thu Dung',
      test_case_id: tc2,
      task_id: t3,
    });
    b({
      title: 'Nút "Gửi lại OTP" bị che trên màn hình iPhone SE',
      steps_to_reproduce: '1. Mở trang thanh toán trên iPhone SE\n2. Tới bước nhập OTP',
      expected_result: 'Nút hiển thị đầy đủ',
      actual_result: 'Nút bị bàn phím che, không bấm được',
      environment: 'Safari iOS 18 / iPhone SE',
      severity: 'major',
      priority: 'medium',
      status: 'new',
      reporter: 'Phạm Thu Dung',
      task_id: t3,
    });
    b({
      title: 'Callback NAPAS không cập nhật trạng thái đơn hàng',
      severity: 'blocker',
      priority: 'critical',
      status: 'resolved',
      assignee: 'Hoàng Gia Huy',
      reporter: 'Phạm Thu Dung',
      test_case_id: tc1,
      task_id: t2,
      resolved_at: `${day(-1)} 09:00:00`,
    });
    b({
      title: 'Sai chính tả ở thông báo lỗi "Giao dich that bai"',
      severity: 'minor',
      priority: 'low',
      status: 'new',
      reporter: 'Trần Thị Bình',
    });

    // ---------- Danh mục & phân loại ----------
    const cat = (project_id, name, color, parent_id = null, description = null) =>
      insert('categories', { project_id, name, color, parent_id, description });
    const cCard = cat(pay, 'Thanh toán thẻ', 'blue', null, 'Các luồng thanh toán bằng thẻ');
    const cDomestic = cat(pay, 'Thẻ nội địa (NAPAS)', 'blue', cCard);
    cat(pay, 'Thẻ quốc tế', 'blue', cCard);
    const cOtp = cat(pay, 'Xác thực OTP', 'purple');
    const cInfra = cat(pay, 'Hạ tầng & DevOps', 'gray');
    const cQuality = cat(pay, 'Bảo mật & hiệu năng', 'red');
    const cProcess = cat(pay, 'Quy trình dự án', 'amber');
    const cCustomer = cat(crm, 'Quản lý khách hàng', 'green');
    cat(crm, 'Báo cáo bán hàng', 'amber');
    const cCrmArch = cat(crm, 'Kiến trúc', 'gray');

    const assign = (table, categoryId, ...patterns) => {
      for (const pattern of patterns) {
        db.prepare(`UPDATE ${table} SET category_id = ? WHERE title LIKE ?`).run(categoryId, pattern);
      }
    };
    assign('tasks', cDomestic, 'Xây dựng API thanh toán%', 'Khởi tạo giao dịch NAPAS', 'Xử lý callback%', 'API truy vấn%', 'Viết unit test%');
    assign('tasks', cOtp, 'Màn hình nhập & xác nhận OTP', 'Giao diện nhập OTP%', 'Đếm ngược%', 'Khoá giao dịch sau%');
    assign('tasks', cInfra, 'Thiết kế kiến trúc service%', 'Chuẩn bị môi trường staging');
    assign('tasks', cProcess, 'Áp dụng quy tắc PR%', 'Viết test case cho luồng hoàn tiền');
    assign('tasks', cCard, 'Tối ưu giao diện thanh toán%');
    assign('tasks', cCustomer, 'Phỏng vấn người dùng%', 'Wireframe màn hình quản lý khách hàng', 'Dựng khung dự án frontend CRM');
    assign('tasks', cCrmArch, 'Đề xuất kiến trúc%');
    assign('test_cases', cDomestic, 'Thanh toán thành công%', 'Truy vấn trạng thái%');
    assign('test_cases', cOtp, 'Nhập sai OTP%', 'OTP hết hạn%');
    assign('test_cases', cQuality, 'API thanh toán phản hồi%', 'Không lộ số thẻ%');
    assign('bugs', cOtp, 'Nhập sai OTP%', 'Nút "Gửi lại OTP"%');
    assign('bugs', cDomestic, 'Callback NAPAS%');
    assign('documents', cDomestic, 'Đặc tả API thanh toán%');
    assign('documents', cOtp, 'Thiết kế UI màn hình thanh toán%');
    assign('documents', cInfra, 'Thiết kế kiến trúc hệ thống');
    assign('documents', cCustomer, 'Tài liệu đặc tả nghiệp vụ CRM');

    // ---------- Milestone ----------
    const ms = (project_id, name, start, due, status, description = null) =>
      insert('milestones', {
        project_id,
        name,
        start_date: day(start),
        due_date: day(due),
        status,
        description,
        completed_at: status === 'completed' ? `${day(due)} 17:00:00` : null,
      });
    const msDesign = ms(pay, 'M1 – Chốt thiết kế & kiến trúc', -21, -8, 'completed', 'Hoàn tất SRS, kiến trúc, thiết kế UI');
    const msCard = ms(pay, 'M2 – Thanh toán thẻ nội địa (Sprint 1–2)', -9, 2, 'in_progress', 'Luồng thẻ nội địa + OTP chạy trên staging');
    const msUat = ms(pay, 'M3 – UAT & Go-live', 3, 30, 'planned', 'Kiểm thử chấp nhận với khách hàng và đưa vào vận hành');
    const msCrm = ms(crm, 'Khảo sát yêu cầu', 1, 14, 'planned');
    const setMs = (milestoneId, ...patterns) => {
      for (const p of patterns) db.prepare('UPDATE tasks SET milestone_id = ? WHERE title LIKE ?').run(milestoneId, p);
    };
    setMs(msDesign, 'Thiết kế kiến trúc service%');
    setMs(msCard, 'Xây dựng API thanh toán%', 'Màn hình nhập & xác nhận OTP', 'Chuẩn bị môi trường staging', 'Tối ưu giao diện%');
    setMs(msUat, 'Viết test case cho luồng hoàn tiền');
    setMs(msCrm, 'Phỏng vấn người dùng%', 'Đề xuất kiến trúc%', 'Wireframe màn hình quản lý khách hàng');

    // ---------- Lịch sử mẫu ----------
    const hist = (entity, entity_id, action, summary, changes, actor, offset, time) =>
      insert('history', {
        project_id: pay,
        entity,
        entity_id,
        action,
        summary,
        changes: changes ? JSON.stringify(changes) : null,
        actor,
        created_at: `${day(offset)} ${time}`,
      });
    hist('tasks', t2, 'create', 'Tạo task "Xây dựng API thanh toán thẻ nội địa"', null, 'Nguyễn Văn An', -10, '02:00:00');
    hist('tasks', t2, 'update', null, [{ field: 'status', from: 'todo', to: 'in_progress' }], 'Hoàng Gia Huy', -9, '02:30:00');
    hist('tasks', t2, 'update', null, [{ field: 'status', from: 'in_progress', to: 'testing' }, { field: 'due_date', from: day(-1), to: day(1) }], 'Hoàng Gia Huy', -1, '09:15:00');
    hist('projects', pay, 'member', 'Thêm thành viên "Đỗ Quang Minh" (Designer)', null, 'Nguyễn Văn An', -20, '03:00:00');

    // ---------- Bình luận ----------
    const comment = (entity, entityId, name, body, offset, time, parentId = null) =>
      insert('comments', {
        parent_id: parentId,
        project_id: pay,
        entity,
        entity_id: entityId,
        member_id: people[name],
        author_name: name,
        body,
        created_at: `${day(offset)} ${time}`,
      });
    const c1 = comment('tasks', t2, 'Nguyễn Văn An', 'Huy ước lượng giúp anh phần callback cần thêm bao lâu nhé?', -3, '02:10:00');
    comment('tasks', t2, 'Hoàng Gia Huy', 'Khoảng 1 ngày nữa ạ, em đang chờ NAPAS cấp môi trường sandbox.', -3, '02:45:00', c1);
    comment('tasks', t2, 'Nguyễn Văn An', '@Hoàng Gia Huy Ok em, có sandbox thì báo anh nhé.', -3, '03:05:00', c1);
    comment('tasks', t2, 'Phạm Thu Dung', 'Bên QA đã sẵn test case TC-001, khi nào lên staging em test ngay.', -1, '08:30:00');
    comment('tasks', t3, 'Vũ Ngọc Lan', 'Màn hình OTP đang chờ API của Huy merge xong.', -1, '03:00:00');
    comment('bugs', 1, 'Phạm Thu Dung', 'Đã tái hiện được trên Chrome và Safari, đính kèm video ở lần chạy test.', -2, '04:00:00');
    const cb = db.prepare("SELECT id FROM comments WHERE entity = 'bugs' AND entity_id = 1").get().id;
    comment('bugs', 1, 'Vũ Ngọc Lan', 'Em đã tìm ra nguyên nhân: bộ đếm sai bị reset khi gửi lại OTP. Đang sửa.', -1, '07:20:00', cb);

    // ---------- File đính kèm của tài liệu ----------
    const docFile = (document_id, name, mime_type, text) => {
      const data = new TextEncoder().encode(text);
      insert('attachments', { document_id, name, mime_type, size: data.length, data });
    };
    docFile(dSrs, 'SRS-cong-thanh-toan-v1.2.md', 'text/markdown', '# SRS – Cổng thanh toán v1.2\n\n1. Phạm vi\n2. Yêu cầu chức năng\n3. Yêu cầu phi chức năng\n');
    docFile(dApi, 'payment-api.yaml', 'application/x-yaml', 'openapi: 3.0.0\ninfo:\n  title: Payment API\n  version: 1.0.0\n');

    // ---------- Người tạo & người yêu cầu ----------
    db.prepare("UPDATE tasks SET created_by = 'Nguyễn Văn An', requester = 'Trần Thị Bình' WHERE project_id = ?").run(pay);
    db.prepare("UPDATE tasks SET created_by = 'Trần Thị Bình', requester = 'Phòng Kinh doanh' WHERE project_id = ?").run(crm);
    db.prepare("UPDATE tasks SET created_by = 'Hoàng Gia Huy' WHERE parent_id IS NOT NULL").run();
    db.prepare("UPDATE tasks SET requester = 'Lê Minh Châu' WHERE title LIKE 'Chuẩn bị môi trường%'").run();
    db.prepare("UPDATE test_cases SET created_by = 'Phạm Thu Dung'").run();
    db.prepare('UPDATE bugs SET created_by = reporter').run();
    db.prepare('UPDATE documents SET created_by = author').run();
    db.prepare('UPDATE meetings SET created_by = facilitator').run();
  });

  console.log('Đã tạo dữ liệu mẫu.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDb(DB_FILE);
  seed(db, { reset: process.argv.includes('--reset') });
  db.close();
}
