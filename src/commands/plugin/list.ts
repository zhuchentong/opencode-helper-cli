import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'

import type {PluginInfo} from '../../types.js'

import {loadGlobalConfig, loadProjectConfig} from '../../services/config.js'
import {resolvePluginInfo} from '../../services/plugin.js'

export default class PluginList extends Command {
  static description = 'List opencode plugins and their versions'
  static examples = [
    '<%= config.bin %> plugin list',
    '<%= config.bin %> plugin list -g',
  ]
  static flags = {
    global: Flags.boolean({
      char: 'g',
      default: false,
      description: 'List globally installed plugins',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PluginList)

    const config = flags.global ? loadGlobalConfig() : loadProjectConfig()

    if (!config) {
      this.error(
        flags.global
          ? 'No global opencode config found (~/.config/opencode/opencode.json)'
          : 'No project opencode config found (opencode.json)',
      )
    }

    if (!config.plugin || config.plugin.length === 0) {
      this.log('No plugins configured.')
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
      head: ['Plugin', 'Current', 'Latest'],
      style: {
        head: ['cyan'],
      },
    })

    for (const p of plugins) {
      const current = p.current ?? chalk.gray('not installed')
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
