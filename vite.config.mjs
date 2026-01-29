import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true,

    rollupOptions: {
      external: [
        /^node:/, // Node.js built-in modules (node:*)
      ],
    },
  },
})
