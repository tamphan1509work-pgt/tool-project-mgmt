// Tiện ích cho danh mục dạng cây (danh mục cha / con) trong một dự án

export const CATEGORY_COLORS = [
  { value: 'blue', label: 'Xanh dương' },
  { value: 'green', label: 'Xanh lá' },
  { value: 'purple', label: 'Tím' },
  { value: 'amber', label: 'Cam' },
  { value: 'red', label: 'Đỏ' },
  { value: 'gray', label: 'Xám' },
];

/**
 * Sắp xếp danh mục theo cây (cha trước, con ngay sau), kèm depth, path ("Cha › Con")
 * và danh sách id con cháu (descendants).
 */
export function categoryTree(list = []) {
  const byParent = new Map();
  const ids = new Set(list.map((c) => c.id));
  for (const c of list) {
    const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const out = [];
  const walk = (parentId, depth, prefix) => {
    for (const c of byParent.get(parentId) ?? []) {
      const path = prefix ? `${prefix} › ${c.name}` : c.name;
      const node = { ...c, depth, path, descendants: [] };
      out.push(node);
      const start = out.length;
      walk(c.id, depth + 1, path);
      node.descendants = out.slice(start).map((d) => d.id);
    }
  };
  walk(null, 0, '');
  return out;
}

export const findCategory = (list, id) => categoryTree(list).find((c) => c.id === id) ?? null;

/** Bộ lọc "Danh mục" cho các danh sách (lọc theo danh mục gồm cả danh mục con) */
export const categoryFilter = {
  name: 'category_id',
  label: 'Danh mục',
  optionsFrom: (lookup) => [
    ...categoryTree(lookup.categories).map((c) => ({
      value: String(c.id),
      label: `${'  '.repeat(c.depth)}${c.depth ? '└ ' : ''}${c.name}`,
    })),
    { value: 'none', label: '(Chưa phân loại)' },
  ],
};
