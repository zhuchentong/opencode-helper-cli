import {checkbox} from '@inquirer/prompts'
import {Args, Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import Table from 'cli-table3'
import path from 'node:path'

import type {UpgradeResult} from '../../services/plugin.js'

import {getPlatformConfigDir, loadGlobalConfigWithPath, loadProjectConfigWithPath} from '../../services/config.js'
import {resolvePluginInfo, upgradePlugin} from '../../services/plugin.js'

export default class PluginUpgrade extends Command {
  static args = {
    plugins: Args.string({
      description: '要升级的插件名称（不指定则升级全部）',
      required: false,
    }),
  }
  static description = '升级 opencode 插件到最新版本'
  static examples = [
    '<%= config.bin %> plugin upgrade',
    '<%= config.bin %> plugin upgrade -g',
    '<%= config.bin %> plugin upgrade -i',
    '<%= config.bin %> plugin upgrade @gopowerteam/opencode-commit',
    '<%= config.bin %> plugin upgrade foo bar -g',
  ]
  static flags = {
    global: Flags.boolean({
      char: 'g',
      default: false,
      description: '升级全局插件',
    }),
    interactive: Flags.boolean({
      char: 'i',
      default: false,
      description: '交互式选择要升级的插件',
    }),
  }
  static strict = false

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(PluginUpgrade)

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

    // 交互式模式：列出插件供用户多选
    if (flags.interactive) {
      const targetRefs = await this.interactiveSelect(plugins)
      if (targetRefs.length === 0) return

      const results = await Promise.all(targetRefs.map((ref) => upgradePlugin(ref)))
      this.renderTable(results)
      return
    }

    // 非交互模式：原有逻辑
    const targetRefs = argv.length > 0
      ? this.filterPlugins(plugins, argv as string[])
      : plugins

    if (targetRefs.length === 0) {
      this.log('⚠️ 未找到匹配的插件。')
      return
    }

    // 并行升级所有目标插件
    const results = await Promise.all(
      targetRefs.map((ref) => upgradePlugin(ref)),
    )

    this.renderTable(results)
  }

  /**
   * 根据名称筛选配置中的插件引用
   */
  private filterPlugins(allRefs: string[], names: string[]): string[] {
    const result: string[] = []
    for (const name of names) {
      const matched = allRefs.find((ref) => {
        // 解析插件引用名称（去掉版本号或 git url 部分）
        const refMatch = ref.match(/^(.+?)@(\d+\.\d+\.\d+.*|git\+.+)$/)
        const pluginName = refMatch ? refMatch[1] : ref
        return pluginName === name || ref === name
      })
      if (matched) {
        result.push(matched)
      } else {
        this.warn(`⚠️ 插件 "${name}" 未在配置中找到。`)
      }
    }

    return result
  }

  /**
   * 交互式选择要升级的插件
   */
  private async interactiveSelect(plugins: string[]): Promise<string[]> {
    // 并行获取所有插件的版本信息
    const infos = await Promise.all(plugins.map((ref) => resolvePluginInfo(ref)))

    // 判断是否有可用更新
    const hasUpdate = (info: typeof infos[number]) =>
      info.latest !== null && info.current !== null && info.latest !== info.current

    // 全部已是最新版本
    if (infos.every((info) => !hasUpdate(info))) {
      this.log(chalk.green('🎉 所有插件均为最新版本。'))
      return []
    }

    const choices = infos.map((info, index) => {
      const current = info.current ?? '未安装'
      const latest = info.latest ?? '未知'
      const updated = hasUpdate(info)

      // 有更新的插件高亮显示，已最新的灰显
      const label = updated
        ? `${info.name}  ${chalk.gray(current)} → ${chalk.green(latest)}`
        : `${chalk.gray(info.name)}  ${chalk.gray(current)} → ${chalk.gray(latest)}（已是最新）`

      return {
        checked: updated,
        name: label,
        value: plugins[index]!,
      }
    })

    const selected = await checkbox({
      choices,
      message: '📦 选择要升级的插件（空格选择，回车确认）',
    })

    return selected
  }

  /**
   * 渲染升级结果表格
   */
  private renderTable(results: UpgradeResult[]): void {
    const table = new Table({
      head: ['插件', '升级前版本', '升级后版本', '状态'],
      style: {
        head: ['cyan'],
      },
    })

    for (const r of results) {
      const previous = r.previousVersion ?? chalk.gray('—')
      const current = r.currentVersion ?? chalk.gray('—')

      let status: string
      switch (r.status) {
        case 'failed': {
          status = chalk.red(`❌ 失败${r.message ? `（${r.message}）` : ''}`)
          break
        }

        case 'skipped': {
          status = chalk.yellow(`⏭️ 跳过${r.message ? `（${r.message}）` : ''}`)
          break
        }

        case 'upgraded': {
          status = chalk.green('✅ 已升级')
          break
        }
      }

      table.push([r.name, previous, current, status])
    }

    this.log(table.toString())
  }
}
