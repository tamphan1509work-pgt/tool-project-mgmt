import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { fmtDateTime } from '../constants.js';
import { useAsync, useConfirm, useToast } from '../context.jsx';
import { Section } from './DetailPage.jsx';
import { Icon, Modal } from './ui.jsx';

export const fmtSize = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const PREVIEW_IMAGE = /^image\/(png|jpe?g|gif|webp|bmp)$/;
const PREVIEW_TEXT = /^(text\/|application\/(json|xml|csv))/;
const canPreview = (f) => PREVIEW_IMAGE.test(f.mime_type) || PREVIEW_TEXT.test(f.mime_type);

const fileIcon = (f) => {
  const ext = f.name.split('.').pop()?.toLowerCase();
  const mime = f.mime_type ?? f.type ?? '';
  if (/^image\//.test(mime)) return '🖼';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  if (['ppt', 'pptx'].includes(ext)) return '📙';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜';
  if (['log', 'txt', 'md'].includes(ext)) return '📝';
  return '📄';
};

/** File -> base64 (không gồm tiền tố data:) */
const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`Không đọc được file ${file.name}`));
    reader.readAsDataURL(file);
  });

/* ---------- Giới hạn dung lượng (lấy từ máy chủ, dùng chung) ---------- */
let limitPromise = null;
export function useUploadLimit() {
  const [limit, setLimit] = useState(10 * 1024 * 1024);
  useEffect(() => {
    limitPromise ??= api
      .config()
      .then((c) => c.maxUploadBytes)
      .catch(() => {
        limitPromise = null;
        return 10 * 1024 * 1024;
      });
    let alive = true;
    limitPromise.then((v) => alive && setLimit(v));
    return () => {
      alive = false;
    };
  }, []);
  return limit;
}

/**
 * Tải lên danh sách File cho một đối tượng.
 * target: 'meetings' | 'test-runs'. Trả về { uploaded, errors: [message] }.
 */
export async function uploadFiles(target, id, files, onProgress) {
  const errors = [];
  let uploaded = 0;
  for (const f of files) {
    try {
      await api.uploadAttachment(target, id, {
        name: f.name,
        mime_type: f.type || 'application/octet-stream',
        data: await readBase64(f),
      });
      uploaded++;
    } catch (err) {
      errors.push(`${f.name}: ${Object.values(err.details ?? {})[0] ?? err.message}`);
    }
    onProgress?.(uploaded + errors.length, files.length);
  }
  return { uploaded, errors };
}

/** Hook tiện ích: tải lên + thông báo kết quả bằng toast */
export function useUploader() {
  const toast = useToast();
  return async (target, id, files) => {
    if (!files?.length) return 0;
    const { uploaded, errors } = await uploadFiles(target, id, files);
    for (const e of errors) toast(e, 'error');
    if (uploaded) toast(`Đã tải lên ${uploaded} file`);
    return uploaded;
  };
}

/* ---------- Xem trước & tải về ---------- */
function Preview({ file, onClose }) {
  const { data, error } = useAsync(async () => {
    const blob = await api.attachmentBlob(file.id, true);
    if (PREVIEW_IMAGE.test(file.mime_type)) return { url: URL.createObjectURL(blob) };
    const text = await blob.text();
    return { text: text.length > 200000 ? `${text.slice(0, 200000)}\n…` : text };
  }, [file.id]);
  const close = () => {
    if (data?.url) URL.revokeObjectURL(data.url);
    onClose();
  };
  return (
    <Modal wide title={file.name} onClose={close}>
      {error && <div className="error-box">{error.message}</div>}
      {!data && !error && <div className="muted">Đang tải…</div>}
      {data?.url && <img src={data.url} alt={file.name} className="preview-img" />}
      {data?.text !== undefined && <pre className="preview-text">{data.text}</pre>}
    </Modal>
  );
}

