import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'

import type {PluginInfo} from '../../types.js'

import {loadGlobalConfig, loadProjectConfig} from '../../services/config.js'
import {resolvePluginInfo} from '../../services/plugin.js'

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

    if (!config || !config.plugin || config.plugin.length === 0) {
      this.log('⚠️ 未找到插件配置。')
      return
    }

    // 并行解析所有插件信息
    const plugins = await Promise.all(
      config.plugin.map((ref) => resolvePluginInfo(ref)),
    )

    this.renderTable(plugins)
  }

  /**
   * 渲染插件信息表格
   */
  private renderTable(plugins: PluginInfo[]): void {
    const table = new Table({
      head: ['插件', '当前版本', '最新版本'],
      style: {
        head: ['cyan'],
      },
    })

    for (const p of plugins) {
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

    this.log(table.toString())
  }
}
