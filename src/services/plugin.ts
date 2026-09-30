import {execFile} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

import type {OpenCodeConfig, PluginInfo} from '../types.js'

const execFileAsync = promisify(execFile)

export interface ParsedPluginRef {
  /** npm 条目：精确版本时为 true（升级跳过）；range/tag/无版本为 false */
  pinned?: boolean
  name: string
  type: 'git' | 'local' | 'npm'
  url?: string
  version?: string
}

/**
 * Parses a plugin reference string into its components.
 * 语义对齐 opencode v2（npm-package-arg）：本地路径、npm（精确/range/tag）、git 与 github 简写
 */
export function parsePluginRef(ref: string): ParsedPluginRef {
  // 本地路径：file://、相对路径、绝对路径、~、Windows 盘符（对齐 v2 isPathPluginSpec）
  const isLocal =
    ref.startsWith('file://')
    || ref.startsWith('.')
    || ref.startsWith('/')
    || ref.startsWith('~/')
    || /^[A-Za-z]:[\\/]/.test(ref)
  if (isLocal) return {name: ref, type: 'local'}

  // git reference pattern: name@git+https://... 或 name@git://...
  const gitMatch = ref.match(/^(.+?)@(git\+.+|git:\/\/.+)$/)
  if (gitMatch) {
    return {name: gitMatch[1]!, type: 'git', url: gitMatch[2]}
  }

  // github 简写：github:owner/repo(#ref)
  if (ref.startsWith('github:')) {
    return {name: ref.slice(7).split('#')[0]!, type: 'git', url: ref}
  }

  // npm 精确版本：name@1.2.3(-beta.1)
  const exactMatch = ref.match(/^(.+?)@(\d+\.\d+\.\d+[-+0-9A-Za-z.]*)$/)
  if (exactMatch) {
    return {name: exactMatch[1]!, pinned: true, type: 'npm', version: exactMatch[2]}
  }

  // npm 范围：^ ~ > < >= <=
  const rangeMatch = ref.match(/^(.+?)@([\^~><=]\S+)$/)
  if (rangeMatch) {
    return {name: rangeMatch[1]!, pinned: false, type: 'npm', version: rangeMatch[2]}
  }

  // npm 部分范围：1.x / 1.2.x
  const partialMatch = ref.match(/^(.+?)@(\d+(?:\.[\dxX*]+)*)$/)
  if (partialMatch) {
    return {name: partialMatch[1]!, pinned: false, type: 'npm', version: partialMatch[2]}
  }

  // npm tag：latest / beta 等
  const tagMatch = ref.match(/^(.+?)@([A-Za-z][0-9A-Za-z.-]*)$/)
  if (tagMatch) {
    return {name: tagMatch[1]!, pinned: false, type: 'npm', version: tagMatch[2]}
  }

  // plain npm package name
  return {name: ref, type: 'npm'}
}

/**
 * 判断是否为固定版本的 npm 插件（升级时应跳过）
 * 仅精确版本视为固定；range/tag 均允许升级
 */
export function isPinnedNpmRef(parsed: ParsedPluginRef): boolean {
  return parsed.type === 'npm' && Boolean(parsed.pinned)
}

/** readPluginEntries 的返回结果 */
export interface PluginEntriesRead {
  /** 权威键（v2 迁移语义：plugin 键存在时为权威，字面 plugins 被忽略） */
  key: 'plugin' | 'plugins'
  /** 原始条目数组 */
  raw: unknown[]
}

/**
 * 读取配置中的插件条目（双键兼容）
 * 语义对齐 opencode v2：plugin 键存在时为权威；否则回退 plugins 键
 */
export function readPluginEntries(config: OpenCodeConfig): PluginEntriesRead {
  if (Array.isArray(config.plugin)) return {key: 'plugin', raw: config.plugin}
  if (Array.isArray(config.plugins)) return {key: 'plugins', raw: config.plugins}
  return {key: 'plugin', raw: []}
}

/** 归一化后的插件条目 */
export interface NormalizedEntry {
  /** 是否可被 och 管理（解析出了插件名） */
  managed: boolean
  /** 解析出的插件名（managed 时存在） */
  name?: string
  /** 对象/元组形式附带的 options */
  options?: unknown
  /** 原始条目（写回时原样保留） */
  raw: unknown
  /** 解析出的插件引用（npm/git） */
  ref?: string
}

