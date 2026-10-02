import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works on GitHub Pages and on any host path.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  esbuild: {
    // No console output in production builds (rule 4.1.3).
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
});
