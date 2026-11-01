# Project Hub – Quản lý dự án phần mềm

Ứng dụng web quản lý **nhiều dự án** phần mềm. Mỗi dự án có thành viên với vai trò riêng, và toàn bộ dữ liệu bên dưới được quản lý theo dự án:

| Phân hệ | Chức năng |
|---|---|
| **Dự án & thành viên** | Danh sách dự án (mã, tên, trạng thái, thời gian), số task/bug đang mở. Trong từng dự án: thêm thành viên (chọn người có sẵn hoặc tạo mới), gán **vai trò trong dự án** (PM, BA, Tech lead, Developer, Tester, Designer, DevOps, Stakeholder), đổi vai trò, gỡ thành viên. Một người có thể tham gia nhiều dự án với vai trò khác nhau |
| **Trong chi tiết dự án** | Các tab **Tổng quan** (số liệu, thành viên & vai trò), **Milestone** (mốc dự án: hạn, trạng thái, tiến độ theo task, cảnh báo trễ hạn; trang chi tiết riêng), **Danh mục** (danh mục dạng cây cha / con, màu nhãn; task, test case, bug, tài liệu chọn danh mục; lọc danh mục cha gồm cả danh mục con) và **Lịch sử** (mọi thay đổi trong dự án) |
| **Đăng nhập / đăng xuất** | Đăng nhập bằng email của thành viên + mật khẩu (ghi nhớ 30 ngày hoặc 1 ngày). Lần chạy đầu tiên (chưa có tài khoản) hiện màn hình **tạo tài khoản quản trị**. Menu tài khoản: hồ sơ, **đổi mật khẩu**, **đăng xuất**. Danh sách Thành viên có cột **Chức danh**, **Tài khoản** (Thành viên / Quản trị viên) và **Trạng thái** (Active / Inactive, lọc được). Quản trị viên **bật / tắt** tài khoản ngay trên bảng (bật thành viên chưa có tài khoản = tạo tài khoản), **đổi mật khẩu** của thành viên (icon chìa khoá), cấp / gỡ quyền quản trị ở trang chi tiết; ô mật khẩu có icon con mắt để ẩn / hiện; chỉ quản trị viên được đổi Cài đặt. Đăng nhập sai 5 lần liên tiếp bị khoá 5 phút |
| **Lịch sử thay đổi** | Mọi trang chi tiết có mục *Lịch sử thay đổi*: ai, lúc nào, tạo / sửa / xoá, đính kèm file, chạy test, liên kết task, thêm thành viên… Khi sửa, ghi rõ từng trường *giá trị cũ → giá trị mới*. Người thao tác là người đang đăng nhập |
| **Thông báo deadline** | **Cài đặt** bật / tắt: chuông thông báo trên web (task / milestone trễ hoặc sắp đến hạn, xem theo dự án hoặc tất cả) và **email tổng hợp hằng ngày** (giờ gửi, nhắc trước N ngày, người nhận: người thực hiện / PM / email thêm; mỗi mục chỉ nhắc một lần mỗi ngày; xem trước & gửi ngay). Từng thành viên có thể tắt email của mình |
| **Thành viên** | Danh bạ thành viên dùng chung (**ảnh đại diện** — tải ảnh lên, tự thu nhỏ 128×128; chưa có ảnh thì hiện chữ viết tắt, họ tên, chức danh, email, điện thoại), số dự án tham gia, số task đang làm / quá hạn. Trang chi tiết: dự án và vai trò, task được giao. **Biểu đồ Gantt**: mỗi thành viên → các dự án đang tham gia (kèm vai trò, thời gian dự án) → các task đang làm (từ ngày bắt đầu tới hạn), có vạch "Hôm nay", lọc theo dự án / thành viên, thu phóng Ngày / Tuần / Tháng, ẩn/hiện task đã xong |
| **Meeting minutes** | Biên bản họp (agenda, nội dung, quyết định, thành phần), **đính kèm file** ngay khi tạo / sửa biên bản hoặc tại trang chi tiết (kéo thả, tối đa 10 MB/file, xem trước ảnh & file văn bản, tải về), tạo **action item** thành task ngay trong biên bản, in / xuất PDF |
| **Task** | Trạng thái: **To Do → In Progress → Done Dev → Testing → Ready Release → Released**, hoặc **Canceled** (Released / Canceled = đã đóng). Danh sách có **nhãn lọc trạng thái kèm số lượng** (nằm dưới các bộ lọc khác), cột PIC, Người yêu cầu, Người tạo, Thời gian tạo; dạng bảng hoặc Kanban kéo-thả. **Mô tả dùng trình soạn thảo**: định dạng chữ, tiêu đề, danh sách đánh số / gạch đầu dòng, bảng, ảnh (chọn, dán hoặc kéo thả), liên kết, trích dẫn, khối mã — nội dung được lọc mã độc (DOMPurify) khi hiển thị. Trang chi tiết có các tab **Chi tiết** (mô tả, subtask, tài liệu liên quan, task liên quan / phụ thuộc), **Test case**, **Bug**, **Bình luận**, **Lịch sử thay đổi** |
| **Test report** | Danh sách có **nhãn lọc kết quả kèm số lượng** (Chưa chạy / Đạt / Không đạt / Bị chặn), cột Người tạo, Thời gian tạo; chi tiết có tab **Bình luận** và Lịch sử thay đổi. Hai tab: **Danh sách test case** và **Thống kê** (tỉ lệ đạt, tiến độ thực thi, tổng hợp theo module / độ ưu tiên / loại test / người thực hiện, các lần chạy gần đây); danh sách test case, **thực thi test** (Đạt / Không đạt / Bị chặn) kèm **file bằng chứng** (ảnh chụp màn hình, log…), lịch sử chạy hiển thị file của từng lần chạy và cho thêm file sau |
| **Bug** | **Nhãn lọc trạng thái kèm số lượng**, cột Người báo bug, Người tạo, Thời gian tạo; chi tiết có tab **Bình luận** và Lịch sử thay đổi. Mức độ, ưu tiên, môi trường, các bước tái hiện…, quy trình *Mới → Đang xử lý → Đã sửa → Đóng / Mở lại*. Khi test **Không đạt** có thể tạo bug ngay với thông tin điền sẵn |
| **Tài liệu** | Hai loại: **Thiết kế** và **Tài liệu đặc tả**; phiên bản, trạng thái (nháp / đang review / đã duyệt / hết hiệu lực), người soạn, link tài liệu (Drive, Figma, Confluence…), danh sách task đang dùng tài liệu |

