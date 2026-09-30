import {checkbox, confirm} from '@inquirer/prompts'
import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'

import type {NormalizedEntry} from '../../services/plugin.js'
import type {OpenCodeConfig, PluginEntry} from '../../types.js'

import {describeConfigLocations, loadGlobalConfigWithPath, loadProjectConfigWithPath, saveConfig} from '../../services/config.js'
import {normalizePluginEntries, parsePluginRef, readPluginEntries, removePluginCache, removePluginRefs} from '../../services/plugin.js'

interface RemoveResult {
  cacheRemoved: boolean
  name: string
  status: 'failed' | 'removed' | 'skipped'
}

export default class PluginRemove extends Command {
  static args = {
    plugins: Args.string({
      description: '要删除的插件名称',
      required: false,
    }),
  }
  static description = '删除 opencode 插件'
  static examples = [
    '<%= config.bin %> plugin remove',
    '<%= config.bin %> plugin remove -g',
    '<%= config.bin %> plugin remove -i',
    '<%= config.bin %> plugin remove @gopowerteam/opencode-commit',
    '<%= config.bin %> plugin remove foo bar -g',
  ]
  static flags = {
    global: Flags.boolean({
      char: 'g',
      default: false,
      description: '删除全局插件',
    }),
    interactive: Flags.boolean({
      char: 'i',
      default: false,
      description: '交互式选择要删除的插件',
    }),
  }
  static strict = false

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(PluginRemove)

    const result = flags.global ? loadGlobalConfigWithPath() : loadProjectConfigWithPath()

    // 双键读取（plugin/plugins）并归一化条目，仅管理可解析条目
    const entries = result ? normalizePluginEntries(readPluginEntries(result.config).raw) : []
    const managed = entries.filter((entry) => entry.managed)

    if (!result || entries.length === 0) {
      const scope = flags.global ? '全局' : '项目级'
      if (result) {
        this.log(chalk.yellow(`⚠️ 未找到${scope}插件配置（配置文件：${result.path}）`))
      } else {
        const configPath = describeConfigLocations(flags.global)
        this.log(chalk.yellow(`⚠️ 未找到${scope}配置文件（查找路径：${configPath}）`))
      }

      return
    }

    if (managed.length === 0) {
      this.log(chalk.yellow('⚠️ 配置中没有可管理的插件条目（未识别条目已保留）。'))
      return
    }

    try {
      if (flags.interactive) {
        const targetEntries = await this.interactiveSelect(managed)
        if (targetEntries.length === 0) return

        const confirmed = await this.confirmRemoval(targetEntries.map((entry) => entry.name!))
        if (!confirmed) {
          this.log(chalk.yellow('已取消删除。'))
          return
        }

        await this.executeRemove(result, targetEntries)
        return
      }

      if (argv.length === 0) {
        this.log(chalk.yellow('⚠️ 请指定要删除的插件名称，或使用 -i 交互选择。'))
        return
      }

      const targetEntries = this.filterPlugins(managed, argv as string[])
      if (targetEntries.length === 0) {
        this.log('⚠️ 未找到匹配的插件。')
        return
      }

      const confirmed = await this.confirmRemoval(targetEntries.map((entry) => entry.name!))
      if (!confirmed) {
        this.log(chalk.yellow('已取消删除。'))
        return
      }

      await this.executeRemove(result, targetEntries)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        this.log(chalk.yellow('\n已取消。'))
        this.exit(0)
      }

      throw error
    }
  }

  /**
   * 确认删除操作
   */
  private async confirmRemoval(refs: string[]): Promise<boolean> {
    const names = refs.map((ref) => parsePluginRef(ref).name)
    this.log(chalk.yellow(`即将删除以下插件：${names.join(', ')}`))
    return confirm({default: false, message: '确认删除？'})
  }

  /**
   * 执行删除操作：移除配置引用 + 清理缓存
   */
  private async executeRemove(
    configResult: {config: OpenCodeConfig; path: string},
    targetEntries: NormalizedEntry[],
  ): Promise<void> {
    const results: RemoveResult[] = []

    // 从权威键移除条目（未识别条目原样保留）
    const outcome = removePluginRefs(configResult.config, targetEntries.map((entry) => entry.name!))
    if (outcome.key === 'plugin') {
      configResult.config.plugin = outcome.remaining as string[]
    } else {
      configResult.config.plugins = outcome.remaining as PluginEntry[]
    }

    for (const entry of targetEntries) {
      const parsed = parsePluginRef(entry.ref!)
      const cacheResult = removePluginCache(entry.ref!)
      results.push({
        cacheRemoved: cacheResult.removed,
        name: parsed.name,
        status: 'removed',
      })
    }

    try {
      saveConfig(configResult.path, configResult.config)
    } catch (error) {
      for (const r of results) {
        r.status = 'failed'
      }

      this.log(chalk.red(`❌ 写回配置文件失败：${error instanceof Error ? error.message : String(error)}`))
    }

    this.renderTable(results)
  }

  /**
   * 根据名称筛选配置中的插件条目（支持名称或完整引用匹配）
   */
  private filterPlugins(managed: NormalizedEntry[], names: string[]): NormalizedEntry[] {
    const matched: NormalizedEntry[] = []
    for (const name of names) {
      const found = managed.find((entry) => entry.name === name || entry.ref === name)
      if (found) {
        matched.push(found)
      } else {
        this.warn(`⚠️ 插件 "${name}" 未在配置中找到。`)
      }
    }

    return matched
  }

  /**
   * 交互式选择要删除的插件
   */
  private async interactiveSelect(managed: NormalizedEntry[]): Promise<NormalizedEntry[]> {
    const selected = await checkbox({
      choices: managed.map((entry) => ({
        name: entry.name!,
        value: entry.name!,
      })),
      message: '🗑️ 选择要删除的插件（空格选择，回车确认）',
    })

    // 同名条目一并选中
    return managed.filter((entry) => selected.includes(entry.name!))
  }

  /**
   * 渲染删除结果表格
   */
  private renderTable(results: RemoveResult[]): void {
    const table = new Table({
      head: ['插件', '缓存清理', '状态'],
      style: {
        head: ['cyan'],
      },
    })

    for (const r of results) {
      const cache = r.cacheRemoved ? chalk.green('已清理') : chalk.gray('无需清理')
      let status: string
      switch (r.status) {
        case 'failed': {
          status = chalk.red('❌ 失败')
          break
        }

        case 'removed': {
          status = chalk.green('✅ 已删除')
          break
        }

        case 'skipped': {
          status = chalk.yellow('⏭️ 跳过')
          break
        }
      }

      table.push([r.name, cache, status])
    }

    this.log(table.toString())
  }
}
