import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: true,

    rolldownOptions: {
      external: [
        /^node:/, // Node.js built-in modules (node:*)
      ],
    },
  },
})
