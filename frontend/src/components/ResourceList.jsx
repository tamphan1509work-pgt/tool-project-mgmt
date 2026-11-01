import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { code, LABELS } from '../constants.js';
import { useAsync, useConfirm, useLookup, useProject, useToast } from '../context.jsx';
import CopyLinkButton from './CopyLink.jsx';
import EntityForm, { splitFiles } from './EntityForm.jsx';
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
            checked={params.get(f.name) === (f.value ?? 'true')}
            onChange={(e) => setParam(f.name, e.target.checked ? (f.value ?? 'true') : '')}
          />
          {f.label}
        </label>
      );
    }
    const opts = f.optionsFrom?.(lookup) ?? f.options ?? (lookup[f.source] ?? []).map((v) => ({ value: v, label: v }));
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

/** Nhãn lọc theo trạng thái kèm số lượng (bấm để lọc, bấm lại để bỏ lọc) */
export function StatusChips({ kind, counts, value, onChange }) {
  const entries = Object.entries(LABELS[kind]);
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  return (
    <div className="status-chips" role="group" aria-label="Lọc theo trạng thái">
      <button
        type="button"
        className={`status-chip ${value === '' ? 'active' : ''}`}
        onClick={() => onChange('')}
        aria-pressed={value === ''}
      >
        Tất cả <span className="chip-count">{total ?? '…'}</span>
      </button>
      {entries.map(([key, [text, tone]]) => {
        const n = counts?.[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            className={`status-chip tone-${tone} ${value === key ? 'active' : ''} ${counts && !n ? 'is-empty' : ''}`}
            onClick={() => onChange(value === key ? '' : key)}
            aria-pressed={value === key}
          >
            <span className={`dot seg-${tone}`} /> {text} <span className="chip-count">{counts ? n : '…'}</span>
          </button>
        );
      })}
    </div>
  );
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
  scoped = true, // dữ liệu thuộc dự án hiện tại
  persistentParams = [], // tham số URL không bị "Xoá bộ lọc" (VD tab loại tài liệu)
  codeOf = (row) => code(resource, row.id),
  nameOf = (row) => row.title,
  onChanged,
  onFiles, // (record, File[]) => Promise: tải file chọn trong form lên sau khi lưu
  rowActions, // (row) => JSX: nút thêm trên từng dòng
  reloadKey, // đổi giá trị để tải lại danh sách
  statusChips, // { field, kind }: nhãn lọc trạng thái kèm số lượng phía trên danh sách
}) {
  const [params, setParam, setParams] = useParamSetter();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshLookup } = useLookup();
  const { projectId } = useProject();
  const [editing, setEditing] = useState(null); // null | 'new' | bản ghi đầy đủ

  const page = Math.max(Number(params.get('page')) || 1, 1);
  const query = Object.fromEntries(params);
  delete query.page;
  delete query.view;
  if (scoped) query.project_id = projectId;
  if (statusChips) query.counts = statusChips.field;
  const key = params.toString();

  const { data, loading, error, reload } = useAsync(
    () => api.list(resource, { ...query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [resource, key, scoped && projectId, reloadKey],
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

  const changed = () => {
    reload();
    refreshLookup();
    onChanged?.();
  };

  // Lấy bản ghi đầy đủ (kèm liên kết như document_ids) trước khi mở form sửa
  const startEdit = async (row) => {
    try {
      setEditing(await api.get(resource, row.id));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const save = async (values) => {
    const [payload, files] = splitFiles(formFields, values);
    let record;
    if (editing === 'new') {
      record = await api.create(resource, scoped ? { ...payload, project_id: projectId } : payload);
      toast(`Đã tạo ${codeOf(record)}`);
    } else {
      record = await api.update(resource, editing.id, payload);
      toast(`Đã cập nhật ${codeOf(record)}`);
    }
    if (files.length && onFiles) await onFiles(record, files);
    setEditing(null);
    changed();
  };

  const remove = async (row) => {
    if (!(await confirm(`Xoá ${codeOf(row)} "${nameOf(row)}"?`))) return;
    try {
      await api.remove(resource, row.id);
      toast(`Đã xoá ${codeOf(row)}`);
      changed();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const keep = ['page', 'sort', 'order', 'view', ...persistentParams];
  const hasFilter = [...params.keys()].some((k) => !keep.includes(k));
  const offset = data?.offset ?? 0;

  return (
    <>
      {statusChips && (
        <StatusChips
          kind={statusChips.kind}
          counts={data?.counts}
          value={params.get(statusChips.field) ?? ''}
          onChange={(v) => setParam(statusChips.field, v)}
        />
      )}
      <div className="toolbar">
        <SearchBox value={params.get('q') ?? ''} onChange={(v) => setParam('q', v)} placeholder={searchPlaceholder} />
        <Filters filters={filters} params={params} setParam={setParam} />
        {hasFilter && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setParams((prev) => {
                const next = new URLSearchParams();
                for (const k of ['sort', 'order', 'view', ...persistentParams])
                  if (prev.get(k)) next.set(k, prev.get(k));
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
                  <th className="col-stt">STT</th>
                  <th style={{ width: 96 }}>Mã</th>
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
                  <th style={{ width: rowActions ? 148 : 116 }} />
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, i) => (
                  <tr key={row.id} onClick={() => navigate(`/${resource}/${row.id}`)} className="clickable">
                    <td className="col-stt">{offset + i + 1}</td>
                    <td className="mono">
                      <Link to={`/${resource}/${row.id}`} onClick={(e) => e.stopPropagation()}>
                        {codeOf(row)}
                      </Link>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.className}>
                        {c.render ? c.render(row) : row[c.key]}
                      </td>
                    ))}
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      {rowActions?.(row)}
                      <CopyLinkButton compact resource={resource} id={row.id} label={codeOf(row)} />
                      <button className="icon-btn" title="Sửa" onClick={() => startEdit(row)}>
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
          title={editing === 'new' ? `Thêm ${noun}` : `Sửa ${codeOf(editing)}`}
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
