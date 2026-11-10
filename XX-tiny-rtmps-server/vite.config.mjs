import { resolve } from 'path'
import { mergeConfig, defineConfig } from 'vite'

import project from "./package.json" with { type: 'json' };
const { name } = project;

import commonConfig from "../vite.config.mjs";

export default mergeConfig(commonConfig, defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.mts'),
      name: name,
      fileName: name,
      formats: ['es', 'cjs'],
    },
  }
}));
