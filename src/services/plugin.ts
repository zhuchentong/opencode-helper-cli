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

  // plain npm package name
  return {name: ref, type: 'npm'}
}

/**
 * Maps a plugin reference to its cache directory path.
 */
function getPackageCacheDir(ref: string, cacheBase: string): string {
  const parsed = parsePluginRef(ref)

  if (parsed.type === 'git') {
    // Replace :// with :/ for filesystem-safe directory name
    const urlWithoutProtocol = parsed.url!.replace('://', ':/')
    return path.join(cacheBase, `${parsed.name}@${urlWithoutProtocol}`)
  }

  if (parsed.version) {
    return path.join(cacheBase, `${parsed.name}@${parsed.version}`)
  }

  // Default to @latest suffix for unversioned npm packages
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
 * Queries the latest version of an npm package from the registry.
 * Returns null if the query fails.
 */
async function fetchLatestVersion(packageName: string): Promise<null | string> {
  try {
    const {stdout} = await execFileAsync('npm', ['view', packageName, 'version'], {
      timeout: 15_000,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * Returns the default cache directory for opencode packages.
 * Respects XDG_CACHE_HOME if set.
 */
export function getDefaultCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME
  const cacheBase = xdgCache && path.isAbsolute(xdgCache) ? xdgCache : path.join(os.homedir(), '.cache')
  return path.join(cacheBase, 'opencode', 'packages')
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
