// Shim tối thiểu của node:path cho bản demo chạy trong trình duyệt
export const join = (...parts) => parts.filter(Boolean).join('/');
export const resolve = join;
export const dirname = (p) => String(p).split('/').slice(0, -1).join('/');
