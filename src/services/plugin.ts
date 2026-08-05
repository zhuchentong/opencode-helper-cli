import {execFile} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

import type {PluginInfo} from '../types.js'

const execFileAsync = promisify(execFile)

interface ParsedPluginRef {
  name: string
  type: 'git' | 'npm'
  url?: string
  version?: string
}

/**
 * Parses a plugin reference string into its components.
 * Supports npm packages (scoped, unscoped, versioned) and git references.
 */
export function parsePluginRef(ref: string): ParsedPluginRef {
  // git reference pattern: name@git+https://...
  const gitMatch = ref.match(/^(.+?)@(git\+.+)$/)
  if (gitMatch) {
    return {name: gitMatch[1], type: 'git', url: gitMatch[2]}
  }

  // npm versioned pattern: name@1.2.3
  const npmMatch = ref.match(/^(.+?)@(\d+\.\d+\.\d+.*)$/)
  if (npmMatch) {
    return {name: npmMatch[1], type: 'npm', version: npmMatch[2]}
  }

  // npm dist-tag pattern: name@latest (or @beta / @next / @canary 等标签，字母起始且非数字版本号)
  // 不能落在前面的数字版本分支上，所以放在它后面
  const tagMatch = ref.match(/^(.+?)@([a-zA-Z][a-zA-Z0-9._-]{0,30})$/)
  if (tagMatch) {
    return {name: tagMatch[1], type: 'npm', version: tagMatch[2]}
  }

  // plain npm package name
  return {name: ref, type: 'npm'}
}

/**
 * Maps a plugin reference to its cache directory path.
 * 兼容旧版目录名格式（使用 :/ 替换 :// 的格式）。
 */
function getPackageCacheDir(ref: string, cacheBase: string): string {
  const parsed = parsePluginRef(ref)

  if (parsed.type === 'git') {
    // 新格式：将 :// 替换为 -（Windows 兼容，: 不能用于目录名）
    const newUrlPart = parsed.url!.replace('://', '-')
    const newDir = path.join(cacheBase, `${parsed.name}@${newUrlPart}`)

    // 兼容旧格式：检查使用 :/ 替换的旧目录是否存在
    const oldUrlPart = parsed.url!.replace('://', ':/')
    const oldDir = path.join(cacheBase, `${parsed.name}@${oldUrlPart}`)
    if (fs.existsSync(oldDir)) return oldDir

    return newDir
  }

  if (parsed.version) {
    return path.join(cacheBase, `${parsed.name}@${parsed.version}`)
  }

  return path.join(cacheBase, `${ref}@latest`)
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
 * 获取全局 opencode 缓存目录。
 * opencode 1.x 在所有平台（包括 Windows）都遵循 XDG 基础目录规范：
 * `$XDG_CACHE_HOME/opencode` → `~/.cache/opencode`。
 */
export function getPlatformCacheDir(): string {
  // 环境变量优先（XDG 规范）
  const xdgCache = process.env.XDG_CACHE_HOME
  if (xdgCache && path.isAbsolute(xdgCache)) {
    return path.join(xdgCache, 'opencode')
  }

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
  const baseDir = cacheDir ?? getDefaultCacheDir()
  const parsed = parsePluginRef(ref)
  const installDir = getPackageCacheDir(ref, baseDir)
  const current = readInstalledVersion(parsed.name, installDir)
  let latest: null | string = null

  // Only fetch latest version for npm packages
  if (parsed.type === 'npm') {
    latest = await fetchLatestVersion(parsed.name)
  }

  return {
    current,
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
 * 固定版本的 npm 插件会被跳过
 */
export async function upgradePlugin(ref: string, cacheDir?: string): Promise<UpgradeResult> {
  const baseDir = cacheDir ?? getDefaultCacheDir()
  const parsed = parsePluginRef(ref)
  const installDir = getPackageCacheDir(ref, baseDir)
  const previousVersion = readInstalledVersion(parsed.name, installDir)

  // 固定版本的 npm 插件跳过升级
  if (parsed.type === 'npm' && parsed.version) {
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