import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { categoryTree } from '../categories.js';
import EntityForm from '../components/EntityForm.jsx';
import { Empty, ErrorBox, Icon, Loading, Modal } from '../components/ui.jsx';
import { useAuth } from '../auth.jsx';
import { useAsync, useConfirm, useLookup, useProject, useToast } from '../context.jsx';
import { categoryFields } from '../forms.js';

const COUNTS = [
  { key: 'task_count', label: 'Task', to: '/tasks' },
  { key: 'test_case_count', label: 'Test case', to: '/test-cases' },
  { key: 'bug_count', label: 'Bug', to: '/bugs' },
  { key: 'document_count', label: 'Tài liệu', to: '/documents' },
];

/** Quản lý danh mục (cây danh mục cha / con) của một dự án — tab "Danh mục" trong chi tiết dự án */
export function CategoryList({ project }) {
  const projectId = project.id;
  const { setProjectId } = useProject();
  const isAdmin = Boolean(useAuth().user?.is_admin);
  const { refreshLookup } = useLookup();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null); // null | { parent_id } (tạo mới) | bản ghi
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useAsync(
    () => api.list('categories', { project_id: projectId, limit: 500 }),
    [projectId],
  );

  const tree = categoryTree(data?.items ?? []);
  const byId = new Map(tree.map((c) => [c.id, c]));
  // Tổng số mục của danh mục gồm cả danh mục con
  const total = (c, key) => [c.id, ...c.descendants].reduce((n, id) => n + (byId.get(id)?.[key] ?? 0), 0);
  const match = (c) => !q || c.path.toLowerCase().includes(q.toLowerCase());
  const shown = tree.filter((c) => match(c) || c.descendants.some((d) => match(byId.get(d))));

  const save = async (values) => {
    if (editing.id) {
      await api.update('categories', editing.id, values);
      toast(`Đã cập nhật danh mục "${values.name}"`);
    } else {
      await api.create('categories', { ...values, project_id: projectId });
      toast(`Đã tạo danh mục "${values.name}"`);
    }
    setEditing(null);
    reload();
    refreshLookup();
  };

  const remove = async (c) => {
    const items = COUNTS.reduce((n, k) => n + (c[k.key] ?? 0), 0);
    const msg = [
      `Xoá danh mục "${c.path}"?`,
      items ? `${items} mục trong danh mục sẽ chuyển thành "Chưa phân loại".` : '',
      c.descendants.length ? `Các danh mục con sẽ được chuyển lên cấp gốc.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (!(await confirm(msg))) return;
    try {
      await api.remove('categories', c.id);
      toast(`Đã xoá danh mục "${c.name}"`);
      reload();
      refreshLookup();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <p className="page-intro muted">
        Danh mục giúp phân nhóm task, test case, bug và tài liệu của dự án <strong>{project.name}</strong>. Danh mục có
        thể có danh mục con; lọc theo một danh mục sẽ gồm cả các danh mục con.
      </p>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Tìm danh mục…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="spacer" />
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Icon name="plus" /> Thêm danh mục
          </button>
        )}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : tree.length === 0 ? (
        <Empty>Dự án chưa có danh mục nào. Bấm "Thêm danh mục" để tạo danh mục đầu tiên.</Empty>
      ) : shown.length === 0 ? (
        <Empty>Không có danh mục phù hợp.</Empty>
      ) : (
        <div className="card table-wrap">
          <table className="table category-table">
            <thead>
              <tr>
                <th className="col-stt">STT</th>
                <th>Danh mục</th>
                {COUNTS.map((k) => (
                  <th key={k.key} className="num" style={{ width: 90 }}>
                    {k.label}
                  </th>
                ))}
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {shown.map((c, i) => (
                <tr key={c.id}>
                  <td className="col-stt">{i + 1}</td>
                  <td>
                    <div className="category-name" style={{ paddingLeft: c.depth * 22 }}>
                      {c.depth > 0 && <span className="tree-branch">└</span>}
                      <span className={`cat-dot seg-${c.color}`} />
                      <span>
                        <strong>{c.name}</strong>
                        {c.description && <span className="muted small category-desc">{c.description}</span>}
                      </span>
                    </div>
                  </td>
                  {COUNTS.map((k) => {
                    const n = total(c, k.key);
                    return (
                      <td key={k.key} className="num">
                        {n ? (
                          <Link
                            to={`${k.to}?category_id=${c.id}`}
                            onClick={() => setProjectId(projectId)}
                            title={`Xem ${k.label.toLowerCase()} trong danh mục`}
                          >
                            {n}
                          </Link>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="row-actions">
                    {isAdmin && (<>
                    <button
                      className="icon-btn"
                      title="Thêm danh mục con"
                      onClick={() => setEditing({ parent_id: c.id })}
                    >
                      <Icon name="plus" size={16} />
                    </button>
                    <button className="icon-btn" title="Sửa" onClick={() => setEditing(c)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button className="icon-btn danger" title="Xoá" onClick={() => remove(c)}>
                      <Icon name="trash" size={16} />
                    </button>
                    </>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal
          title={
            editing.id
              ? `Sửa danh mục "${editing.name}"`
              : editing.parent_id
                ? `Thêm danh mục con của "${byId.get(editing.parent_id)?.path}"`
                : 'Thêm danh mục'
          }
          onClose={() => setEditing(null)}
        >
          <EntityForm
            fields={categoryFields}
            initial={editing}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            submitLabel={editing.id ? 'Lưu thay đổi' : 'Tạo danh mục'}
          />
        </Modal>
      )}
    </>
  );
}
