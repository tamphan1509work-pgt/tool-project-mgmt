import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const shim = (name) => fileURLToPath(new URL(`./src/demo/shims/${name}.js`, import.meta.url));

export default defineConfig(({ mode }) => {
  // "npm run build:demo": đóng gói cả backend vào trình duyệt (không cần máy chủ)
  const demo = mode === 'demo';
  return {
    plugins: [react()],
    build: {
      target: 'es2022',
      outDir: demo ? 'dist-demo' : 'dist',
      rollupOptions: demo ? { output: { inlineDynamicImports: true } } : undefined,
    },
    resolve: demo
      ? {
          alias: {
            express: shim('express'),
            'node:sqlite': shim('node-sqlite'),
            'node:fs': shim('node-fs'),
            'node:path': shim('node-path'),
            'node:url': shim('node-url'),
          },
        }
      : undefined,
    define: demo ? { 'process.argv': '[]', 'process.env.DB_FILE': 'undefined' } : undefined,
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${process.env.API_PORT || 3001}`,
      },
    },
  };
});
