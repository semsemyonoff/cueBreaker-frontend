import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Backend origin the dev server proxies /api to. Defaults to a locally running
// backend; set BACKEND_URL to point elsewhere (e.g. a backend container).
const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000'

// Extra Host headers the dev server will answer to (comma-separated). Vite blocks
// unknown Hosts (DNS-rebinding protection); the value is supplied by the runtime
// env, never hardcoded here — e.g. DEV_ALLOWED_HOSTS=frontend when the dev server
// is reached by container name. Empty by default; `localhost` is always allowed.
const ALLOWED_HOSTS = (process.env.DEV_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ALLOWED_HOSTS,
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
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/setupTests.ts',
        'src/vite-env.d.ts',
        // Bootstrap only; no test mounts it, so it is permanently uncovered.
        'src/main.tsx',
      ],
    },
  },
})
