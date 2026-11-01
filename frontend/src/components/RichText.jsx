import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import DOMPurify from 'dompurify';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../context.jsx';
import { Prose } from './ui.jsx';

// Ảnh được nhúng thẳng vào nội dung (base64) nên giới hạn dung lượng; bản demo lưu trong trình duyệt nên nhỏ hơn
const MAX_IMAGE = import.meta.env.MODE === 'demo' ? 300 * 1024 : 2 * 1024 * 1024;
const HTML_RE = /<\/?[a-z][\s\S]*>/i;

const escapeHtml = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Nội dung cũ dạng văn bản thường -> các đoạn <p> */
export const toHtml = (value) =>
  !value
    ? ''
    : HTML_RE.test(value)
      ? value
      : value
          .split(/\n/)
          .map((l) => `<p>${escapeHtml(l)}</p>`)
          .join('');

// Link trong nội dung luôn mở tab mới, không cho trang đích truy cập trang này
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Hiển thị nội dung soạn thảo (đã lọc mã độc bằng DOMPurify); văn bản thường hiển thị như cũ */
export function RichText({ html, placeholder = '—' }) {
  if (!html) return <span className="muted">{placeholder}</span>;
  if (!HTML_RE.test(html)) return <Prose text={html} placeholder={placeholder} />;
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return <div className="rich-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}

const readDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Không đọc được ảnh'));
    r.readAsDataURL(file);
  });

function ToolButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`rt-btn ${active ? 'is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onImage }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const [linkDraft, setLinkDraft] = useState(null); // null = đóng ô nhập link
  const applyLink = () => {
    const url = linkDraft.trim();
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    if (!url) c().extendMarkRange('link').unsetLink().run();
    else if (editor.state.selection.empty && !editor.isActive('link')) {
      // Chưa chọn chữ: chèn chính địa chỉ thành liên kết rồi thoát khỏi liên kết để gõ tiếp bình thường
      c()
        .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] })
        .unsetMark('link')
        .run();
    } else c().extendMarkRange('link').setLink({ href }).run();
    setLinkDraft(null);
  };
  return (
    <div className="rt-toolbar" role="toolbar" aria-label="Định dạng nội dung">
      <ToolButton title="Đậm (Ctrl+B)" active={s.bold} onClick={() => c().toggleBold().run()}>
        <b>B</b>
      </ToolButton>
      <ToolButton title="Nghiêng (Ctrl+I)" active={s.italic} onClick={() => c().toggleItalic().run()}>
        <i>I</i>
      </ToolButton>
      <ToolButton title="Gạch chân (Ctrl+U)" active={s.underline} onClick={() => c().toggleUnderline().run()}>
        <u>U</u>
      </ToolButton>
      <ToolButton title="Gạch ngang" active={s.strike} onClick={() => c().toggleStrike().run()}>
        <s>S</s>
      </ToolButton>
      <span className="rt-sep" />
      <ToolButton title="Tiêu đề lớn" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolButton>
      <ToolButton title="Tiêu đề nhỏ" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolButton>
      <span className="rt-sep" />
      <ToolButton title="Danh sách gạch đầu dòng" active={s.bullet} onClick={() => c().toggleBulletList().run()}>
        • ≡
      </ToolButton>
      <ToolButton title="Danh sách đánh số" active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        1. ≡
      </ToolButton>
      <ToolButton title="Trích dẫn" active={s.quote} onClick={() => c().toggleBlockquote().run()}>
        ❝
      </ToolButton>
      <ToolButton title="Khối mã" active={s.code} onClick={() => c().toggleCodeBlock().run()}>
        {'</>'}
      </ToolButton>
      <span className="rt-sep" />
      <ToolButton
        title="Chèn / sửa liên kết"
        active={s.link || linkDraft !== null}
        onClick={() => setLinkDraft(linkDraft === null ? (editor.getAttributes('link').href ?? '') : null)}
      >
        🔗
      </ToolButton>
      <ToolButton title="Chèn ảnh" onClick={onImage}>
        🖼
      </ToolButton>
      <ToolButton
        title="Chèn bảng 3×3"
        active={s.table}
        onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        ▦
      </ToolButton>
      {s.table && (
        <span className="rt-table-tools">
          <ToolButton title="Thêm dòng bên dưới" onClick={() => c().addRowAfter().run()}>
            +dòng
          </ToolButton>
          <ToolButton title="Thêm cột bên phải" onClick={() => c().addColumnAfter().run()}>
            +cột
          </ToolButton>
          <ToolButton title="Xoá dòng" onClick={() => c().deleteRow().run()}>
            −dòng
          </ToolButton>
          <ToolButton title="Xoá cột" onClick={() => c().deleteColumn().run()}>
            −cột
          </ToolButton>
          <ToolButton title="Xoá bảng" onClick={() => c().deleteTable().run()}>
            ✕ bảng
          </ToolButton>
        </span>
      )}
      <span className="rt-sep" />
      {linkDraft !== null && (
        <span className="rt-link-box">
          <input
            type="url"
            aria-label="Địa chỉ liên kết"
            placeholder="https://…"
            value={linkDraft}
            autoFocus
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setLinkDraft(null);
              }
            }}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={applyLink}>
            Áp dụng
          </button>
          {s.link && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => (c().extendMarkRange('link').unsetLink().run(), setLinkDraft(null))}
            >
              Bỏ link
            </button>
          )}
        </span>
      )}
      <ToolButton title="Hoàn tác (Ctrl+Z)" disabled={!s.canUndo} onClick={() => c().undo().run()}>
        ↶
      </ToolButton>
      <ToolButton title="Làm lại (Ctrl+Y)" disabled={!s.canRedo} onClick={() => c().redo().run()}>
        ↷
      </ToolButton>
    </div>
  );
}

/** Trình soạn thảo nội dung: định dạng chữ, tiêu đề, danh sách đánh số, bảng, ảnh, liên kết */
export default function RichTextEditor({ id, value, onChange, placeholder }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const editorRef = useRef(null);

  const insertImages = async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMAGE) {
        toast(`Ảnh "${file.name}" vượt quá ${Math.round(MAX_IMAGE / 1024)} KB`, 'error');
        continue;
      }
      const src = await readDataUrl(file);
      editorRef.current?.chain().focus().setImage({ src, alt: file.name }).run();
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] } }),
      Image.configure({ allowBase64: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: placeholder ?? 'Nhập nội dung…' }),
    ],
    content: toHtml(value),
    editorProps: {
      attributes: { class: 'rich-content rt-content', id, 'aria-multiline': 'true', role: 'textbox' },
      // Dán / kéo thả ảnh trực tiếp vào nội dung
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        insertImages(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        insertImages(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });
  editorRef.current = editor;

  // Cập nhật khi giá trị bên ngoài thay đổi (VD mở form sửa bản ghi khác)
  useEffect(() => {
    if (!editor) return;
    const html = toHtml(value);
    if (html !== editor.getHTML() && !(editor.isEmpty && !html))
      editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;
  return (
    <div className="rt-editor">
      <Toolbar editor={editor} onImage={() => fileRef.current?.click()} />
      <EditorContent editor={editor} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          insertImages([...e.target.files]);
          e.target.value = '';
        }}
      />
      <div className="rt-hint muted small">
        Dán (Ctrl+V) hoặc kéo thả ảnh vào nội dung · ảnh tối đa {Math.round(MAX_IMAGE / 1024)} KB
      </div>
    </div>
  );
}
