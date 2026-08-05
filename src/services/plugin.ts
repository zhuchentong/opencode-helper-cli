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

// 与 opencode packages/core/src/npm.ts:sanitize 保持一致：仅在 win32 上替换路径非法字符，其他平台原样返回
const illegalChars = process.platform === 'win32' ? new Set(['"', '*', ':', '<', '>', '?', '|']) : undefined

function sanitizeForDir(spec: string): string {
  if (!illegalChars) return spec
  return Array.from(spec, (char) => (illegalChars.has(char) || char.codePointAt(0)! < 32 ? '_' : char)).join('')
}

/**
 * 判断已解析的 ref 是否是「固定数字版本」——只有这种情况升级时才跳过。
 * dist-tag（如 @latest / @beta / @next）虽然也带 `@<tag>`，但应该跑 `npm install <name>@<tag>` 升级。
 */
export function isFixedVersionRef(parsed: ParsedPluginRef): boolean {
  if (parsed.type !== 'npm') return false
  const {version} = parsed
  if (!version) return false
  return /^\d+\.\d+\.\d+/.test(version)
}

/**
 * 返回 npm 的 CLI 脚本路径，用于通过当前 node 直接调用 npm。
 * 这样既避免 DEP0190 警告（无需 shell:true，args 不会被 shell 拼接），
 * 又规避 Windows 上 spawn .cmd 文件必须 shell:true 否则 EINVAL 的限制。
 *
 * npm 通常与 node 一起安装，按以下顺序查找：
 *   1. <node_dir>/node_modules/npm/bin/npm-cli.js             (Windows 标准安装)
 *   2. <node_dir>/../lib/node_modules/npm/bin/npm-cli.js      (nvm、Linux/macOS 系统安装)
 *   3. <node_dir>/../node_modules/npm/bin/npm-cli.js          (Linux 系统安装变体)
 * 找不到时抛错，提示用户检查 node/npm 安装。
 */
export function getNpmCliPath(): string {
  const execDir = path.dirname(process.execPath)
  const candidates = [
    path.join(execDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(execDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(execDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error(
    `无法定位 npm CLI。已尝试以下路径：\n${candidates.join('\n')}\n请确认 npm 与 node 一起安装在同一目录下。`,
  )
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
 * opencode 1.x 在 npm 缓存目录下，按 `<name>@<sanitized-spec>` 命名。
 * win32 上 sanitize 替换 `:` 等路径非法字符为 `_`,非 win32 平台原样。
 * 注意 `path.join` 会把 sanitized-spec 内部的 `//` 规范化为 `/`，
 * 所以最终 installDir 已经下沉到 `<cache>/<name>@<sanitized-spec>/<host>/<owner>/<repo>`。
 */
function getPackageCacheDir(ref: string, cacheBase: string): string {
  const parsed = parsePluginRef(ref)

  if (parsed.type === 'git' && parsed.url) {
    const sanitizedUrl = sanitizeForDir(parsed.url)
    return path.join(cacheBase, `${parsed.name}@${sanitizedUrl}`)
  }

  if (parsed.version) {
    return path.join(cacheBase, `${parsed.name}@${parsed.version}`)
  }

  return path.join(cacheBase, `${ref}@latest`)
}

/**
 * 计算 ref 在缓存目录下的 package.json 路径。
 * opencode 1.x 的布局：所有类型都用 `installDir/node_modules/<name>/package.json`。
 * 对 git 类型，`installDir` 本身已经下沉到 `<cache>/<name>@<sanitized-spec>/<host>/<owner>/<repo>`。
 */
function getInstalledPkgJsonPath(parsed: ParsedPluginRef, installDir: string): string {
  return path.join(installDir, 'node_modules', parsed.name, 'package.json')
}

/**
 * Reads the installed version of a package from the cache directory.
 * Returns null if the package is not installed.
 */
function readInstalledVersion(parsed: ParsedPluginRef, installDir: string): null | string {
  const pkgJsonPath = getInstalledPkgJsonPath(parsed, installDir)
  try {
    const content = fs.readFileSync(pkgJsonPath, 'utf8')
    const pkg = JSON.parse(content) as {version?: string}
    return pkg.version ?? null
  } catch {
    return null
  }
}

/**
 * 跨平台 execFile 选项：直接调用当前 node + npm-cli.js（路径由 getNpmCliPath 解析），
 * 既无需 shell:true（避免 DEP0190 安全警告），又规避 Windows 上 spawn .cmd 文件
 * 必须 shell:true 否则 EINVAL 的限制。args 由 execFile 数组形式传递，不会被 shell 拼接。
 */
const execOptions = {timeout: 60_000}

/**
 * Queries the latest version of an npm package from the registry.
 * Returns null if the query fails.
 */
async function fetchLatestVersion(packageName: string): Promise<null | string> {
  try {
    const {stdout} = await execFileAsync(
      process.execPath,
      [getNpmCliPath(), 'view', packageName, 'version'],
      {...execOptions, timeout: 15_000},
    )
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
  const current = readInstalledVersion(parsed, installDir)
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
  const previousVersion = readInstalledVersion(parsed, installDir)

  // 固定数字版本的 npm 插件跳过升级（dist-tag 如 @latest 应跑 npm install 升级到该 tag 当前指向的版本）
  if (isFixedVersionRef(parsed)) {
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
    await execFileAsync(
      process.execPath,
      [getNpmCliPath(), 'install', `${parsed.name}@${parsed.type === 'git' ? parsed.url : 'latest'}`],
      {...execOptions, cwd: installDir},
    )

    const currentVersion = readInstalledVersion(parsed, installDir)
    return {
      currentVersion,
      name: parsed.name,
      previousVersion,
      status: 'upgraded',
    }
  } catch (error) {
    const currentVersion = readInstalledVersion(parsed, installDir)
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