Trang **Tổng quan** hiển thị số liệu của dự án đang chọn. Menu trái **thu gọn / mở rộng** được (nút ☰ hoặc "Thu gọn menu"; chỉ còn icon, có chú thích khi rê chuột) và được ghi nhớ. Dự án đang làm việc được chọn ở thanh bên trái.

Mọi mục (biên bản, task, test case, bug, tài liệu, dự án, thành viên) có nút **Copy link** ở trang chi tiết và trên từng dòng danh sách: người nhận mở link là vào thẳng mục đó (tự chuyển sang đúng dự án). Bản demo dùng link artifact kèm `#tasks-12` (đặt link gốc qua biến `VITE_SHARE_URL` khi build demo).

Cột **Người tạo** và **PIC** hiển thị avatar, rê chuột vào hiện họ tên và email. **Bình luận** (Task, Test report, Bug): thành viên của dự án trao đổi trong tab Bình luận (Ctrl + Enter để gửi), sửa bình luận của mình, xoá bình luận của mình (quản trị viên xoá được mọi bình luận).

Thời gian hiển thị theo định dạng `dd/mm/yyyy hh:mm:ss`. Người tạo được ghi tự động theo tài khoản đăng nhập. Mọi bảng có cột **STT**; danh sách hỗ trợ tìm kiếm (kể cả theo mã như `BUG-12`, `TC-003`), lọc, sắp xếp, phân trang; bộ lọc lưu trên URL.

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

