import { defineConfig } from 'bumpp'

export default defineConfig({
  commit: 'chore: release v%s',
  execute: 'sh -c "pnpm run build && pnpm run prepack && npm publish && pnpm run postpack"',
  push: true,
  tag: false,
})
