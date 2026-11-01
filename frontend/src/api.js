export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Bản demo (vite build --mode demo) chạy backend ngay trong trình duyệt thay vì gọi máy chủ
const demo = import.meta.env.MODE === 'demo' ? await import('./demo/server.js') : null;
const doFetch = demo ? demo.demoFetch : (...args) => fetch(...args);
/** Chỉ có ở bản demo: khôi phục dữ liệu mẫu */
export const resetDemo = demo?.resetDemo;

async function request(method, path, body) {
  let res;
  try {
    res = await doFetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được tới máy chủ');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Lỗi ${res.status}`, data?.details);
  return data;
}

/** Tải nội dung nhị phân (file đính kèm) */
async function requestBlob(path) {
  let res;
  try {
    res = await doFetch(`/api${path}`, { method: 'GET' });
  } catch {
    throw new ApiError(0, 'Không kết nối được tới máy chủ');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error || `Lỗi ${res.status}`);
  }
  return res.blob();
}

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  list: (resource, params) => request('GET', `/${resource}${qs(params)}`),
  get: (resource, id) => request('GET', `/${resource}/${id}`),
  create: (resource, data) => request('POST', `/${resource}`, data),
  update: (resource, id, data) => request('PATCH', `/${resource}/${id}`, data),
  remove: (resource, id) => request('DELETE', `/${resource}/${id}`),
  addRun: (testCaseId, data) => request('POST', `/test-cases/${testCaseId}/runs`, data),
  removeRun: (runId) => request('DELETE', `/test-runs/${runId}`),
  dashboard: (params) => request('GET', `/dashboard${qs(params)}`),
  config: () => request('GET', '/config'),
  addAttachment: (meetingId, data) => request('POST', `/meetings/${meetingId}/attachments`, data),
  removeAttachment: (id) => request('DELETE', `/attachments/${id}`),
  attachmentBlob: (id, inline = false) => requestBlob(`/attachments/${id}/download${inline ? '?inline=1' : ''}`),
  addTaskLink: (taskId, data) => request('POST', `/tasks/${taskId}/links`, data),
  removeTaskLink: (linkId) => request('DELETE', `/task-links/${linkId}`),
  gantt: (params) => request('GET', `/gantt${qs(params)}`),
  testReport: (params) => request('GET', `/test-report${qs(params)}`),
  lookup: (params) => request('GET', `/lookup${qs(params)}`),
  addMember: (projectId, data) => request('POST', `/projects/${projectId}/members`, data),
  updateMember: (projectId, memberId, data) => request('PATCH', `/projects/${projectId}/members/${memberId}`, data),
  removeMember: (projectId, memberId) => request('DELETE', `/projects/${projectId}/members/${memberId}`),
};
