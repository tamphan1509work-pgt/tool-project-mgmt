// Shim tối thiểu của node:fs cho bản demo chạy trong trình duyệt
export const existsSync = () => false;
export const mkdirSync = () => {};