Dữ liệu mẫu có sẵn tài khoản, mật khẩu đều là `123456` — **hãy đổi mật khẩu trước khi dùng thật**:
`an.nguyen@example.com` (quản trị viên), `binh.tran@example.com`, `dung.pham@example.com`, …
Nếu không chạy seed, lần đầu mở web sẽ có màn hình tạo tài khoản quản trị.

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
| `APP_URL` | `http://localhost:<PORT>` | Địa chỉ web, dùng để tạo link trong email |
| `SMTP_HOST` | *(trống)* | Máy chủ gửi email. Để trống = không gửi email (vẫn xem trước được) |
| `SMTP_PORT` | `587` | Cổng SMTP |
| `SMTP_SECURE` | `false` | `true` khi dùng cổng 465 (SSL) |
| `SMTP_USER`, `SMTP_PASS` | *(trống)* | Tài khoản SMTP (mật khẩu chỉ đặt qua biến môi trường, không lưu trong database) |
| `MAIL_FROM` | `SMTP_USER` | Người gửi, VD `Project Hub <noreply@congty.com>` |

Ví dụ chạy kèm gửi email (Gmail cần dùng *App password*):

```bash
SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_SECURE=true SMTP_USER=ban@gmail.com SMTP_PASS=xxxx APP_URL=https://pm.congty.com npm start
```

Khi bật email trong **Cài đặt**, máy chủ kiểm tra mỗi 10 phút và gửi email tổng hợp một lần mỗi ngày sau giờ đã chọn.

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

Tất cả endpoint nằm dưới `/api` và (trừ `/health`, `/auth/status`, `/auth/setup`, `/auth/login`) yêu cầu header `Authorization: Bearer <token>`. `{resource}` là một trong `projects`, `members`, `categories`, `milestones`, `meetings`, `tasks`, `test-cases`, `bugs`, `documents`.

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
| GET | `/tasks?counts=status` | Kèm `counts`: số task theo trạng thái (theo các bộ lọc khác, bỏ qua bộ lọc trạng thái) |
| GET | `/{resource}?category_id=` | Lọc task / test case / bug / tài liệu theo danh mục (gồm danh mục con; `none` = chưa phân loại) |
| GET | `/history?entity=tasks&entity_id=12` hoặc `?project_id=` | Lịch sử thay đổi của một mục / cả dự án. Người thao tác lấy theo tài khoản đăng nhập |
| GET / POST | `/comments?entity=tasks&entity_id=12` | Bình luận của task / test case (`test-cases`) / bug; gửi: `{ entity, entity_id, body }` (thành viên dự án hoặc quản trị viên) |
| PATCH / DELETE | `/comments/:id` | Sửa (tác giả) / xoá (tác giả hoặc quản trị viên) bình luận |
| GET / PUT | `/settings` | Cài đặt thông báo |
| GET | `/notifications?project_id=` | Task / milestone trễ hoặc sắp đến hạn (thông báo web) |
| POST | `/notifications/email/preview` · `/notifications/email/run` | Xem trước / gửi ngay email nhắc deadline |
| GET | `/auth/status` | `{ needsSetup }`: chưa có tài khoản nào |
| POST | `/auth/setup` · `/auth/login` | Tạo quản trị viên đầu tiên / đăng nhập `{ email, password, remember }` → `{ token, user }` |
| GET · POST | `/auth/me` · `/auth/logout` · `/auth/password` | Người dùng hiện tại / đăng xuất / đổi mật khẩu |
| GET · PUT · DELETE | `/members/:id/account` | Tài khoản đăng nhập của thành viên (PUT/DELETE: quản trị viên) |
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
- Trạng thái task: `todo`, `in_progress`, `done_dev`, `testing`, `ready_release`, `released`, `canceled` (dữ liệu cũ: `review` → `done_dev`, `done` → `released`)
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

- Phân quyền chi tiết theo vai trò trong dự án
- @nhắc tên trong bình luận kèm thông báo
- Test suite / test plan theo sprint, sprint & milestone
