import { useId, useState } from 'react';
import { useLookup } from '../context.jsx';
import { code } from '../constants.js';

const REF_RESOURCE = { meetings: 'meetings', tasks: 'tasks', testCases: 'test-cases' };

function FieldInput({ field, value, onChange, id, lookup }) {
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
      const items = lookup[field.source] ?? [];
      return (
        <select {...common}>
          <option value="">— Không liên kết —</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {code(REF_RESOURCE[field.source], it.id)} · {it.title}
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
    for (const f of fields) v[f.name] = initial[f.name] ?? f.default ?? '';
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
      data[f.name] = v === '' ? null : f.type === 'ref' || f.type === 'number' ? Number(v) : v;
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
            <div key={f.name} className={`field ${f.full || f.type === 'textarea' ? 'field-full' : ''}`}>
              <label htmlFor={id}>
                {f.label}
                {f.required && <span className="req"> *</span>}
              </label>
              <FieldInput
                field={f}
                id={id}
                lookup={lookup}
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
