import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'

import {loadGlobalConfig, loadProjectConfig} from '../../services/config.js'
import {normalizePluginEntries, readPluginEntries, resolvePluginInfo} from '../../services/plugin.js'

export default class PluginList extends Command {
  static description = '列出 opencode 插件及其版本'
  static examples = [
    '<%= config.bin %> plugin list',
    '<%= config.bin %> plugin list -g',
  ]
  static flags = {
    global: Flags.boolean({
      char: 'g',
      default: false,
      description: '列出全局安装的插件',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PluginList)

    const config = flags.global ? loadGlobalConfig() : loadProjectConfig()

    // 双键读取（plugin/plugins）并归一化条目，未识别条目单独展示
    const entries = config ? normalizePluginEntries(readPluginEntries(config).raw) : []
    const managed = entries.filter((entry) => entry.managed)
    const unmanagedCount = entries.length - managed.length

    if (!config || entries.length === 0) {
      this.log('⚠️ 未找到插件配置。')
      return
    }

    // 并行解析所有可管理插件信息
    const plugins = await Promise.all(
      managed.map((entry) => resolvePluginInfo(entry.ref!)),
    )

    this.renderTable(plugins, unmanagedCount)
  }

  /**
   * 渲染插件信息表格（含未识别条目行）
   */
  private renderTable(plugins: Awaited<ReturnType<typeof resolvePluginInfo>>[], unmanagedCount: number): void {
    const table = new Table({
      head: ['插件', '当前版本', '最新版本'],
      style: {
        head: ['cyan'],
      },
    })

    for (const p of plugins) {
      // 本地插件：无缓存与 registry 概念
      if (p.kind === 'local') {
        table.push([p.name, chalk.gray('本地插件'), chalk.gray('—')])
        continue
      }

      const current = p.current ?? chalk.gray('未安装')
      let latest: string

      if (p.latest === null) {
        latest = chalk.gray('N/A')
      } else if (p.current && p.current !== p.latest) {
        latest = chalk.yellow(p.latest)
      } else {
        latest = chalk.green(p.latest)
      }

      table.push([p.name, current, latest])
    }

    // 未识别条目原样保留、无法解析版本信息
    for (let i = 0; i < unmanagedCount; i++) {
      table.push([chalk.yellow('⚠️ 未识别格式'), chalk.gray('—'), chalk.gray('—')])
    }

    this.log(table.toString())
  }
}
