import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDateTime } from '../constants.js';
import { useAsync, useLookup, useToast } from '../context.jsx';
import { Avatar } from './Avatar.jsx';
import MentionTextarea from './MentionTextarea.jsx';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Bình luận giữa các thành viên dự án trên một task / test case / bug.
 * entity: 'tasks' | 'test-cases' | 'bugs'
 * Bình luận không sửa / xoá được; có thể trả lời và @nhắc tên thành viên (người đó nhận thông báo).
 */
export default function Comments({ entity, id, onChanged }) {
  const { user } = useAuth();
  const { lookup } = useLookup();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { rootId, name, body }
  const { data, error, reload } = useAsync(() => api.comments({ entity, entity_id: id }), [entity, id]);
  const people = lookup.members;
  const canComment = user?.is_admin || people.some((m) => m.id === user?.id);

  const post = async (body, parentId) => {
    setBusy(true);
    try {
      const c = await api.addComment({ entity, entity_id: id, body, parent_id: parentId ?? undefined });
      if (c.mentioned?.length) toast(`Đã gửi thông báo cho ${c.mentioned.map((m) => m.name).join(', ')}`);
      reload();
      onChanged?.();
      return true;
    } catch (err) {
      toast(Object.values(err.details ?? {})[0] ?? err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (draft.trim() && (await post(draft))) setDraft('');
  };
  const sendReply = async () => {
    if (replyTo?.body.trim() && (await post(replyTo.body, replyTo.rootId))) setReplyTo(null);
  };

  const startReply = (c) => {
    // Trả lời người khác: gắn sẵn @tên để người đó nhận được thông báo
    const mention = c.member_id !== user?.id && people.some((p) => p.id === c.member_id) ? `@${c.author_name} ` : '';
    setReplyTo({ rootId: c.parent_id ?? c.id, name: c.author_name, body: mention });
  };

  const ids = new Set((data ?? []).map((c) => c.id));
  // Bình luận gốc + các trả lời (trả lời mất gốc thì hiện như bình luận gốc)
  const roots = (data ?? []).filter((c) => !c.parent_id || !ids.has(c.parent_id));
  const repliesOf = (rootId) => (data ?? []).filter((c) => c.parent_id === rootId);

  // Tô màu các "@Tên" của thành viên (tên dài khớp trước)
  const names = [...new Set(lookup.allMembers.map((m) => m.name))].sort((a, b) => b.length - a.length);
  const mentionRe = names.length ? new RegExp(`(@(?:${names.map(escapeRe).join('|')}))`, 'g') : null;
  const renderBody = (text) =>
    mentionRe
      ? text.split(mentionRe).map((part, i) =>
          i % 2 === 1 ? (
            <span key={i} className={`mention ${part === `@${user?.name}` ? 'is-me' : ''}`}>
              {part}
            </span>
          ) : (
            part
          ),
        )
      : text;

  const composer = (props) => (
    <MentionTextarea people={people} excludeId={user?.id} {...props} />
  );

  const renderComment = (c, isReply) => (
    <div className={`comment ${c.member_id === user?.id ? 'is-mine' : ''} ${isReply ? 'is-reply' : ''}`}>
      <Avatar name={c.author_name} src={c.author_avatar} size={isReply ? 28 : 34} />
      <div className="comment-main">
        <div className="comment-head">
          <strong title={c.author_email ?? ''}>{c.author_name}</strong>
          <span className="muted small">{fmtDateTime(c.created_at)}</span>
          {canComment && (
            <span className="comment-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => startReply(c)}>
                Trả lời
              </button>
            </span>
          )}
        </div>
        <div className="comment-body">{renderBody(c.body)}</div>
      </div>
    </div>
  );

  return (
    <section className="card section comments">
      {error && <div className="error-box">{error.message}</div>}
      {!data ? (
        <div className="muted">Đang tải…</div>
      ) : data.length === 0 ? (
        <div className="muted">Chưa có bình luận nào. Hãy là người đầu tiên!</div>
      ) : (
        <ul className="comment-list">
          {roots.map((c) => {
            const replies = repliesOf(c.id);
            const replying = replyTo?.rootId === c.id;
            return (
              <li key={c.id} className="comment-thread">
                {renderComment(c, false)}
                {(replies.length > 0 || replying) && (
                  <ul className="comment-replies">
                    {replies.map((r) => (
                      <li key={r.id}>{renderComment(r, true)}</li>
                    ))}
                    {replying && (
                      <li className="comment-reply-box">
                        <Avatar name={user?.name} src={user?.avatar} size={28} />
                        <div className="comment-composer-main">
                          <div className="muted small">
                            Trả lời <strong>{replyTo.name}</strong>
                          </div>
                          {composer({
                            rows: 2,
                            autoFocus: true,
                            'aria-label': `Trả lời ${replyTo.name}`,
                            placeholder: 'Viết trả lời… (@ để nhắc tên, Ctrl + Enter để gửi)',
                            value: replyTo.body,
                            onChange: (body) => setReplyTo((r) => ({ ...r, body })),
                            onSubmit: sendReply,
                            onCancel: () => setReplyTo(null),
                            onFocus: (e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length),
                          })}
                          <div className="comment-edit-actions">
                            <button className="btn btn-sm" onClick={() => setReplyTo(null)}>
                              Huỷ
                            </button>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={sendReply}
                              disabled={busy || !replyTo.body.trim()}
                            >
                              Gửi trả lời
                            </button>
                          </div>
                        </div>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canComment ? (
        <div className="comment-composer">
          <Avatar name={user?.name} src={user?.avatar} size={34} />
          <div className="comment-composer-main">
            {composer({
              rows: 3,
              placeholder: 'Viết bình luận… Gõ @ để nhắc tên thành viên (Ctrl + Enter để gửi)',
              'aria-label': 'Viết bình luận',
              value: draft,
              onChange: setDraft,
              onSubmit: send,
            })}
            <div className="comment-edit-actions">
              <span className="muted small comment-hint">
                Người được @nhắc tên sẽ nhận thông báo trên web và qua email. Bình luận đã gửi không sửa / xoá được.
              </span>
              <button className="btn btn-primary" onClick={send} disabled={busy || !draft.trim()}>
                Gửi bình luận
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="muted small comment-note">Chỉ thành viên của dự án mới bình luận được.</div>
      )}
    </section>
  );
}
