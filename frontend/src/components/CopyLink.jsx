import { useState } from 'react';
import { useToast } from '../context.jsx';
import { copyText, itemLink } from '../links.js';
import { Icon, Modal } from './ui.jsx';

/**
 * Nút "Copy link" của một mục. Sao chép link vào clipboard; nếu trình duyệt chặn,
 * hiện hộp chứa link đã bôi đen để người dùng tự sao chép.
 */
export default function CopyLinkButton({ resource, id, label, compact = false }) {
  const toast = useToast();
  const [manual, setManual] = useState(null);

  const copy = async (e) => {
    e.stopPropagation();
    const link = itemLink(resource, id);
    if (await copyText(link)) toast(`Đã copy link ${label ?? ''}`.trim());
    else setManual(link);
  };

  return (
    <>
      {compact ? (
        <button className="icon-btn" title="Copy link" aria-label="Copy link" onClick={copy}>
          <Icon name="link" size={16} />
        </button>
      ) : (
        <button className="btn" onClick={copy}>
          <Icon name="link" size={16} /> Copy link
        </button>
      )}
      {manual && (
        <Modal title="Link chia sẻ" onClose={() => setManual(null)}>
          <p className="confirm-text">Trình duyệt không cho tự sao chép. Hãy chọn và sao chép link dưới đây:</p>
          <input
            className="share-input"
            readOnly
            value={manual}
            autoFocus
            onFocus={(e) => e.target.select()}
            onClick={(e) => e.stopPropagation()}
          />
        </Modal>
      )}
    </>
  );
}
