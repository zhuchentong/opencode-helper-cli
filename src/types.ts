// 插件条目联合类型：v1 字符串/元组 + v2 对象形式
export type PluginEntry = [string, object] | {options?: object; package: string} | string

export interface OpenCodeConfig {
  mcp?: Record<string, unknown>
  plugin?: string[]
  // v2 原生插件键（v1 键存在时被 v2 迁移逻辑忽略）
  plugins?: PluginEntry[]
  provider?: Record<string, unknown>
}

export interface PluginInfo {
  current: null | string
  /** 插件来源类型（v2 语义：local 为本地路径插件） */
  kind: 'git' | 'local' | 'npm'
  latest: null | string
  name: string
}

export type ConfigSource = 'global' | 'project'
