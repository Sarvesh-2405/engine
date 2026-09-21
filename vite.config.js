import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',  // bind to all interfaces (fixes IPv4/IPv6 mismatch on Windows)
    open: true
  },
  build: {
    target: 'esnext'
  }
});
