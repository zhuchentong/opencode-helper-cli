import {checkbox, confirm} from '@inquirer/prompts'
import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'
import path from 'node:path'

import type {OpenCodeConfig} from '../../types.js'

import {getPlatformConfigDir, loadGlobalConfigWithPath, loadProjectConfigWithPath, saveConfig} from '../../services/config.js'
import {parsePluginRef, removePluginCache} from '../../services/plugin.js'

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

    if (!result || !result.config.plugin || result.config.plugin.length === 0) {
      const scope = flags.global ? '全局' : '项目级'
      if (result) {
        this.log(chalk.yellow(`⚠️ 未找到${scope}插件配置（配置文件：${result.path}）`))
      } else {
        const configPath = flags.global
          ? path.join(getPlatformConfigDir(), 'opencode.json')
          : 'opencode.json 或 .opencode.json'
        this.log(chalk.yellow(`⚠️ 未找到${scope}配置文件（查找路径：${configPath}）`))
      }

      return
    }

    const plugins = result.config.plugin!

    try {
      if (flags.interactive) {
        const targetRefs = await this.interactiveSelect(plugins)
        if (targetRefs.length === 0) return

        const confirmed = await this.confirmRemoval(targetRefs)
        if (!confirmed) {
          this.log(chalk.yellow('已取消删除。'))
          return
        }

        await this.executeRemove(result, targetRefs)
        return
      }

      if (argv.length === 0) {
        this.log(chalk.yellow('⚠️ 请指定要删除的插件名称，或使用 -i 交互选择。'))
        return
      }

      const targetRefs = this.filterPlugins(plugins, argv as string[])
      if (targetRefs.length === 0) {
        this.log('⚠️ 未找到匹配的插件。')
        return
      }

      const confirmed = await this.confirmRemoval(targetRefs)
      if (!confirmed) {
        this.log(chalk.yellow('已取消删除。'))
        return
      }

      await this.executeRemove(result, targetRefs)
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
    targetRefs: string[],
  ): Promise<void> {
    const results: RemoveResult[] = []

    configResult.config.plugin = configResult.config.plugin!.filter(
      (ref) => !targetRefs.includes(ref),
    )

    for (const ref of targetRefs) {
      const parsed = parsePluginRef(ref)
      const cacheResult = removePluginCache(ref)
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
   * 根据名称筛选配置中的插件引用
   */
  private filterPlugins(allRefs: string[], names: string[]): string[] {
    const matched: string[] = []
    for (const name of names) {
      const found = allRefs.find((ref) => {
        const parsed = parsePluginRef(ref)
        return parsed.name === name || ref === name
      })
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
  private async interactiveSelect(plugins: string[]): Promise<string[]> {
    const choices = plugins.map((ref) => {
      const parsed = parsePluginRef(ref)
      return {
        name: parsed.name,
        value: ref,
      }
    })

    const selected = await checkbox({
      choices,
      message: '🗑️ 选择要删除的插件（空格选择，回车确认）',
    })

    return selected
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
