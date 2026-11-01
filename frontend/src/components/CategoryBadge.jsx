import { useLookup } from '../context.jsx';
import { categoryTree } from '../categories.js';

/** Nhãn danh mục của một mục (hiện tên, rê chuột thấy đường dẫn đầy đủ) */
export default function CategoryBadge({ id, full = false }) {
  const { lookup } = useLookup();
  if (!id) return null;
  const c = categoryTree(lookup.categories).find((x) => x.id === id);
  if (!c) return null;
  return (
    <span className={`badge badge-${c.color} badge-category`} title={`Danh mục: ${c.path}`}>
      ▣ {full ? c.path : c.name}
    </span>
  );
}
