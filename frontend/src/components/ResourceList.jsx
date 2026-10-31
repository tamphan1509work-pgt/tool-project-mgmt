import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { code } from '../constants.js';
import { useAsync, useConfirm, useLookup, useToast } from '../context.jsx';
import EntityForm from './EntityForm.jsx';
import { Empty, ErrorBox, Icon, Loading, Modal, Pagination } from './ui.jsx';

const PAGE_SIZE = 20;

/** Ô tìm kiếm có debounce, đồng bộ với URL */
export function SearchBox({ value, onChange, placeholder }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <input
      type="search"
      className="search"
      placeholder={placeholder ?? 'Tìm kiếm…'}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

/** Thanh lọc: select theo enum hoặc checkbox bật/tắt; giá trị lưu trên URL */
export function Filters({ filters, params, setParam }) {
  const { lookup } = useLookup();
  return filters.map((f) => {
    if (f.type === 'toggle') {
      return (
        <label key={f.name} className="toggle">
          <input
            type="checkbox"
            checked={params.get(f.name) === 'true'}
            onChange={(e) => setParam(f.name, e.target.checked ? 'true' : '')}
          />
          {f.label}
        </label>
      );
    }
    const opts = f.options ?? (lookup[f.source] ?? []).map((v) => ({ value: v, label: v }));
    return (
      <select
        key={f.name}
        aria-label={f.label}
        value={params.get(f.name) ?? ''}
        onChange={(e) => setParam(f.name, e.target.value)}
      >
        <option value="">{f.label}: Tất cả</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  });
}

export function useParamSetter() {
  const [params, setParams] = useSearchParams();
  const setParam = (name, value, { keepPage = false } = {}) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === '' || value == null) next.delete(name);
        else next.set(name, value);
        if (!keepPage && name !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  return [params, setParam, setParams];
}

/**
 * Trang danh sách chung: tìm kiếm, lọc, sắp xếp, phân trang, tạo/sửa/xoá trong modal.
 */
export default function ResourceList({
  resource,
  noun,
  columns,
  filters = [],
  formFields,
  defaultValues,
  searchPlaceholder,
  headerExtra,
  formatCreate,
}) {
  const [params, setParam, setParams] = useParamSetter();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshLookup } = useLookup();
  const [editing, setEditing] = useState(null); // null | 'new' | row

  const page = Math.max(Number(params.get('page')) || 1, 1);
  const query = Object.fromEntries(params);
  delete query.page;
  delete query.view;
  const key = params.toString();

  const { data, loading, error, reload } = useAsync(
    () => api.list(resource, { ...query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [resource, key],
  );

  const sort = params.get('sort');
  const order = params.get('order');
  const toggleSort = (col) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (sort === col) next.set('order', order === 'asc' ? 'desc' : 'asc');
        else {
          next.set('sort', col);
          next.set('order', 'desc');
        }
        return next;
      },
      { replace: true },
    );
  };

  const save = async (values) => {
    if (editing === 'new') {
      const created = await api.create(resource, formatCreate ? formatCreate(values) : values);
      toast(`Đã tạo ${code(resource, created.id)}`);
    } else {
      await api.update(resource, editing.id, values);
      toast(`Đã cập nhật ${code(resource, editing.id)}`);
    }
    setEditing(null);
    reload();
    refreshLookup();
  };

  const remove = async (row) => {
    if (!(await confirm(`Xoá ${code(resource, row.id)} "${row.title}"?`))) return;
    try {
      await api.remove(resource, row.id);
      toast(`Đã xoá ${code(resource, row.id)}`);
      reload();
      refreshLookup();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const hasFilter = [...params.keys()].some((k) => !['page', 'sort', 'order', 'view'].includes(k));

  return (
    <>
      <div className="toolbar">
        <SearchBox value={params.get('q') ?? ''} onChange={(v) => setParam('q', v)} placeholder={searchPlaceholder} />
        <Filters filters={filters} params={params} setParam={setParam} />
        {hasFilter && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setParams((prev) => {
                const next = new URLSearchParams();
                for (const k of ['sort', 'order', 'view']) if (prev.get(k)) next.set(k, prev.get(k));
                return next;
              })
            }
          >
            Xoá bộ lọc
          </button>
        )}
        <div className="spacer" />
        {headerExtra}
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Thêm {noun}
        </button>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <Empty>{hasFilter ? 'Không có kết quả phù hợp với bộ lọc.' : `Chưa có ${noun} nào. Hãy tạo mới!`}</Empty>
      ) : (
        data && (
          <div className={`card table-wrap ${loading ? 'is-loading' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Mã</th>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: c.width }}
                      className={c.sort ? 'sortable' : ''}
                      onClick={c.sort ? () => toggleSort(c.sort) : undefined}
                      aria-sort={sort === c.sort ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {c.title}
                      {c.sort && sort === c.sort && <span className="sort-ind">{order === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                  <th style={{ width: 84 }} />
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} onClick={() => navigate(`/${resource}/${row.id}`)} className="clickable">
                    <td className="mono">
                      <Link to={`/${resource}/${row.id}`} onClick={(e) => e.stopPropagation()}>
                        {code(resource, row.id)}
                      </Link>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.className}>
                        {c.render ? c.render(row) : row[c.key]}
                      </td>
                    ))}
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title="Sửa" onClick={() => setEditing(row)}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button className="icon-btn danger" title="Xoá" onClick={() => remove(row)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {data && (
        <Pagination
          total={data.total}
          limit={PAGE_SIZE}
          offset={data.offset}
          onChange={(p) => setParam('page', String(p), { keepPage: true })}
        />
      )}

      {editing && (
        <Modal
          wide
          title={editing === 'new' ? `Thêm ${noun}` : `Sửa ${code(resource, editing.id)}`}
          onClose={() => setEditing(null)}
        >
          <EntityForm
            fields={formFields}
            initial={editing === 'new' ? defaultValues : editing}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            submitLabel={editing === 'new' ? 'Tạo mới' : 'Lưu thay đổi'}
          />
        </Modal>
      )}
    </>
  );
}
