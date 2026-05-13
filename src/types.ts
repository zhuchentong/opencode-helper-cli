export interface OpenCodeConfig {
  mcp?: Record<string, unknown>
  plugin?: string[]
  provider?: Record<string, unknown>
}

export interface PluginInfo {
  current: null | string
  latest: null | string
  name: string
}

export type ConfigSource = 'global' | 'project'
