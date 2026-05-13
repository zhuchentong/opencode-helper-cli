# Plugin List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `och plugin list` 和 `och plugin list -g` 命令，以表格形式展示 opencode 插件的名称、当前版本和最新版本。

**Architecture:** 采用服务层分离模式。`services/config.ts` 负责 JSONC 配置读取，`services/plugin.ts` 负责插件引用解析和版本查询，`commands/plugin/list.ts` 作为命令入口调用 services 并渲染表格输出。

**Tech Stack:** oclif v4, TypeScript (ESM), jsonc-parser, cli-table3, pnpm

---

## File Structure

```
src/
├── commands/
│   ├── hello/                   # (保留，不改)
│   └── plugin/
│       └── list.ts              # och plugin list 命令
├── services/
│   ├── config.ts                # JSONC 配置读取服务
│   └── plugin.ts                # 插件版本解析服务
├── types.ts                     # 共享类型定义
└── index.ts                     # (保留，不改)
test/
├── commands/
│   └── plugin/
│       └── list.test.ts         # 命令集成测试
└── services/
    ├── config.test.ts           # 配置服务单元测试
    └── plugin.test.ts           # 插件服务单元测试
```

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jsonc-parser and cli-table3**

```bash
pnpm add jsonc-parser cli-table3
pnpm add -D @types/cli-table3
```

- [ ] **Step 2: Verify installation**

```bash
pnpm ls jsonc-parser cli-table3
```

Expected: Both packages listed with version numbers

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add jsonc-parser and cli-table3 dependencies"
```

---

### Task 2: Create Shared Type Definitions

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface OpenCodeConfig {
  plugin?: string[]
  mcp?: Record<string, unknown>
  provider?: Record<string, unknown>
}

export interface PluginInfo {
  name: string
  current: string | null
  latest: string | null
}

export type ConfigSource = 'project' | 'global'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm run build
```

Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared type definitions for config and plugin"
```

---

### Task 3: Config Service — TDD

**Files:**
- Create: `src/services/config.ts`
- Create: `test/services/config.test.ts`

- [ ] **Step 1: Write config service tests `test/services/config.test.ts`**

```typescript
import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {loadGlobalConfig, loadProjectConfig} from '../../src/services/config.js'

