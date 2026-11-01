import { useId, useState } from 'react';
import { useLookup } from '../context.jsx';
import { code, label } from '../constants.js';
import { FilePicker } from './Attachments.jsx';
import { categoryTree } from '../categories.js';
import DocumentsField from './DocumentsField.jsx';

const REF_RESOURCE = {
  meetings: 'meetings',
  tasks: 'tasks',
  testCases: 'test-cases',
  documents: 'documents',
  milestones: 'milestones',
};

/** Chọn nhiều bản ghi liên kết (VD tài liệu cho task), nhóm theo loại */
function MultiRef({ field, value, onChange, lookup, id }) {
  const items = lookup[field.source] ?? [];
  const selected = new Set(value ?? []);
  const toggle = (itemId) => {
    const next = new Set(selected);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    onChange([...next]);
  };
  if (!items.length)
    return <div className="multiref-empty muted">{field.emptyText ?? 'Chưa có dữ liệu để liên kết'}</div>;
  const groups = field.groupBy
    ? Object.entries(
        items.reduce((acc, it) => {
          (acc[it[field.groupBy]] ??= []).push(it);
          return acc;
        }, {}),
      )
    : [['', items]];
  return (
    <div className="multiref" id={id} role="group">
      {groups.map(([group, list]) => (
        <div key={group} className="multiref-group">
          {group && <div className="multiref-group-title">{label(field.groupLabel, group)}</div>}
          {list.map((it) => (
            <label key={it.id} className="multiref-item">
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
              <span className="mono muted">{code(REF_RESOURCE[field.source], it.id)}</span>
              <span>
                {it.title}
                {it.version && <span className="muted"> · v{it.version}</span>}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function FieldInput({ field, value, onChange, id, lookup, record }) {
  const common = {
    id,
    name: field.name,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    required: field.required,
    placeholder: field.placeholder,
  };
  switch (field.type) {
    case 'textarea':
      return <textarea rows={field.rows ?? 4} {...common} />;
    case 'url':
      return <input type="url" inputMode="url" {...common} />;
    case 'category': {
      // Danh mục dạng cây; field.excludeSelf: không cho chọn chính nó / danh mục con (khi chọn danh mục cha)
      const tree = categoryTree(lookup.categories);
      const self = field.excludeSelf && record?.id ? tree.find((c) => c.id === record.id) : null;
      const blocked = new Set(self ? [self.id, ...self.descendants] : []);
      return (
        <select {...common}>
          <option value="">{field.emptyLabel ?? '— Chưa phân loại —'}</option>
          {tree
            .filter((c) => !blocked.has(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {'\u00a0\u00a0\u00a0'.repeat(c.depth)}
                {c.depth ? '└ ' : ''}
                {c.name}
              </option>
            ))}
        </select>
      );
    }
    case 'documents':
      return <DocumentsField id={id} value={value ?? []} onChange={onChange} />;
    case 'checkbox':
      return (
        <label className="toggle checkbox-field">
          <input
            type="checkbox"
            id={id}
            name={field.name}
            checked={Boolean(Number(value))}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.checkboxLabel}
        </label>
      );
    case 'files':
      return <FilePicker id={id} value={value ?? []} onChange={onChange} />;
    case 'multiref':
      return <MultiRef field={field} value={value} onChange={onChange} lookup={lookup} id={id} />;
    case 'date':
    case 'time':
      return <input type={field.type} {...common} />;
    case 'number':
      return <input type="number" min="0" step={field.step ?? 'any'} {...common} />;
    case 'select':
      return (
        <select {...common}>
          {!field.required && <option value="">—</option>}
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'ref': {
      const all = lookup[field.source] ?? [];
      // field.filter(item, record): lọc lựa chọn (VD task cha không được là chính nó / subtask)
      const items = field.filter
        ? all.filter((it) => field.filter(it, record) || String(it.id) === String(value))
        : all;
      return (
        <select {...common}>
          <option value="">— Không liên kết —</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {code(REF_RESOURCE[field.source], it.id)} · {it.title ?? it.name}
            </option>
          ))}
        </select>
      );
    }
    case 'person':
    case 'module': {
      const listId = `${id}-list`;
      const items = field.type === 'person' ? lookup.people : lookup.modules;
      return (
        <>
          <input type="text" list={listId} autoComplete="off" {...common} />
          <datalist id={listId}>
            {items.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </>
      );
    }
    default:
      return <input type="text" {...common} />;
  }
}

/**
 * Form chung cho tạo / sửa bản ghi.
 * fields: [{ name, label, type, required, options, source, full, rows, hint }]
 * onSubmit(data) trả về Promise; nếu lỗi ApiError có details thì hiển thị theo field.
 */
export default function EntityForm({ fields, initial = {}, onSubmit, onCancel, submitLabel = 'Lưu' }) {
  const { lookup } = useLookup();
  const baseId = useId();
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of fields)
      v[f.name] = initial[f.name] ?? f.default ?? (['multiref', 'files', 'documents'].includes(f.type) ? [] : '');
    return v;
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError('');
    const data = {};
    for (const f of fields) {
      const v = values[f.name];
      if (['multiref', 'files', 'documents'].includes(f.type)) {
        data[f.name] = v ?? [];
        continue;
      }
      data[f.name] = v === '' ? null : ['ref', 'number', 'category'].includes(f.type) ? Number(v) : v;
    }
    try {
      await onSubmit(data);
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-grid">
        {fields.map((f) => {
          const id = `${baseId}-${f.name}`;
          return (
            <div
              key={f.name}
              className={`field ${f.full || ['textarea', 'multiref', 'files', 'documents'].includes(f.type) ? 'field-full' : ''}`}
            >
              <label htmlFor={id}>
                {f.label}
                {f.required && <span className="req"> *</span>}
              </label>
              <FieldInput
                field={f}
                id={id}
                lookup={lookup}
                record={initial}
                value={values[f.name]}
                onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
              />
              {errors[f.name] ? (
                <div className="field-error">{errors[f.name]}</div>
              ) : (
                f.hint && <div className="hint">{f.hint}</div>
              )}
            </div>
          );
        })}
      </div>
      {formError && <div className="error-box">{formError}</div>}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Huỷ
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Đang lưu…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Tách các field kiểu 'files' (File[] chờ tải lên) ra khỏi dữ liệu gửi API */
export function splitFiles(fields, values) {
  const payload = { ...values };
  const files = [];
  for (const f of fields) {
    if (f.type !== 'files') continue;
    files.push(...(payload[f.name] ?? []));
    delete payload[f.name];
  }
  return [payload, files];
}
