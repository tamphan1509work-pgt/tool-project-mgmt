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
    if (!(await confirm('Xoá bình luận này?'))) return;
    try {
      await api.removeComment(c.id);
      changed();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const onKey = (e, submit) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
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
          {data.map((c) => {
            const mine = c.member_id === user?.id;
            return (
              <li key={c.id} className={`comment ${mine ? 'is-mine' : ''}`}>
                <Avatar name={c.author_name} src={c.author_avatar} size={34} />
                <div className="comment-main">
                  <div className="comment-head">
                    <strong title={c.author_email ?? ''}>{c.author_name}</strong>
                    <span className="muted small">
                      {fmtDateTime(c.created_at)}
                      {c.updated_at && ` · đã sửa ${fmtDateTime(c.updated_at)}`}
                    </span>
                    <span className="comment-actions">
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
                    <div className="comment-body">{c.body}</div>
                  )}
                </div>
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
