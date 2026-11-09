import { readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { unpublishedYears } from './src/data/unpublishedYears.js'

/**
 * Tam çözünürlüklü taramalar yerel indeksleme kaynağıdır. Site hero için
 * public/display/ türevlerini kullanır; kaynakları production paketinden çıkar.
 * Ayrıca unpublishedYears görsellerini dist'e koymaz.
 */
function pruneDeployAssets() {
  return {
    name: 'prune-deploy-assets',
    apply: 'build',
    async closeBundle() {
      await rm(resolve('dist', 'scans'), { recursive: true, force: true })

      for (const folder of ['display', 'thumbs']) {
        const dir = resolve('dist', folder)
        let names = []
        try {
          names = await readdir(dir)
        } catch {
          continue
        }
        await Promise.all(
          names
            .filter((name) =>
              unpublishedYears.some(
                (year) => name === `${year}.png` || name.startsWith(`${year}-`),
              ),
            )
            .map((name) => rm(join(dir, name), { force: true })),
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/metis-archive/',
  plugins: [react(), pruneDeployAssets()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
})
