import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Tam çözünürlüklü taramalar yerel indeksleme kaynağıdır. Site hero için
 * public/display/ türevlerini kullanır; kaynakları production paketinden çıkar.
 */
function excludeSourceScans() {
  return {
    name: 'exclude-source-scans',
    apply: 'build',
    async closeBundle() {
      await rm(resolve('dist', 'scans'), { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/metis-archive/',
  plugins: [react(), excludeSourceScans()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
})
