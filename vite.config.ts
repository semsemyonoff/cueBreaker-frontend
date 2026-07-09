import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Backend origin the dev server proxies /api to. Defaults to a locally running
// backend; in the DWE dev stack it is set to the backend container (see the
// workspace frontend compose overlay: BACKEND_URL=http://backend:5000).
const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000'

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': BACKEND,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/setupTests.ts', 'src/vite-env.d.ts'],
    },
  },
})
