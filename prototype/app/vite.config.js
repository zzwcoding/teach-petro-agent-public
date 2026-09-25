import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 单文件构建：JS/CSS 全内联进 index.html，保证 file:// 双击直开（ADR-0001 承诺）
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 100000000
  }
})
