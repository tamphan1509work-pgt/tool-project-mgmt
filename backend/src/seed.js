// Tạo dữ liệu mẫu. Chạy: npm run seed  (thêm --reset để xoá dữ liệu cũ)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, transaction } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || resolve(here, '../data/pm.db');

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv');
};

export function seed(db, { reset = false } = {}) {
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM meetings').get().n > 0;
  if (hasData && !reset) {
    console.log('Database đã có dữ liệu. Dùng --reset để xoá và tạo lại.');
    return false;
  }

  transaction(db, () => {
    if (reset) {
      for (const t of ['test_runs', 'bugs', 'test_cases', 'tasks', 'meetings']) db.exec(`DELETE FROM ${t}`);
      db.exec('DELETE FROM sqlite_sequence');
    }

    const insert = (table, row) => {
      const cols = Object.keys(row);
      const info = db
        .prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
        .run(...cols.map((c) => row[c]));
      return Number(info.lastInsertRowid);
    };

    const m1 = insert('meetings', {
      title: 'Kick-off dự án Cổng thanh toán v2',
      meeting_date: day(-14),
      start_time: '09:00',
      location: 'Phòng họp A3',
      facilitator: 'Nguyễn Văn An',
      attendees: 'Nguyễn Văn An (PM), Trần Thị Bình (BA), Lê Minh Châu (Dev lead), Phạm Thu Dung (QA)',
      agenda: '1. Mục tiêu & phạm vi dự án\n2. Kiến trúc tổng quan\n3. Kế hoạch sprint 1\n4. Phân công',
      notes:
        'Dự án nhằm thay thế cổng thanh toán cũ, hỗ trợ thêm ví điện tử và QR.\nDev lead đề xuất tách service thanh toán riêng, giao tiếp qua message queue.\nQA cần môi trường staging trước khi bắt đầu sprint 2.',
      decisions:
        '- Sprint kéo dài 2 tuần, bắt đầu từ thứ Hai tới\n- Dùng PostgreSQL cho service thanh toán\n- Daily stand-up lúc 9h15',
    });
    const m2 = insert('meetings', {
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
    insert('meetings', {
      title: 'Sprint 2 Planning',
      meeting_date: day(3),
      start_time: '09:30',
      location: 'Phòng họp A3',
      facilitator: 'Trần Thị Bình',
      attendees: 'Toàn bộ team',
      agenda: '1. Rà soát backlog\n2. Ước lượng story\n3. Cam kết sprint 2',
    });

    const t = (row) => insert('tasks', row);
    const t1 = t({
      title: 'Thiết kế kiến trúc service thanh toán',
      description: 'Vẽ sơ đồ kiến trúc, định nghĩa API giữa các service.',
      status: 'done',
      priority: 'high',
      assignee: 'Lê Minh Châu',
      start_date: day(-13),
      due_date: day(-9),
      estimate_hours: 16,
      meeting_id: m1,
      completed_at: `${day(-9)} 10:00:00`,
    });
    const t2 = t({
      title: 'Xây dựng API thanh toán thẻ nội địa',
      description: 'Tích hợp cổng NAPAS: khởi tạo giao dịch, callback, truy vấn trạng thái.',
      status: 'review',
      priority: 'critical',
      assignee: 'Hoàng Gia Huy',
      start_date: day(-9),
      due_date: day(1),
      estimate_hours: 40,
      meeting_id: m1,
    });
    const t3 = t({
      title: 'Màn hình nhập & xác nhận OTP',
      status: 'in_progress',
      priority: 'high',
      assignee: 'Vũ Ngọc Lan',
      start_date: day(-7),
      due_date: day(-1),
      estimate_hours: 12,
    });
    t({
      title: 'Chuẩn bị môi trường staging',
      status: 'todo',
      priority: 'medium',
      assignee: 'Lê Minh Châu',
      due_date: day(5),
      meeting_id: m1,
    });
    t({
      title: 'Áp dụng quy tắc PR tối đa 400 dòng vào CONTRIBUTING.md',
      status: 'todo',
      priority: 'low',
      assignee: 'Nguyễn Văn An',
      due_date: day(4),
      meeting_id: m2,
    });
    t({
      title: 'Viết test case cho luồng hoàn tiền',
      status: 'todo',
      priority: 'medium',
      assignee: 'Phạm Thu Dung',
      due_date: day(8),
    });

    const tc = (row) => insert('test_cases', row);
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
      module: 'Thanh toán',
      type: 'functional',
      priority: 'high',
      steps: '1. Khởi tạo giao dịch\n2. Nhập sai OTP 3 lần liên tiếp',
      expected_result: 'Hiển thị thông báo giao dịch bị khoá, không cho nhập tiếp.',
      task_id: t3,
    });
    const tc3 = tc({
      title: 'OTP hết hạn sau 120 giây',
      module: 'Thanh toán',
      type: 'functional',
      priority: 'medium',
      steps: '1. Khởi tạo giao dịch\n2. Chờ 121 giây\n3. Nhập OTP',
      expected_result: 'Báo OTP hết hạn và cho phép gửi lại OTP.',
      task_id: t3,
    });
    tc({
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

    const run = (id, result, offset, note, by = 'Phạm Thu Dung') => {
      const at = `${day(offset)} 10:${String(30 + offset + 20).padStart(2, '0')}:00`;
      insert('test_runs', { test_case_id: id, result, note, executed_by: by, executed_at: at });
      db.prepare('UPDATE test_cases SET status = ?, last_run_at = ? WHERE id = ?').run(result, at, id);
    };
    run(tc1, 'failed', -4, 'Callback không cập nhật trạng thái đơn hàng');
    run(tc1, 'passed', -1, 'Đã fix, chạy lại OK');
    run(tc2, 'failed', -2, 'Lần thứ 3 vẫn cho nhập tiếp');
    run(tc3, 'blocked', -2, 'Chưa có môi trường staging để chỉnh thời gian OTP');

    const b = (row) => insert('bugs', row);
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
  });

  console.log('Đã tạo dữ liệu mẫu.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDb(DB_FILE);
  seed(db, { reset: process.argv.includes('--reset') });
  db.close();
}