function useFileActions(onChanged) {
  const toast = useToast();
  const confirm = useConfirm();
  const [preview, setPreview] = useState(null);

  const download = async (f) => {
    try {
      const blob = await api.attachmentBlob(f.id);
      // Bản demo chạy trong khung xem artifact: tải về qua capability "downloads" (người xem xác nhận)
      if (import.meta.env.MODE === 'demo') {
        const downloads = await window.claude?.use?.('downloads');
        if (downloads) {
          try {
            await downloads.save({ filename: f.name, data: blob });
          } catch (err) {
            if (err?.code === 'rejected_extension') {
              toast(`Bản demo không cho tải định dạng file này. ${canPreview(f) ? 'Hãy dùng nút Xem.' : ''}`, 'error');
            } else if (err?.code !== 'declined') {
              toast('Không tải được file trong bản demo', 'error');
            }
          }
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (f) => {
    if (!(await confirm(`Xoá file "${f.name}"?`))) return;
    try {
      await api.removeAttachment(f.id);
      toast(`Đã xoá ${f.name}`);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const open = (f) => (canPreview(f) ? setPreview(f) : download(f));
  const previewModal = preview && <Preview file={preview} onClose={() => setPreview(null)} />;
  return { download, remove, open, setPreview, previewModal };
}

/* ---------- Vùng chọn file (kéo thả / chọn), dùng trong form & bảng thực thi test ---------- */
export function FilePicker({ value = [], onChange, compact = false, id }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const maxBytes = useUploadLimit();
  const add = (list) => {
    const incoming = [...list].filter((f) => f.size > 0);
    const key = (f) => `${f.name}|${f.size}|${f.lastModified}`;
    const existing = new Set(value.map(key));
    onChange([...value, ...incoming.filter((f) => !existing.has(key(f)))]);
  };
  const tooBig = value.filter((f) => f.size > maxBytes);

  return (
    <div className="file-picker">
      <div
        id={id}
        className={`dropzone ${compact ? 'dropzone-compact' : ''} ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        <span>{compact ? 'Đính kèm file (ảnh chụp, log…):' : 'Kéo thả file vào đây hoặc'}</span>
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>
          <Icon name="clip" size={14} /> Chọn file
        </button>
        <span className="muted small">Tối đa {fmtSize(maxBytes)} / file</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {value.length > 0 && (
        <ul className="pending-files">
          {value.map((f, i) => (
            <li key={`${f.name}-${i}`} className={f.size > maxBytes ? 'is-invalid' : ''}>
              <span aria-hidden="true">{fileIcon(f)}</span>
              <span className="pending-name">{f.name}</span>
              <span className="muted small">{fmtSize(f.size)}</span>
              {f.size > maxBytes && <span className="text-danger small">quá {fmtSize(maxBytes)}</span>}
              <button
                type="button"
                className="icon-btn danger"
                title="Bỏ file này"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {tooBig.length > 0 && (
        <div className="field-error">
          File quá dung lượng sẽ bị bỏ qua khi lưu. Hãy bỏ chúng hoặc chọn file nhỏ hơn.
        </div>
      )}
    </div>
  );
}

/* ---------- Danh sách file gọn (dùng cho từng lần chạy test) ---------- */
export function FileChips({ files, onChanged }) {
  const { open, download, remove, previewModal } = useFileActions(onChanged);
  if (!files?.length) return null;
  return (
    <>
      <ul className="file-chips">
        {files.map((f) => (
          <li key={f.id}>
            <button className="link-btn" onClick={() => open(f)} title={`${f.name} · ${fmtSize(f.size)}`}>
              <span aria-hidden="true">{fileIcon(f)}</span> {f.name}
            </button>
            <button className="icon-btn" title="Tải về" onClick={() => download(f)}>
              <Icon name="download" size={14} />
            </button>
            <button className="icon-btn danger" title="Xoá file" onClick={() => remove(f)}>
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      {previewModal}
    </>
  );
}

/** Nút "+ file" thêm file vào một đối tượng đã có (VD lần chạy test cũ) */
export function AddFilesButton({ target, id, onDone, label = 'Thêm file' }) {
  const inputRef = useRef(null);
  const upload = useUploader();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Icon name="clip" size={14} /> {busy ? 'Đang tải…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...e.target.files];
          e.target.value = '';
          setBusy(true);
          await upload(target, id, files);
          setBusy(false);
          onDone();
        }}
      />
    </>
  );
}

/**
 * Tệp đính kèm của biên bản họp: bảng file + kéo thả để tải lên ngay.
 */
export default function Attachments({ meeting, reload }) {
  const { open, download, remove, setPreview, previewModal } = useFileActions(reload);
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const toast = useToast();
  const maxBytes = useUploadLimit();
  const files = meeting.attachments;

  const upload = async (list) => {
    const chosen = [...list];
    const tooBig = chosen.filter((f) => f.size > maxBytes);
    const ok = chosen.filter((f) => f.size <= maxBytes && f.size > 0);
    if (tooBig.length) toast(`Bỏ qua ${tooBig.map((f) => f.name).join(', ')}: vượt quá ${fmtSize(maxBytes)}`, 'error');
    if (!ok.length) return;
    setProgress({ done: 0, total: ok.length });
    const { uploaded, errors } = await uploadFiles('meetings', meeting.id, ok, (done, total) =>
      setProgress({ done, total }),
    );
    setProgress(null);
    for (const e of errors) toast(e, 'error');
    if (uploaded) toast(`Đã tải lên ${uploaded} file`);
    reload();
  };

  return (
    <Section title={`Tệp đính kèm (${files.length})`}>
      {files.length > 0 && (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th className="col-stt">STT</th>
                <th>Tên file</th>
                <th className="num" style={{ width: 90 }}>
                  Dung lượng
                </th>
                <th style={{ width: 130 }}>Tải lên lúc</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={f.id}>
                  <td className="col-stt">{i + 1}</td>
                  <td>
                    <button className="link-btn" onClick={() => open(f)}>
                      <span aria-hidden="true">{fileIcon(f)}</span> {f.name}
                    </button>
                  </td>
                  <td className="num small">{fmtSize(f.size)}</td>
                  <td className="small">{fmtDateTime(f.created_at)}</td>
                  <td className="row-actions">
                    {canPreview(f) && (
                      <button className="icon-btn" title="Xem" onClick={() => setPreview(f)}>
                        <Icon name="eye" size={16} />
                      </button>
                    )}
                    <button className="icon-btn" title="Tải về" onClick={() => download(f)}>
                      <Icon name="download" size={16} />
                    </button>
                    <button className="icon-btn danger" title="Xoá" onClick={() => remove(f)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div
        className={`dropzone no-print ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
      >
        {progress ? (
          <span>
            Đang tải lên {progress.done}/{progress.total}…
          </span>
        ) : (
          <>
            <span>Kéo thả file vào đây hoặc</span>
            <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>
              <Icon name="clip" size={14} /> Chọn file
            </button>
            <span className="muted small">Tối đa {fmtSize(maxBytes)} / file</span>
            {import.meta.env.MODE === 'demo' && (
              <span className="muted small">· Bản demo: file chỉ lưu trong trình duyệt này</span>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {previewModal}
    </Section>
  );
}