describe('config service', () => {
  const fixturesDir = path.join(os.tmpdir(), 'och-test-fixtures')

  before(() => {
    fs.mkdirSync(fixturesDir, {recursive: true})
  })

  after(() => {
    fs.rmSync(fixturesDir, {recursive: true, force: true})
  })

  describe('loadGlobalConfig', () => {
    it('should return null when global config does not exist', () => {
      const result = loadGlobalConfig('/nonexistent/path/opencode.json')
      expect(result).to.be.null
    })

    it('should parse JSONC config with comments', () => {
      const configPath = path.join(fixturesDir, 'global-opencode.json')
      fs.writeFileSync(
        configPath,
        `{
  // This is a comment
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git"
  ]
}`,
      )
      const result = loadGlobalConfig(configPath)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal([
        'superpowers@git+https://github.com/obra/superpowers.git',
      ])
    })

    it('should handle config without plugin field', () => {
      const configPath = path.join(fixturesDir, 'no-plugin.json')
      fs.writeFileSync(
        configPath,
        `{
  "mcp": {}
}`,
      )
      const result = loadGlobalConfig(configPath)
      expect(result).to.not.be.null
      expect(result!.plugin).to.be.undefined
    })
  })

  describe('loadProjectConfig', () => {
    it('should return null when no config found in directory tree', () => {
      const emptyDir = path.join(fixturesDir, 'empty-project')
      fs.mkdirSync(emptyDir, {recursive: true})
      const result = loadProjectConfig(emptyDir)
      expect(result).to.be.null
    })

    it('should find opencode.json in current directory', () => {
      const projectDir = path.join(fixturesDir, 'project-a')
      fs.mkdirSync(projectDir, {recursive: true})
      fs.writeFileSync(
        path.join(projectDir, 'opencode.json'),
        `{
  "plugin": ["@gopowerteam/opencode-commit"]
}`,
      )
      const result = loadProjectConfig(projectDir)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal(['@gopowerteam/opencode-commit'])
    })

    it('should find .opencode.json as fallback', () => {
      const projectDir = path.join(fixturesDir, 'project-b')
      fs.mkdirSync(projectDir, {recursive: true})
      fs.writeFileSync(
        path.join(projectDir, '.opencode.json'),
        `{"plugin": ["test-plugin"]}`,
      )
      const result = loadProjectConfig(projectDir)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal(['test-plugin'])
    })

    it('should search parent directories', () => {
      const rootDir = path.join(fixturesDir, 'project-c')
      const subDir = path.join(rootDir, 'sub', 'deep')
      fs.mkdirSync(subDir, {recursive: true})
      fs.writeFileSync(
        path.join(rootDir, 'opencode.json'),
        `{"plugin": ["parent-plugin"]}`,
      )
      const result = loadProjectConfig(subDir)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal(['parent-plugin'])
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm run build && pnpm exec mocha --forbid-only "test/services/config.test.ts"
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement config service `src/services/config.ts`**

```typescript
import {parse as parseJsonc} from 'jsonc-parser'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {OpenCodeConfig} from '../types.js'

const CONFIG_FILENAMES = ['opencode.json', '.opencode.json']

function getDefaultGlobalConfigPath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const configBase = xdgConfig && path.isAbsolute(xdgConfig) ? xdgConfig : path.join(os.homedir(), '.config')
  return path.join(configBase, 'opencode', 'opencode.json')
}

function parseConfig(filePath: string): OpenCodeConfig | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const result = parseJsonc(content) as OpenCodeConfig
    return result
  } catch {
    return null
  }
}

export function loadGlobalConfig(customPath?: string): OpenCodeConfig | null {
  const configPath = customPath ?? getDefaultGlobalConfigPath()
  if (!fs.existsSync(configPath)) return null
  return parseConfig(configPath)
}

export function loadProjectConfig(startDir?: string): OpenCodeConfig | null {
  let current = path.resolve(startDir ?? process.cwd())
  const root = path.parse(current).root

  while (current !== root) {
    for (const filename of CONFIG_FILENAMES) {
      const filePath = path.join(current, filename)
      if (fs.existsSync(filePath)) {
        return parseConfig(filePath)
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}
```

- [ ] **Step 4: Run tests to verify passing**

```bash
pnpm run build && pnpm exec mocha --forbid-only "test/services/config.test.ts"
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/config.ts test/services/config.test.ts
git commit -m "feat: add config service with JSONC support"
```

---

### Task 4: Plugin Service — TDD

**Files:**
- Create: `src/services/plugin.ts`
- Create: `test/services/plugin.test.ts`

- [ ] **Step 1: Write plugin service tests `test/services/plugin.test.ts`**

```typescript
import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {parsePluginRef, resolvePluginInfo} from '../../src/services/plugin.js'

describe('plugin service', () => {
  describe('parsePluginRef', () => {
    it('should parse npm scoped package', () => {
      const result = parsePluginRef('@gopowerteam/opencode-commit')
      expect(result).to.deep.equal({
        name: '@gopowerteam/opencode-commit',
        type: 'npm',
      })
    })

    it('should parse npm unscoped package', () => {
      const result = parsePluginRef('my-plugin')
      expect(result).to.deep.equal({
        name: 'my-plugin',
        type: 'npm',
      })
    })

    it('should parse git reference', () => {
      const result = parsePluginRef('superpowers@git+https://github.com/obra/superpowers.git')
      expect(result).to.deep.equal({
        name: 'superpowers',
        type: 'git',
        url: 'git+https://github.com/obra/superpowers.git',
      })
    })

    it('should parse npm versioned package', () => {
      const result = parsePluginRef('plugin@1.2.3')
      expect(result).to.deep.equal({
        name: 'plugin',
        type: 'npm',
        version: '1.2.3',
      })
    })
  })

  describe('resolvePluginInfo', () => {
    const cacheDir = path.join(os.tmpdir(), 'och-test-cache')

    beforeEach(() => {
      fs.rmSync(cacheDir, {recursive: true, force: true})
    })

    after(() => {
      fs.rmSync(cacheDir, {recursive: true, force: true})
    })

    it('should resolve current version from installed package', async () => {
      const pkgDir = path.join(cacheDir, 'my-plugin@latest', 'node_modules', 'my-plugin')
      fs.mkdirSync(pkgDir, {recursive: true})
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({name: 'my-plugin', version: '1.0.0'}),
      )

      const result = await resolvePluginInfo('my-plugin', cacheDir)
      expect(result.name).to.equal('my-plugin')
      expect(result.current).to.equal('1.0.0')
    })

    it('should return null current version when not installed', async () => {
      const result = await resolvePluginInfo('nonexistent', cacheDir)
      expect(result.name).to.equal('nonexistent')
      expect(result.current).to.be.null
    })

    it('should resolve scoped package from cache', async () => {
      const pkgDir = path.join(
        cacheDir,
        '@gopowerteam/opencode-commit@latest',
        'node_modules',
        '@gopowerteam',
        'opencode-commit',
      )
      fs.mkdirSync(pkgDir, {recursive: true})
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({name: '@gopowerteam/opencode-commit', version: '0.0.6'}),
      )

      const result = await resolvePluginInfo('@gopowerteam/opencode-commit', cacheDir)
      expect(result.current).to.equal('0.0.6')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm run build && pnpm exec mocha --forbid-only "test/services/plugin.test.ts"
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement plugin service `src/services/plugin.ts`**

```typescript
import {execFile} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'
import type {PluginInfo} from '../types.js'

const execFileAsync = promisify(execFile)

interface ParsedPluginRef {
  name: string
  type: 'npm' | 'git'
  url?: string
  version?: string
}

export function parsePluginRef(ref: string): ParsedPluginRef {
  const gitMatch = ref.match(/^(.+?)@(git\+.+)$/)
  if (gitMatch) {
    return {name: gitMatch[1], type: 'git', url: gitMatch[2]}
  }

  const npmMatch = ref.match(/^(.+?)@(\d+\.\d+\.\d+.*)$/)
  if (npmMatch) {
    return {name: npmMatch[1], type: 'npm', version: npmMatch[2]}
  }

  return {name: ref, type: 'npm'}
}

function getPackageCacheDir(ref: string, cacheBase: string): string {
  const parsed = parsePluginRef(ref)

  if (parsed.type === 'git') {
    const urlWithoutProtocol = parsed.url!.replace('://', ':/')
    return path.join(cacheBase, `${parsed.name}@${urlWithoutProtocol}`)
  }

  if (parsed.version) {
    return path.join(cacheBase, `${parsed.name}@${parsed.version}`)
  }

  return path.join(cacheBase, `${ref}@latest`)
}

function readInstalledVersion(packageName: string, installDir: string): string | null {
  const pkgJsonPath = path.join(installDir, 'node_modules', packageName, 'package.json')
  try {
    const content = fs.readFileSync(pkgJsonPath, 'utf-8')
    const pkg = JSON.parse(content) as {version?: string}
    return pkg.version ?? null
  } catch {
    return null
  }
}

async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const {stdout} = await execFileAsync('npm', ['view', packageName, 'version'], {
      timeout: 15_000,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export function getDefaultCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME
  const cacheBase = xdgCache && path.isAbsolute(xdgCache) ? xdgCache : path.join(os.homedir(), '.cache')
  return path.join(cacheBase, 'opencode', 'packages')
}

export async function resolvePluginInfo(ref: string, cacheDir?: string): Promise<PluginInfo> {
  const baseDir = cacheDir ?? getDefaultCacheDir()
  const parsed = parsePluginRef(ref)
  const installDir = getPackageCacheDir(ref, baseDir)
  const current = readInstalledVersion(parsed.name, installDir)
  let latest: string | null = null

  if (parsed.type === 'npm') {
    latest = await fetchLatestVersion(parsed.name)
  }

  return {
    name: parsed.name,
    current,
    latest,
  }
}
```

- [ ] **Step 4: Run tests to verify passing**

```bash
pnpm run build && pnpm exec mocha --forbid-only "test/services/plugin.test.ts"
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/plugin.ts test/services/plugin.test.ts
git commit -m "feat: add plugin service with version resolution"
```

---

### Task 5: Implement `och plugin list` Command — TDD

**Files:**
- Create: `src/commands/plugin/list.ts`
- Modify: `package.json` (add plugin topic)
- Create: `test/commands/plugin/list.test.ts`

- [ ] **Step 1: Update `package.json` to add plugin topic**

Add to `oclif.topics`:

```json
"plugin": {
  "description": "Manage opencode plugins"
}
```

- [ ] **Step 2: Write command tests `test/commands/plugin/list.test.ts`**

```typescript
import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('plugin list', () => {
  it('shows error when no project config found', async () => {
    const {stderr} = await runCommand('plugin list', {
      root: '/nonexistent/path',
    })
    expect(stderr).to.include('No opencode config found')
  })

  it('accepts --global flag', async () => {
    const {stdout} = await runCommand('plugin list --global')
    expect(typeof stdout).to.equal('string')
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

```bash
pnpm run build && pnpm exec mocha --forbid-only "test/commands/plugin/list.test.ts"
```

Expected: FAIL — command not found

- [ ] **Step 4: Implement `src/commands/plugin/list.ts`**

```typescript
import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'
import {loadGlobalConfig, loadProjectConfig} from '../../services/config.js'
import {resolvePluginInfo} from '../../services/plugin.js'
import type {PluginInfo} from '../../types.js'

export default class PluginList extends Command {
  static description = 'List opencode plugins and their versions'

  static examples = [
    '<%= config.bin %> plugin list',
    '<%= config.bin %> plugin list -g',
  ]

  static flags = {
    global: Flags.boolean({
      char: 'g',
      description: 'List globally installed plugins',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PluginList)

    const config = flags.global ? loadGlobalConfig() : loadProjectConfig()

    if (!config) {
      this.error(
        flags.global
          ? 'No global opencode config found (~/.config/opencode/opencode.json)'
          : 'No project opencode config found (opencode.json)',
      )
    }

    if (!config.plugin || config.plugin.length === 0) {
      this.log('No plugins configured.')
      return
    }

    const plugins = await Promise.all(
      config.plugin.map((ref) => resolvePluginInfo(ref)),
    )

    this.renderTable(plugins)
  }

  private renderTable(plugins: PluginInfo[]): void {
    const table = new Table({
      head: ['Plugin', 'Current', 'Latest'],
      style: {
        head: ['cyan'],
      },
    })

    for (const p of plugins) {
      const current = p.current ?? chalk.gray('not installed')
      let latest: string

      if (p.latest === null) {
        latest = chalk.gray('N/A')
      } else if (p.current && p.current !== p.latest) {
        latest = chalk.yellow(p.latest)
      } else {
        latest = chalk.green(p.latest)
      }

      table.push([p.name, current, latest])
    }

    this.log(table.toString())
  }
}
```

- [ ] **Step 5: Run build**

```bash
pnpm run build
```

Expected: Compiles successfully

- [ ] **Step 6: Manual verification**

```bash
pnpm exec och plugin list -g
```

Expected: Table output with global plugins

- [ ] **Step 7: Run tests**

```bash
pnpm exec mocha --forbid-only "test/commands/plugin/list.test.ts"
```

- [ ] **Step 8: Commit**

```bash
git add src/commands/plugin/list.ts test/commands/plugin/list.test.ts package.json
git commit -m "feat: implement och plugin list command"
```

---

### Task 6: Integration Test & Lint

**Files:** No new files

- [ ] **Step 1: Run full build**

```bash
pnpm run build
```

Expected: Compiles successfully

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

- [ ] **Step 3: Run lint**

```bash
pnpm run lint
```

Expected: No lint errors

- [ ] **Step 4: End-to-end verification**

```bash
pnpm exec och plugin list -g
```
