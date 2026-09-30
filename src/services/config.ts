import {applyEdits, modify, parse as parseJsonc} from 'jsonc-parser'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {OpenCodeConfig} from '../types.js'

// 支持的项目配置文件名，按优先级排序
const CONFIG_FILENAMES = [
  'opencode.json',
  'opencode.jsonc',
  '.opencode.json',
  '.opencode.jsonc'
]

// 全局配置目录下的候选文件名，按优先级排序
// 参见官方文档：https://opencode.ai/docs/config/
const GLOBAL_CONFIG_FILENAMES = ['opencode.json', 'opencode.jsonc']

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
 * 获取全局配置目录下的默认候选文件路径列表
 * 按优先级返回 opencode.json、opencode.jsonc
 */
function getGlobalConfigCandidates(): string[] {
  const configDir = getPlatformConfigDir()
  return GLOBAL_CONFIG_FILENAMES.map((filename) => path.join(configDir, filename))
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
 * 将候选文件名列表拼接为提示文案
 */
function joinCandidates(names: string[]): string {
  if (names.length <= 2) return names.join(' 或 ')
  return `${names.slice(0, -1).join('、')} 或 ${names.at(-1)}`
}

/**
 * 生成配置文件的查找路径说明文案
 * @param global 是否为全局配置
 * @returns 用于提示用户的查找路径说明
 */
export function describeConfigLocations(global: boolean): string {
  if (global) {
    // 全局：配置目录下的候选文件完整路径
    return joinCandidates(GLOBAL_CONFIG_FILENAMES.map((filename) => path.join(getPlatformConfigDir(), filename)))
  }

  // 项目级：从当前目录向上查找的候选文件名
  return joinCandidates([...CONFIG_FILENAMES])
}

/**
 * 加载全局 opencode 配置及其文件路径
 * @param customPath 自定义配置路径，不传则按优先级依次尝试候选文件名
 * @returns 配置结果，文件不存在或解析失败返回 null
 */
export function loadGlobalConfigWithPath(customPath?: string): ConfigResult | null {
  // 显式指定路径时直接使用，不受候选列表影响
  const candidates = customPath ? [customPath] : getGlobalConfigCandidates()
  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue
    const config = parseConfig(configPath)
    if (config) return {config, path: configPath}
  }

  return null
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
 * 每层目录依次尝试 CONFIG_FILENAMES 中的候选文件名
 * @param startDir 起始查找目录，默认为当前工作目录
 * @returns 配置对象，未找到返回 null
 */
export function loadProjectConfig(startDir?: string): null | OpenCodeConfig {
  return loadProjectConfigWithPath(startDir)?.config ?? null
}

// JSONC 文本编辑时的格式化选项（2 空格缩进）
const JSONC_FORMAT_OPTIONS = {insertSpaces: true, tabSize: 2}

/**
 * 将配置对象写回文件
 * - 文件不存在：新建纯 JSON（自动创建父目录）
 * - 文件已存在：基于原文本做 JSONC 编辑，保留注释与未改动部分的格式
 * @param filePath 配置文件路径
 * @param config 配置对象
 */
export function saveConfig(filePath: string, config: OpenCodeConfig): void {
  if (!fs.existsSync(filePath)) {
    // 确保父目录存在后新建纯 JSON
    fs.mkdirSync(path.dirname(filePath), {recursive: true})
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8')
    return
  }

  // 读取原文本，对配置对象的每个顶层键做文本级修改，保留注释
  let content = fs.readFileSync(filePath, 'utf8')
  for (const [key, value] of Object.entries(config)) {
    // 值未变化的键会返回空编辑集，开销可忽略
    const edits = modify(content, [key], value, {formattingOptions: JSONC_FORMAT_OPTIONS})
    content = applyEdits(content, edits)
  }

  // 保持尾换行的原有习惯
  if (!content.endsWith('\n')) content += '\n'
  fs.writeFileSync(filePath, content, 'utf8')
}
