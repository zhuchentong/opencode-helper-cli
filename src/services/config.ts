import {applyEdits, modify, parse as parseJsonc} from 'jsonc-parser'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {OpenCodeConfig} from '../types.js'

// 项目级每层目录候选（相对路径）：.opencode 内文件 > 直连 > 隐藏（对齐 v2 合并覆盖顺序）
const PROJECT_LAYER_CANDIDATES = [
  '.opencode/opencode.json',
  '.opencode/opencode.jsonc',
  'opencode.json',
  'opencode.jsonc',
  '.opencode.json',
  '.opencode.jsonc'
]

// 全局配置目录下的候选文件名，按优先级排序
// 参见官方文档：https://opencode.ai/docs/config/
// 全局配置文件候选名（对齐 opencode v2 config.ts:141，jsonc 优先级最高）
const GLOBAL_CONFIG_FILENAMES = ['opencode.jsonc', 'opencode.json', 'config.json']

/**
 * 获取平台相关的配置目录
 * OPENCODE_CONFIG_DIR 优先（对齐 opencode v2：Flag.OPENCODE_CONFIG_DIR ?? Path.config）
 * 其余情况与 opencode v2 的 xdg-basedir 行为一致：
 * $XDG_CONFIG_HOME/opencode，fallback 到全平台统一的 ~/.config/opencode
 */
export function getPlatformConfigDir(): string {
  const flagConfigDir = process.env.OPENCODE_CONFIG_DIR
  if (flagConfigDir && path.isAbsolute(flagConfigDir)) return flagConfigDir

  const xdgConfig = process.env.XDG_CONFIG_HOME
  if (xdgConfig && path.isAbsolute(xdgConfig)) {
    return path.join(xdgConfig, 'opencode')
  }

  return path.join(os.homedir(), '.config', 'opencode')
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

  // 项目级：从当前目录向上查找的每层候选文件（含 .opencode 目录内文件）
  return joinCandidates([...PROJECT_LAYER_CANDIDATES])
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
    const found = findInLayer(current)
    if (found) return found

    const parent = path.dirname(current)
    // 防止无限循环
    if (parent === current) break
    current = parent
  }

  return null
}

/**
 * 在单层目录内查找配置
 * 优先返回声明了 plugin/plugins 键的文件（避免漏配插件）；
 * 同层全部含或全部不含插件键时，按候选顺序（.opencode 内 > 直连 > 隐藏）取第一个
 */
function findInLayer(dir: string): ConfigResult | null {
  let fallback: ConfigResult | null = null

  for (const relative of PROJECT_LAYER_CANDIDATES) {
    const filePath = path.join(dir, relative)
    if (!fs.existsSync(filePath)) continue

    const config = parseConfig(filePath)
    if (!config) continue

    // 声明了插件键的文件优先于候选顺序
    if (hasPluginKeys(config)) return {config, path: filePath}

    if (fallback === null) fallback = {config, path: filePath}
  }

  return fallback
}

// 是否声明了插件键（plugin 或 plugins）
function hasPluginKeys(config: OpenCodeConfig): boolean {
  return Array.isArray(config.plugin) || Array.isArray(config.plugins)
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
