import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'standalone' ? './' : '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: mode === 'standalone' ? 1100 : 800,
    rolldownOptions: mode === 'standalone' ? { output: { codeSplitting: false } } : undefined,
  },
  server: { port: 4173, strictPort: true },
  preview: { port: 4174, strictPort: true },
}))
