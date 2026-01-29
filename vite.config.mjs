import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true,

    rollupOptions: {
      external: [
        'node:net',
        'node:tls',
        'node:crypto',
        'node:stream',
        'node:fs',
        'node:util',
        'node:timers/promises',
        'node:http',
        'node:https',
        'node:http2',
      ],
    },
  },
})
