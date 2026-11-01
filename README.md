# Project Hub – Quản lý dự án phần mềm

Ứng dụng web quản lý **nhiều dự án** phần mềm. Mỗi dự án có thành viên với vai trò riêng, và toàn bộ dữ liệu bên dưới được quản lý theo dự án:

| Phân hệ | Chức năng |
|---|---|
| **Dự án & thành viên** | Danh sách dự án (mã, tên, trạng thái, thời gian), số task/bug đang mở. Trong từng dự án: thêm thành viên (chọn người có sẵn hoặc tạo mới), gán **vai trò trong dự án** (PM, BA, Tech lead, Developer, Tester, Designer, DevOps, Stakeholder), đổi vai trò, gỡ thành viên. Một người có thể tham gia nhiều dự án với vai trò khác nhau |
| **Thành viên** | Danh bạ thành viên dùng chung (họ tên, chức danh, email, điện thoại), số dự án tham gia, số task đang làm / quá hạn. Trang chi tiết: dự án và vai trò, task được giao. **Biểu đồ Gantt**: mỗi thành viên → các dự án đang tham gia (kèm vai trò, thời gian dự án) → các task đang làm (từ ngày bắt đầu tới hạn), có vạch "Hôm nay", lọc theo dự án / thành viên, thu phóng Ngày / Tuần / Tháng, ẩn/hiện task đã xong |
| **Meeting minutes** | Biên bản họp (agenda, nội dung, quyết định, thành phần), **đính kèm file** ngay khi tạo / sửa biên bản hoặc tại trang chi tiết (kéo thả, tối đa 10 MB/file, xem trước ảnh & file văn bản, tải về), tạo **action item** thành task ngay trong biên bản, in / xuất PDF |
| **Task** | Dạng bảng hoặc **Kanban kéo-thả**, ưu tiên, người thực hiện, hạn, cảnh báo quá hạn, liên kết cuộc họp. **Tài liệu liên quan** chọn từ mục Tài liệu (thêm / gỡ ngay trên trang task). **Subtask** (1 cấp) với thanh tiến độ, đánh dấu xong nhanh. **Task liên quan / phụ thuộc**: *phụ thuộc vào*, *đang chặn*, *liên quan*, cảnh báo khi task đang chờ task khác, chặn phụ thuộc vòng tròn |
| **Test report** | Hai tab: **Danh sách test case** và **Thống kê** (tỉ lệ đạt, tiến độ thực thi, tổng hợp theo module / độ ưu tiên / loại test / người thực hiện, các lần chạy gần đây); danh sách test case, **thực thi test** (Đạt / Không đạt / Bị chặn) kèm **file bằng chứng** (ảnh chụp màn hình, log…), lịch sử chạy hiển thị file của từng lần chạy và cho thêm file sau |
| **Bug** | Mức độ, ưu tiên, môi trường, các bước tái hiện…, quy trình *Mới → Đang xử lý → Đã sửa → Đóng / Mở lại*. Khi test **Không đạt** có thể tạo bug ngay với thông tin điền sẵn |
| **Tài liệu** | Hai loại: **Thiết kế** và **Tài liệu đặc tả**; phiên bản, trạng thái (nháp / đang review / đã duyệt / hết hiệu lực), người soạn, link tài liệu (Drive, Figma, Confluence…), danh sách task đang dùng tài liệu |

Trang **Tổng quan** hiển thị số liệu của dự án đang chọn. Dự án đang làm việc được chọn ở thanh bên trái.

Mọi mục (biên bản, task, test case, bug, tài liệu, dự án, thành viên) có nút **Copy link** ở trang chi tiết và trên từng dòng danh sách: người nhận mở link là vào thẳng mục đó (tự chuyển sang đúng dự án). Bản demo dùng link artifact kèm `#tasks-12` (đặt link gốc qua biến `VITE_SHARE_URL` khi build demo).

Mọi bảng có cột **STT**; danh sách hỗ trợ tìm kiếm (kể cả theo mã như `BUG-12`, `TC-003`), lọc, sắp xếp, phân trang; bộ lọc lưu trên URL.

## Công nghệ

- **Backend:** Node.js ≥ 22.13, Express 5, SQLite (module `node:sqlite` có sẵn trong Node – không cần cài DB hay build native)
- **Frontend:** React 19, React Router 7, Vite 7, CSS thuần (hỗ trợ dark mode, responsive, in ấn)

## Cài đặt & chạy

```bash
npm install
```

```bash
npm run seed            # (tuỳ chọn) tạo dữ liệu mẫu; thêm "-- --reset" để xoá và tạo lại
```

