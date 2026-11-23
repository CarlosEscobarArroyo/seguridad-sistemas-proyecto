import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El backend ADK (FastAPI) corre en el puerto 8000; el proxy evita problemas de CORS.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/chatkit': backend,
      '/api': backend,
      '/apps': backend,
      '/run_sse': backend,
    },
  },
})
