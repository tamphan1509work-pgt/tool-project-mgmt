# Project Hub – Quản lý dự án phần mềm

Ứng dụng web quản lý dự án phần mềm gồm 4 phân hệ chính, liên kết chặt chẽ với nhau:

| Phân hệ | Chức năng |
|---|---|
| **Meeting minutes** | Ghi biên bản họp (agenda, nội dung, quyết định, thành phần), tạo **action item** thành task ngay trong biên bản, in / xuất PDF |
| **Task** | Quản lý task dạng bảng hoặc **Kanban kéo-thả**, độ ưu tiên, người thực hiện, hạn, ước lượng, cảnh báo quá hạn, liên kết với cuộc họp |
| **Test case** | Viết test case (module, loại, điều kiện, các bước, kết quả mong đợi), **thực thi test** (Đạt / Không đạt / Bị chặn) với lịch sử chạy, liên kết task |
| **Bug** | Theo dõi bug (mức độ, ưu tiên, môi trường, các bước tái hiện…), quy trình trạng thái *Mới → Đang xử lý → Đã sửa → Đóng / Mở lại*. Khi test **Không đạt** có thể tạo bug ngay với thông tin điền sẵn |

Ngoài ra có trang **Tổng quan** (dashboard): số liệu tổng hợp, tỉ lệ test đạt, phân bố trạng thái, task quá hạn / sắp đến hạn, bug nghiêm trọng, cuộc họp sắp tới.

Tất cả danh sách đều hỗ trợ tìm kiếm (kể cả theo mã như `BUG-12`, `TC-003`), lọc, sắp xếp, phân trang; bộ lọc lưu trên URL nên có thể chia sẻ link.

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

Tất cả endpoint nằm dưới `/api`. `{resource}` là một trong `meetings`, `tasks`, `test-cases`, `bugs`.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/{resource}` | Danh sách. Query: `q`, các bộ lọc (VD `status=new,reopened`, `assignee=...`, `meeting_id=none`), `sort`, `order=asc\|desc`, `limit`, `offset`. Trả về `{ items, total, limit, offset }` |
| GET | `/{resource}/:id` | Chi tiết, kèm dữ liệu liên quan (action items, test runs, bug liên kết…) |
| POST | `/{resource}` | Tạo mới |
| PATCH / PUT | `/{resource}/:id` | Cập nhật (chỉ các field gửi lên) |
| DELETE | `/{resource}/:id` | Xoá |
| POST | `/test-cases/:id/runs` | Ghi nhận một lần chạy test `{ result: passed\|failed\|blocked, note, executed_by }` – tự cập nhật trạng thái test case |
| GET | `/test-cases/:id/runs` | Lịch sử chạy |
| DELETE | `/test-runs/:id` | Xoá một lần chạy (trạng thái test case được tính lại) |
| GET | `/dashboard` | Số liệu tổng quan |
| GET | `/lookup` | Danh sách rút gọn cho dropdown (meetings, tasks, test cases, người, module) |
| GET | `/enums` | Các giá trị enum hợp lệ |

Bộ lọc đặc biệt: `GET /tasks?overdue=true`, `GET /bugs?open=true`, `GET /meetings?from=YYYY-MM-DD&to=YYYY-MM-DD`.

Lỗi validate trả về `400` dạng `{ "error": "Dữ liệu không hợp lệ", "details": { "field": "thông báo" } }`.

### Giá trị enum

- Độ ưu tiên: `low`, `medium`, `high`, `critical`
- Trạng thái task: `todo`, `in_progress`, `review`, `done`
- Loại test: `functional`, `integration`, `regression`, `smoke`, `performance`, `security`, `ui`
- Trạng thái test case: `not_run`, `passed`, `failed`, `blocked`
- Mức độ bug: `minor`, `major`, `critical`, `blocker`
- Trạng thái bug: `new`, `in_progress`, `resolved`, `closed`, `reopened`, `rejected`

## Hướng phát triển tiếp

- Đăng nhập / phân quyền người dùng, quản lý thành viên
- Nhiều dự án (project) trong cùng một hệ thống
- Bình luận, đính kèm file, lịch sử thay đổi
- Test suite / test plan theo sprint, sprint & milestone
