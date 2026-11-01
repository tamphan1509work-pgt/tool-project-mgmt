import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDateTime } from '../constants.js';
import { useAsync, useConfirm, useLookup, useToast } from '../context.jsx';
import { Avatar } from './Avatar.jsx';

/**
 * Bình luận giữa các thành viên dự án trên một task / test case / bug.
 * entity: 'tasks' | 'test-cases' | 'bugs'
 */
export default function Comments({ entity, id, onChanged }) {
  const { user } = useAuth();
  const { lookup } = useLookup();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, body }
  const [replyTo, setReplyTo] = useState(null); // { rootId, name, body }
  const { data, error, reload } = useAsync(() => api.comments({ entity, entity_id: id }), [entity, id]);
  const canComment = user?.is_admin || lookup.members.some((m) => m.id === user?.id);

  const changed = () => {
    reload();
    onChanged?.();
  };

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.addComment({ entity, entity_id: id, body: draft });
      setDraft('');
      changed();
    } catch (err) {
      toast(Object.values(err.details ?? {})[0] ?? err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    try {
      await api.updateComment(editing.id, { body: editing.body });
      setEditing(null);
      reload();
    } catch (err) {
      toast(Object.values(err.details ?? {})[0] ?? err.message, 'error');
    }
  };

  const remove = async (c) => {
    const replies = (data ?? []).filter((x) => x.parent_id === c.id).length;
    const msg = replies ? `Xoá bình luận này và ${replies} trả lời?` : 'Xoá bình luận này?';
    if (!(await confirm(msg))) return;
    try {
      await api.removeComment(c.id);
      changed();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const startReply = (c) => {
    const rootId = c.parent_id ?? c.id;
    // Trả lời một câu trả lời của người khác: gắn sẵn @tên để rõ đang trả lời ai
    const mention = c.parent_id && c.member_id !== user?.id ? `@${c.author_name} ` : '';
    setReplyTo({ rootId, name: c.author_name, body: mention });
  };

  const sendReply = async () => {
    if (!replyTo?.body.trim()) return;
    setBusy(true);
    try {
      await api.addComment({ entity, entity_id: id, body: replyTo.body, parent_id: replyTo.rootId });
      setReplyTo(null);
      changed();
    } catch (err) {
      toast(Object.values(err.details ?? {})[0] ?? err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e, submit) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  const ids = new Set((data ?? []).map((c) => c.id));
  // Bình luận gốc + các trả lời (trả lời mất gốc thì hiện như bình luận gốc)
  const roots = (data ?? []).filter((c) => !c.parent_id || !ids.has(c.parent_id));
  const repliesOf = (rootId) => (data ?? []).filter((c) => c.parent_id === rootId);

  const renderBody = (text) => {
    const name = lookup.allMembers.find((m) => text.startsWith(`@${m.name}`))?.name;
    if (!name) return text;
    return (
      <>
        <span className="mention">@{name}</span>
        {text.slice(name.length + 1)}
      </>
    );
  };

  const renderComment = (c, isReply) => {
    const mine = c.member_id === user?.id;
    return (
      <div className={`comment ${mine ? 'is-mine' : ''} ${isReply ? 'is-reply' : ''}`}>
        <Avatar name={c.author_name} src={c.author_avatar} size={isReply ? 28 : 34} />
        <div className="comment-main">
          <div className="comment-head">
            <strong title={c.author_email ?? ''}>{c.author_name}</strong>
            <span className="muted small">
              {fmtDateTime(c.created_at)}
              {c.updated_at && ` · đã sửa ${fmtDateTime(c.updated_at)}`}
            </span>
            <span className="comment-actions">
              {canComment && (
                <button className="btn btn-ghost btn-sm" onClick={() => startReply(c)}>
                  Trả lời
                </button>
              )}
              {mine && editing?.id !== c.id && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: c.id, body: c.body })}>
                  Sửa
                </button>
              )}
              {(mine || user?.is_admin) && (
                <button className="btn btn-ghost btn-sm text-danger" onClick={() => remove(c)}>
                  Xoá
                </button>
              )}
            </span>
          </div>
          {editing?.id === c.id ? (
            <div className="comment-edit">
              <textarea
                rows={3}
                aria-label="Sửa bình luận"
                value={editing.body}
                autoFocus
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                onKeyDown={(e) => onKey(e, saveEdit)}
              />
              <div className="comment-edit-actions">
                <button className="btn btn-sm" onClick={() => setEditing(null)}>
                  Huỷ
                </button>
                <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editing.body.trim()}>
                  Lưu
                </button>
              </div>
            </div>
          ) : (
            <div className="comment-body">{renderBody(c.body)}</div>
          )}
        </div>
      </div>
    );
  };

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
                          <textarea
                            rows={2}
                            autoFocus
                            aria-label={`Trả lời ${replyTo.name}`}
                            placeholder="Viết trả lời… (Ctrl + Enter để gửi)"
                            value={replyTo.body}
                            onChange={(e) => setReplyTo({ ...replyTo, body: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setReplyTo(null);
                              onKey(e, sendReply);
                            }}
                            onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                          />
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
            <textarea
              rows={3}
              placeholder="Viết bình luận… (Ctrl + Enter để gửi)"
              aria-label="Viết bình luận"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => onKey(e, send)}
            />
            <div className="comment-edit-actions">
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
