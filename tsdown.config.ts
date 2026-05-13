import {defineConfig} from 'tsdown'

export default defineConfig({
  dts: true,
  entry: ['src/**/*.ts'],
  format: 'esm',
  outDir: 'dist',
  platform: 'node',
  target: 'es2022',
  unbundle: true,
})
