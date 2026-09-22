import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // face-api.js (e a TensorFlow.js por baixo dela) foram escritas pensando
  // em bundlers antigos (Webpack/CRA), que sempre definem `global`.
  // O Vite não define isso por padrão em produção, e sem ele uma parte
  // da biblioteca falha silenciosamente ao carregar. Essa linha resolve.
  define: {
    global: 'globalThis'
  },
  build: {
    outDir: 'dist'
  }
});
