import {parse as parseJsonc} from 'jsonc-parser'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {OpenCodeConfig} from '../types.js'

// 支持的项目配置文件名，按优先级排序
const CONFIG_FILENAMES = ['opencode.json', '.opencode.json']

/**
 * 获取平台相关的配置目录
 * Linux: $XDG_CONFIG_HOME/opencode 或 ~/.config/opencode
 * macOS: ~/Library/Application Support/opencode
 * Windows: %APPDATA%/opencode
 */
export function getPlatformConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  if (xdgConfig && path.isAbsolute(xdgConfig)) {
    return path.join(xdgConfig, 'opencode')
  }

  switch (process.platform) {
    case 'darwin': {
      return path.join(os.homedir(), 'Library', 'Application Support', 'opencode')
    }

    case 'win32': {
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'opencode')
    }

    default: {
      return path.join(os.homedir(), '.config', 'opencode')
    }
  }
}

/**
 * 获取全局配置文件的默认路径
 */
function getDefaultGlobalConfigPath(): string {
  return path.join(getPlatformConfigDir(), 'opencode.json')
}

/**
 * 解析 JSONC 格式的配置文件
 * @param filePath 配置文件路径
 * @returns 解析后的配置对象，失败返回 null
 */
function parseConfig(filePath: string): null | OpenCodeConfig {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const result = parseJsonc(content) as OpenCodeConfig
    return result
  } catch {
    return null
  }
}

export interface ConfigResult {
  config: OpenCodeConfig
  path: string
}

/**
 * 加载全局 opencode 配置及其文件路径
 * @param customPath 自定义配置路径，不传则使用默认路径
 * @returns 配置结果，文件不存在或解析失败返回 null
 */
export function loadGlobalConfigWithPath(customPath?: string): ConfigResult | null {
  const configPath = customPath ?? getDefaultGlobalConfigPath()
  if (!fs.existsSync(configPath)) return null
  const config = parseConfig(configPath)
  if (!config) return null
  return {config, path: configPath}
}

/**
 * 加载项目级 opencode 配置及其文件路径
 * @param startDir 起始查找目录，默认为当前工作目录
 * @returns 配置结果，未找到返回 null
 */
export function loadProjectConfigWithPath(startDir?: string): ConfigResult | null {
  let current = path.resolve(startDir ?? process.cwd())

  const {root} = path.parse(current)

  // 向上遍历目录树直到根目录
  while (current !== root) {
    for (const filename of CONFIG_FILENAMES) {
      const filePath = path.join(current, filename)
      if (fs.existsSync(filePath)) {
        const config = parseConfig(filePath)
        if (config) return {config, path: filePath}
      }
    }

    const parent = path.dirname(current)
    // 防止无限循环
    if (parent === current) break
    current = parent
  }

  return null
}

/**
 * 加载全局 opencode 配置
 * @param customPath 自定义配置路径，不传则使用默认路径
 * @returns 配置对象，文件不存在或解析失败返回 null
 */
export function loadGlobalConfig(customPath?: string): null | OpenCodeConfig {
  return loadGlobalConfigWithPath(customPath)?.config ?? null
}

/**
 * 从指定目录开始向上查找项目级 opencode 配置
 * 依次查找 opencode.json 和 .opencode.json
 * @param startDir 起始查找目录，默认为当前工作目录
 * @returns 配置对象，未找到返回 null
 */
export function loadProjectConfig(startDir?: string): null | OpenCodeConfig {
  return loadProjectConfigWithPath(startDir)?.config ?? null
}