**Chế độ phát triển** (API: http://localhost:3001, Web: http://localhost:5173, tự reload):

```bash
npm run dev
```

**Chế độ production** (build frontend, server Express phục vụ cả API và giao diện tại http://localhost:3001):

```bash
npm run build && npm start
```

**Bản demo không cần máy chủ** (đóng gói cả backend + SQLite vào trình duyệt thành một file HTML, dữ liệu lưu trong `localStorage`):

```bash
npm run build:demo      # kết quả: frontend/dist-demo/project-hub.html
```

**Chạy test API:**

```bash
npm test
```

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | Cổng của server |
| `DB_FILE` | `backend/data/pm.db` | Đường dẫn file SQLite |
| `STATIC_DIR` | `frontend/dist` | Thư mục frontend đã build |

## Cấu trúc thư mục

```
backend/
  src/
    db.js          Schema SQLite & transaction helper
    resource.js    Router CRUD dùng chung (validate, tìm kiếm, lọc, sắp xếp, phân trang)
    resources.js   Cấu hình từng thực thể: field, enum, bộ lọc, dữ liệu liên quan
    app.js         Express app: route CRUD, test runs, dashboard, lookup, xử lý lỗi
    server.js      Điểm khởi chạy
    seed.js        Dữ liệu mẫu
  test/api.test.js
frontend/
  src/
    api.js, constants.js, forms.js, context.jsx
    components/    ResourceList, DetailPage, EntityForm, ui
    pages/         Dashboard, Meetings, Tasks, TestCases, Bugs
```

## REST API

Tất cả endpoint nằm dưới `/api`. `{resource}` là một trong `projects`, `members`, `meetings`, `tasks`, `test-cases`, `bugs`, `documents`.

Dữ liệu meetings / tasks / test-cases / bugs / documents thuộc một dự án: khi tạo phải gửi `project_id` (không đổi được sau đó), khi liệt kê lọc bằng `?project_id=`. Các liên kết (cuộc họp, task, test case, tài liệu) phải cùng dự án.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/{resource}` | Danh sách. Query: `q`, các bộ lọc (VD `status=new,reopened`, `assignee=...`, `meeting_id=none`), `sort`, `order=asc\|desc`, `limit`, `offset`. Trả về `{ items, total, limit, offset }` |
| GET | `/{resource}/:id` | Chi tiết, kèm dữ liệu liên quan (action items, test runs, bug liên kết…) |
| POST | `/{resource}` | Tạo mới. Task nhận thêm `document_ids: [..]` để liên kết tài liệu và `parent_id` để tạo subtask |
| PATCH / PUT | `/{resource}/:id` | Cập nhật (chỉ các field gửi lên) |
| DELETE | `/{resource}/:id` | Xoá |
| POST | `/test-cases/:id/runs` | Ghi nhận một lần chạy test `{ result: passed\|failed\|blocked, note, executed_by }` – tự cập nhật trạng thái test case |
| GET | `/test-cases/:id/runs` | Lịch sử chạy |
| DELETE | `/test-runs/:id` | Xoá một lần chạy (trạng thái test case được tính lại) |
| POST | `/meetings/:id/attachments` | Đính kèm file `{ name, mime_type, data }` (`data` là base64) |
| POST | `/test-runs/:id/attachments` | Đính kèm file vào một lần chạy test (cùng định dạng) |
| GET | `/attachments/:id/download` | Tải file (`?inline=1` để xem ảnh trực tiếp) |
| DELETE | `/attachments/:id` | Xoá file |
| POST | `/tasks/:id/links` | Liên kết task `{ other_task_id, type: depends_on \| blocks \| relates }` |
| DELETE | `/task-links/:id` | Gỡ liên kết |
| GET / POST | `/projects/:id/members` | Danh sách / thêm thành viên dự án `{ member_id }` hoặc `{ name, email }` kèm `role` |
| PATCH / DELETE | `/projects/:id/members/:memberId` | Đổi vai trò `{ role }` / gỡ khỏi dự án |
| GET | `/gantt?project_id=&member_id=&include_done=true` | Dữ liệu biểu đồ Gantt: thành viên → dự án (vai trò) → task |
| GET | `/test-report?project_id=` | Báo cáo test: tổng hợp, theo module, tỉ lệ đạt, tiến độ |
| GET | `/dashboard?project_id=` | Số liệu tổng quan của dự án |
| GET | `/lookup?project_id=` | Danh sách rút gọn cho dropdown (dự án, thành viên, meetings, tasks, test cases, tài liệu, người, module) |
| GET | `/enums` | Các giá trị enum hợp lệ |

Bộ lọc đặc biệt: `GET /tasks?overdue=true`, `GET /tasks?parent_id=none` (bỏ subtask), `GET /bugs?open=true`, `GET /meetings?from=YYYY-MM-DD&to=YYYY-MM-DD`.

Lỗi validate trả về `400` dạng `{ "error": "Dữ liệu không hợp lệ", "details": { "field": "thông báo" } }`.

### Giá trị enum

- Độ ưu tiên: `low`, `medium`, `high`, `critical`
- Trạng thái task: `todo`, `in_progress`, `review`, `done`
- Loại test: `functional`, `integration`, `regression`, `smoke`, `performance`, `security`, `ui`
- Trạng thái test case: `not_run`, `passed`, `failed`, `blocked`
- Mức độ bug: `minor`, `major`, `critical`, `blocker`
- Trạng thái bug: `new`, `in_progress`, `resolved`, `closed`, `reopened`, `rejected`
- Trạng thái dự án: `planning`, `active`, `on_hold`, `completed`, `cancelled`
- Vai trò thành viên: `pm`, `ba`, `tech_lead`, `developer`, `tester`, `designer`, `devops`, `stakeholder`
- Loại tài liệu: `design`, `specification`; trạng thái: `draft`, `in_review`, `approved`, `obsolete`

Task được tính là của một thành viên khi tên người thực hiện trùng tên thành viên (không phân biệt hoa thường, bỏ khoảng trắng thừa). Đổi tên thành viên sẽ tự cập nhật tên ở task, bug, biên bản họp và tài liệu.

Database từ phiên bản cũ (chưa có dự án) được tự động nâng cấp khi khởi động: dữ liệu cũ được gom vào dự án **Dự án mặc định** (`DEFAULT`).

## Hướng phát triển tiếp

- Đăng nhập / phân quyền người dùng, quản lý thành viên
- Bình luận, đính kèm file, lịch sử thay đổi
- Test suite / test plan theo sprint, sprint & milestone