/**
 * 将插件条目归一化为统一结构
 * 支持 v1 字符串/元组与 v2 对象形式；无法识别的条目标记为 unmanaged 并原样保留
 */
export function normalizePluginEntries(raw: unknown[]): NormalizedEntry[] {
  return raw.map((item) => {
    // 字符串形式
    if (typeof item === 'string') {
      const parsed = parsePluginRef(item)
      return {managed: true, name: parsed.name, raw: item, ref: item}
    }

    // v2 对象形式 {package, options}
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const pkg = (item as {package?: unknown}).package
      if (typeof pkg === 'string') {
        const parsed = parsePluginRef(pkg)
        return {
          managed: true,
          name: parsed.name,
          options: (item as {options?: unknown}).options,
          raw: item,
          ref: pkg,
        }
      }
    }

    // v1 元组形式 [package, options]
    if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string') {
      const parsed = parsePluginRef(item[0])
      return {managed: true, name: parsed.name, options: item[1], raw: item, ref: item[0]}
    }

    return {managed: false, raw: item}
  })
}

/** removePluginRefs 的返回结果 */
export interface RemoveEntriesResult {
  /** 权威键（写回目标） */
  key: 'plugin' | 'plugins'
  /** 过滤后的原始条目（未识别条目原样保留） */
  remaining: unknown[]
  /** 实际移除的插件名 */
  removed: string[]
}

/**
 * 从配置中移除指定插件条目
 * 仅移除可解析（managed）的条目，按插件名或完整引用匹配；未识别条目原样保留
 */
export function removePluginRefs(config: OpenCodeConfig, targets: string[]): RemoveEntriesResult {
  const read = readPluginEntries(config)
  const targetSet = new Set(targets)
  const removed: string[] = []
  const remaining: unknown[] = []

  for (const entry of normalizePluginEntries(read.raw)) {
    if (entry.managed && (targetSet.has(entry.name!) || targetSet.has(entry.ref!))) {
      removed.push(entry.name!)
      continue
    }

    remaining.push(entry.raw)
  }

  return {key: read.key, remaining, removed}
}

/**
 * 将插件引用映射到 v2 缓存目录
 * v2 语义（core/src/npm.ts）：路径为 <cacheBase>/<sanitize(ref)>
 * sanitize 仅在 Windows 将非法字符（<>:"|?* 与控制字符）替换为 _
 */
export function getPackageCacheDir(ref: string, cacheBase: string): string {
  const parsed = parsePluginRef(ref)

  // 无版本号的 npm 插件实际以 name@latest 安装（v2 resolvePluginTarget 语义）
  if (parsed.type === 'npm' && !parsed.version) {
    return path.join(cacheBase, sanitizeRef(`${parsed.name}@latest`))
  }

  return path.join(cacheBase, sanitizeRef(ref))
}

// v2 sanitize 逻辑（core/src/npm.ts），仅在 Windows 生效
function sanitizeRef(pkg: string): string {
  if (process.platform !== 'win32') return pkg

  const illegal = new Set(['<', '>', ':', '"', '|', '?', '*'])
  return Array.from(pkg, (char) => (illegal.has(char) || char.charCodeAt(0) < 32 ? '_' : char)).join('')
}

/**
 * Reads the installed version of a package from the cache directory.
 * Returns null if the package is not installed.
 */
function readInstalledVersion(packageName: string, installDir: string): null | string {
  const pkgJsonPath = path.join(installDir, 'node_modules', packageName, 'package.json')
  try {
    const content = fs.readFileSync(pkgJsonPath, 'utf8')
    const pkg = JSON.parse(content) as {version?: string}
    return pkg.version ?? null
  } catch {
    return null
  }
}

/**
 * 跨平台 execFile 选项，仅在 Windows 上启用 shell（npm.cmd / git.cmd 需要）
 */
const execOptions = {shell: process.platform === 'win32', timeout: 60_000}

/**
 * Queries the latest version of an npm package from the registry.
 * Returns null if the query fails.
 */
