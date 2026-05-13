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
