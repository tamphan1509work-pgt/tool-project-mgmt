import { useRef, useState } from 'react';
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
  if (PREVIEW_IMAGE.test(f.mime_type)) return '🖼';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  if (['ppt', 'pptx'].includes(ext)) return '📙';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜';
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

/**
 * Danh sách file đính kèm của biên bản họp: kéo thả / chọn file để tải lên, xem, tải về, xoá.
 */
export default function Attachments({ meeting, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [preview, setPreview] = useState(null);
  const { data: config } = useAsync(() => api.config(), []);
  const maxBytes = config?.maxUploadBytes ?? 10 * 1024 * 1024;
  const files = meeting.attachments;

  const upload = async (list) => {
    const chosen = [...list];
    if (!chosen.length) return;
    const tooBig = chosen.filter((f) => f.size > maxBytes);
    const ok = chosen.filter((f) => f.size <= maxBytes && f.size > 0);
    if (tooBig.length) toast(`Bỏ qua ${tooBig.map((f) => f.name).join(', ')}: vượt quá ${fmtSize(maxBytes)}`, 'error');
    if (!ok.length) return;
    setProgress({ done: 0, total: ok.length });
    let uploaded = 0;
    for (const f of ok) {
      try {
        await api.addAttachment(meeting.id, {
          name: f.name,
          mime_type: f.type || 'application/octet-stream',
          data: await readBase64(f),
        });
        uploaded++;
      } catch (err) {
        toast(`${f.name}: ${Object.values(err.details ?? {})[0] ?? err.message}`, 'error');
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setProgress(null);
    if (uploaded) toast(`Đã tải lên ${uploaded} file`);
    reload();
  };

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
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
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
                    <button className="link-btn" onClick={() => (canPreview(f) ? setPreview(f) : download(f))}>
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
              Chọn file
            </button>
            <span className="muted small">Tối đa {fmtSize(maxBytes)} / file</span>
            {import.meta.env.MODE === 'demo' && (
              <span className="muted small">
                · Bản demo: file chỉ lưu trong trình duyệt này
              </span>
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
      {preview && <Preview file={preview} onClose={() => setPreview(null)} />}
    </Section>
  );
}