async function fetchLatestVersion(packageName: string): Promise<null | string> {
  try {
    const {stdout} = await execFileAsync('npm', ['view', packageName, 'version'], {
      ...execOptions,
      timeout: 15_000,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * 获取平台相关的缓存目录
 * 与 opencode v2 的 xdg-basedir 行为一致：
 * $XDG_CACHE_HOME，fallback 到全平台统一的 ~/.cache/opencode
 */
export function getPlatformCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME
  if (xdgCache && path.isAbsolute(xdgCache)) return xdgCache

  return path.join(os.homedir(), '.cache', 'opencode')
}

/**
 * Returns the default cache directory for opencode packages.
 * Respects XDG_CACHE_HOME if set.
 */
export function getDefaultCacheDir(): string {
  return path.join(getPlatformCacheDir(), 'packages')
}

/**
 * Resolves plugin information including current installed version
 * and latest available version.
 */
export async function resolvePluginInfo(ref: string, cacheDir?: string): Promise<PluginInfo> {
  const parsed = parsePluginRef(ref)

  // 本地插件：直接指向文件系统，不查缓存与 npm registry
  if (parsed.type === 'local') {
    return {current: null, kind: 'local', latest: null, name: parsed.name}
  }

  const baseDir = cacheDir ?? getDefaultCacheDir()
  const installDir = getPackageCacheDir(ref, baseDir)
  const current = readInstalledVersion(parsed.name, installDir)
  let latest: null | string = null

  // Only fetch latest version for npm packages
  if (parsed.type === 'npm') {
    latest = await fetchLatestVersion(parsed.name)
  }

  return {
    current,
    kind: parsed.type,
    latest,
    name: parsed.name,
  }
}

/**
 * 插件升级结果
 */
export interface UpgradeResult {
  currentVersion: null | string
  message?: string
  name: string
  previousVersion: null | string
  status: 'failed' | 'skipped' | 'upgraded'
}

/**
 * 升级单个插件到最新版本
 * npm 插件：在缓存目录执行 npm install <name>@latest
 * git 插件：在缓存目录执行 npm install <name>@<git-url>
 * 固定版本的 npm 插件与本地插件会被跳过
 */
export async function upgradePlugin(ref: string, cacheDir?: string): Promise<UpgradeResult> {
  const parsed = parsePluginRef(ref)

  // 本地插件直接指向文件系统，无缓存可升级
  if (parsed.type === 'local') {
    return {
      currentVersion: null,
      message: '本地插件，无缓存可升级',
      name: parsed.name,
      previousVersion: null,
      status: 'skipped',
    }
  }

  const baseDir = cacheDir ?? getDefaultCacheDir()
  const installDir = getPackageCacheDir(ref, baseDir)
  const previousVersion = readInstalledVersion(parsed.name, installDir)

  // 仅精确固定版本的 npm 插件跳过升级（range/tag 视为非固定，允许升级）
  if (isPinnedNpmRef(parsed)) {
    return {
      currentVersion: previousVersion,
      message: '固定版本，已跳过',
      name: ref,
      previousVersion,
      status: 'skipped',
    }
  }

  // 缓存目录不存在，跳过
  if (!fs.existsSync(installDir)) {
    return {
      currentVersion: null,
      message: '尚未安装',
      name: parsed.name,
      previousVersion: null,
      status: 'skipped',
    }
  }

  try {
    // git 插件从 GitHub 拉取，npm 插件安装最新版本
    await execFileAsync('npm', ['install', `${parsed.name}@${parsed.type === 'git' ? parsed.url : 'latest'}`], {...execOptions, cwd: installDir})

    const currentVersion = readInstalledVersion(parsed.name, installDir)
    return {
      currentVersion,
      name: parsed.name,
      previousVersion,
      status: 'upgraded',
    }
  } catch (error) {
    const currentVersion = readInstalledVersion(parsed.name, installDir)
    return {
      currentVersion,
      message: error instanceof Error ? error.message : String(error),
      name: parsed.name,
      previousVersion,
      status: 'failed',
    }
  }
}

/**
 * 删除插件的缓存目录
 * @param ref 插件引用字符串
 * @param cacheDir 可选的自定义缓存目录
 * @returns 是否成功删除（目录不存在也算成功）
 */
export function removePluginCache(ref: string, cacheDir?: string): {path: string; removed: boolean} {
  const baseDir = cacheDir ?? getDefaultCacheDir()
  const installDir = getPackageCacheDir(ref, baseDir)

  if (fs.existsSync(installDir)) {
    fs.rmSync(installDir, {force: true, recursive: true})
    return {path: installDir, removed: true}
  }

  return {path: installDir, removed: false}
}
