// Link chia sẻ tới từng mục (biên bản, task, test case, bug, tài liệu, dự án, thành viên).
//
// - Bản thật: link dạng https://<máy chủ>/tasks/12 (mở thẳng trang chi tiết, tự chuyển dự án).
// - Bản demo (chạy trong khung xem artifact): chỉ "#tên" được truyền giữa link và trang,
//   nên link có dạng <link artifact>#tasks-12.

export const LINKABLE = ['meetings', 'tasks', 'test-cases', 'bugs', 'documents', 'projects', 'members'];
const IS_DEMO = import.meta.env.MODE === 'demo';

/** Đường dẫn trong app -> tên hash (VD "/tasks/12" -> "tasks-12", "/bugs" -> "bugs") */
export function pathToHash(pathname) {
  const m = /^\/([a-z-]+)(?:\/(\d+))?\/?$/.exec(pathname);
  if (!m || !LINKABLE.includes(m[1])) return '';
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

/** Tên hash -> đường dẫn trong app (ngược lại của pathToHash); không hợp lệ -> null */
export function hashToPath(hash) {
  const name = String(hash ?? '').replace(/^#/, '');
  const m = /^([a-z-]+?)(?:-(\d+))?$/.exec(name);
  if (!m || !LINKABLE.includes(m[1])) return null;
  return m[2] ? `/${m[1]}/${m[2]}` : `/${m[1]}`;
}

/** Link đầy đủ để gửi cho người khác */
export function itemLink(resource, id) {
  if (IS_DEMO) {
    const base = import.meta.env.VITE_SHARE_URL || window.location.href.split('#')[0];
    return `${base}#${resource}-${id}`;
  }
  return `${window.location.origin}/${resource}/${id}`;
}

/** Sao chép văn bản; trả về false nếu trình duyệt không cho phép */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Dự phòng cho trình duyệt / khung nhúng chặn Clipboard API
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
