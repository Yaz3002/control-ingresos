import { defineConfig } from 'vite';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  root: 'src',
  base: '/control-ingresos/',
  build: {
    outDir: '../dist',
    emptyOutDir: true, 
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        login: resolve(__dirname, 'src/login.html'),
        dashboard: resolve(__dirname, 'src/dashboard.html'),
        notFound: resolve(__dirname, 'src/404.html'),
      },
    },
  },
});
