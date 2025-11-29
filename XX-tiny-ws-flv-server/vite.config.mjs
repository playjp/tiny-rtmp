import { resolve } from 'path'
import { mergeConfig, defineConfig } from 'vite'

import { name } from "./package.json";
import commonConfig from "../vite.config.mjs";

export default mergeConfig(commonConfig, defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.mts'),
      name: name,
      fileName: name,
      formats: ['es', 'cjs'],
    },
  }
}));
