import { defineConfig } from 'vite';
import dotenv from 'dotenv';

dotenv.config(); // Carga .env manualmente

export default defineConfig({
  root: './',
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',      
        login: 'login.html',     
        dashboard: 'dashboard.html',
        notfound: '404.html'
      },
    },
  },
});
