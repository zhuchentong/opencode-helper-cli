import {expect} from 'chai'
import {parse as parseJsonc} from 'jsonc-parser'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {describeConfigLocations, getPlatformConfigDir, loadGlobalConfig, loadGlobalConfigWithPath, loadProjectConfig, loadProjectConfigWithPath, saveConfig} from '../../src/services/config.js'

describe('config service', () => {
  const fixturesDir = path.join(os.tmpdir(), 'och-test-fixtures')

  before(() => {
    fs.mkdirSync(fixturesDir, {recursive: true})
  })

  after(() => {
    fs.rmSync(fixturesDir, {force: true, recursive: true})
  })

  describe('getPlatformConfigDir', () => {
    // 保存/恢复相关环境变量，避免污染其他测试
    const envKeys = ['XDG_CONFIG_HOME', 'OPENCODE_CONFIG_DIR'] as const
    const saved: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const key of envKeys) {
        saved[key] = process.env[key]
        delete process.env[key]
      }
    })

    afterEach(() => {
      for (const key of envKeys) {
        if (saved[key] === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = saved[key]
        }
      }
    })

    it('should fall back to ~/.config/opencode when XDG_CONFIG_HOME is unset', () => {
      // 固化跨平台契约：与 opencode v2 的 xdg-basedir 行为一致
      expect(getPlatformConfigDir()).to.equal(path.join(os.homedir(), '.config', 'opencode'))
    })

    it('should prefer OPENCODE_CONFIG_DIR as the whole config directory', () => {
      const dir = path.join(fixturesDir, 'flag-config-dir')
      process.env.OPENCODE_CONFIG_DIR = dir
      expect(getPlatformConfigDir()).to.equal(dir)
    })
  })

  describe('loadGlobalConfig', () => {
    it('should return null when global config does not exist', () => {
      const result = loadGlobalConfig('/nonexistent/path/opencode.json')
      expect(result).to.be.null
    })

    it('should parse JSONC config with comments', () => {
      const configPath = path.join(fixturesDir, 'global-opencode.json')
      fs.writeFileSync(
        configPath,
        `{
  // This is a comment
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git"
  ]
}`,
      )
      const result = loadGlobalConfig(configPath)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal([
        'superpowers@git+https://github.com/obra/superpowers.git',
      ])
    })

    it('should handle config without plugin field', () => {
      const configPath = path.join(fixturesDir, 'no-plugin.json')
      fs.writeFileSync(
        configPath,
        `{
  "mcp": {}
}`,
      )
      const result = loadGlobalConfig(configPath)
      expect(result).to.not.be.null
      expect(result!.plugin).to.be.undefined
    })
  })

  describe('loadGlobalConfigWithPath 多候选查找', () => {
    let originalXdg: string | undefined
    let originalFlagDir: string | undefined
    let globalRoot: string

    beforeEach(() => {
      // 通过 XDG_CONFIG_HOME 隔离平台配置目录，避免读取开发者真实全局配置
      originalXdg = process.env.XDG_CONFIG_HOME
      originalFlagDir = process.env.OPENCODE_CONFIG_DIR
      delete process.env.OPENCODE_CONFIG_DIR
      globalRoot = path.join(fixturesDir, 'global-home')
      fs.rmSync(globalRoot, {force: true, recursive: true})
      fs.mkdirSync(path.join(globalRoot, 'opencode'), {recursive: true})
      process.env.XDG_CONFIG_HOME = globalRoot
    })

    afterEach(() => {
      // 恢复环境变量，避免污染其他测试
      if (originalXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = originalXdg
      }

      if (originalFlagDir === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR
      } else {
        process.env.OPENCODE_CONFIG_DIR = originalFlagDir
      }
    })

    it('should find opencode.jsonc when only jsonc variant exists', () => {
      const configDir = path.join(globalRoot, 'opencode')
      fs.writeFileSync(path.join(configDir, 'opencode.jsonc'), '{"plugin": ["jsonc-only"]}')
      const result = loadGlobalConfigWithPath()
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(configDir, 'opencode.jsonc'))
      expect(result!.config.plugin).to.deep.equal(['jsonc-only'])
    })

    it('should prefer opencode.jsonc over opencode.json when both exist', () => {
      // v2 语义：loadGlobal 合并三文件时 opencode.jsonc 优先级最高，och 取最高优先文件
      const configDir = path.join(globalRoot, 'opencode')
      fs.writeFileSync(path.join(configDir, 'opencode.json'), '{"plugin": ["plain-json"]}')
      fs.writeFileSync(path.join(configDir, 'opencode.jsonc'), '{"plugin": ["jsonc"]}')
      const result = loadGlobalConfigWithPath()
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(configDir, 'opencode.jsonc'))
      expect(result!.config.plugin).to.deep.equal(['jsonc'])
    })

    it('should find config.json as the last global candidate', () => {
      const configDir = path.join(globalRoot, 'opencode')
      fs.writeFileSync(path.join(configDir, 'config.json'), '{"plugin": ["legacy-config"]}')
      const result = loadGlobalConfigWithPath()
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(configDir, 'config.json'))
      expect(result!.config.plugin).to.deep.equal(['legacy-config'])
    })

    it('should prefer opencode.json over config.json when both exist', () => {
      const configDir = path.join(globalRoot, 'opencode')
      fs.writeFileSync(path.join(configDir, 'opencode.json'), '{"plugin": ["plain-json"]}')
      fs.writeFileSync(path.join(configDir, 'config.json'), '{"plugin": ["legacy-config"]}')
      const result = loadGlobalConfigWithPath()
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(configDir, 'opencode.json'))
      expect(result!.config.plugin).to.deep.equal(['plain-json'])
    })

    it('should respect explicit customPath over candidates', () => {
      const configDir = path.join(globalRoot, 'opencode')
      fs.writeFileSync(path.join(configDir, 'opencode.json'), '{"plugin": ["default"]}')
      const customPath = path.join(fixturesDir, 'custom-global.json')
      fs.writeFileSync(customPath, '{"plugin": ["custom"]}')
      const result = loadGlobalConfigWithPath(customPath)
      expect(result).to.not.be.null
      expect(result!.path).to.equal(customPath)
      expect(result!.config.plugin).to.deep.equal(['custom'])
    })

    it('should respect OPENCODE_CONFIG_DIR over platform config dir', () => {
      const flagDir = path.join(fixturesDir, 'flag-global')
      fs.mkdirSync(flagDir, {recursive: true})
      fs.writeFileSync(path.join(flagDir, 'opencode.json'), '{"plugin": ["flag-dir"]}')
      process.env.OPENCODE_CONFIG_DIR = flagDir
      const result = loadGlobalConfigWithPath()
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(flagDir, 'opencode.json'))
      expect(result!.config.plugin).to.deep.equal(['flag-dir'])
    })
  })

  describe('describeConfigLocations', () => {
    it('should list global candidates including config.json', () => {
      const text = describeConfigLocations(true)
      expect(text).to.include('opencode.jsonc')
      expect(text).to.include('config.json')
    })

    it('should list project candidates', () => {
      const text = describeConfigLocations(false)
      expect(text).to.include('opencode.jsonc')
      expect(text).to.include('.opencode.jsonc')
      expect(text).to.include('.opencode/opencode.json')
    })
  })

  describe('saveConfig', () => {
    it('should preserve comments when writing back to existing jsonc file', () => {
      const configPath = path.join(fixturesDir, 'save-with-comments.jsonc')
      fs.writeFileSync(
        configPath,
        `{
  // 我的最爱插件
  "plugin": [
    "plugin-a"
  ],
  // 其他设置
  "mcp": {}
}`,
      )

      saveConfig(configPath, {mcp: {}, plugin: ['plugin-a', 'plugin-b']})

      // 注释应保留
      const content = fs.readFileSync(configPath, 'utf8')
      expect(content).to.include('// 我的最爱插件')
      expect(content).to.include('// 其他设置')
      // plugin 数组应已更新
      const parsed = parseJsonc(content) as {mcp: object; plugin: string[]}
      expect(parsed.plugin).to.deep.equal(['plugin-a', 'plugin-b'])
      expect(parsed.mcp).to.deep.equal({})
    })

    it('should keep plain json format when writing back to existing json file', () => {
      const configPath = path.join(fixturesDir, 'save-plain.json')
      fs.writeFileSync(configPath, `{\n  "plugin": ["plugin-a"]\n}\n`)

      saveConfig(configPath, {plugin: []})

      const content = fs.readFileSync(configPath, 'utf8')
      expect(JSON.parse(content)).to.deep.equal({plugin: []})
      // 保持 2 空格缩进与尾换行的原有格式
      expect(content).to.equal('{\n  "plugin": []\n}\n')
    })

    it('should create pure json file when target does not exist', () => {
      const configPath = path.join(fixturesDir, 'save-new', 'opencode.json')

      saveConfig(configPath, {plugin: ['new-plugin']})

      const content = fs.readFileSync(configPath, 'utf8')
      expect(JSON.parse(content)).to.deep.equal({plugin: ['new-plugin']})
      expect(content.endsWith('\n')).to.be.true
    })
  })

  describe('loadProjectConfig', () => {
    it('should return null when no config found in directory tree', () => {
      const emptyDir = path.join(fixturesDir, 'empty-project')
      fs.mkdirSync(emptyDir, {recursive: true})
      const result = loadProjectConfig(emptyDir)
      expect(result).to.be.null
    })

    it('should find .opencode/opencode.json in project directory', () => {
      const projectRoot = path.join(fixturesDir, 'opencode-dir-proj')
      fs.rmSync(projectRoot, {force: true, recursive: true})
      fs.mkdirSync(path.join(projectRoot, '.opencode'), {recursive: true})
      fs.writeFileSync(
        path.join(projectRoot, '.opencode', 'opencode.json'),
        '{"plugin": ["in-dir"]}',
      )
      const result = loadProjectConfigWithPath(projectRoot)
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(projectRoot, '.opencode', 'opencode.json'))
      expect(result!.config.plugin).to.deep.equal(['in-dir'])
    })

    it('should prefer direct config declaring plugin keys over .opencode config without them', () => {
      // 单文件模型关键规则：同层优先选择声明了插件键的文件，避免漏配
      const projectRoot = path.join(fixturesDir, 'plugin-key-pref')
      fs.rmSync(projectRoot, {force: true, recursive: true})
      fs.mkdirSync(path.join(projectRoot, '.opencode'), {recursive: true})
      fs.writeFileSync(path.join(projectRoot, 'opencode.json'), '{"plugin": ["direct"]}')
      fs.writeFileSync(
        path.join(projectRoot, '.opencode', 'opencode.json'),
        '{"model": "x"}',
      )
      const result = loadProjectConfigWithPath(projectRoot)
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(projectRoot, 'opencode.json'))
      expect(result!.config.plugin).to.deep.equal(['direct'])
    })

    it('should prefer .opencode config over direct config when neither declares plugin keys', () => {
      // v2 合并语义：.opencode 覆盖直连文件，无插件键时保持该优先级
      const projectRoot = path.join(fixturesDir, 'no-key-order')
      fs.rmSync(projectRoot, {force: true, recursive: true})
      fs.mkdirSync(path.join(projectRoot, '.opencode'), {recursive: true})
      fs.writeFileSync(path.join(projectRoot, 'opencode.json'), '{"model": "direct"}')
      fs.writeFileSync(path.join(projectRoot, '.opencode', 'opencode.json'), '{"model": "in-dir"}')
      const result = loadProjectConfigWithPath(projectRoot)
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(projectRoot, '.opencode', 'opencode.json'))
    })

    it('should prefer .opencode config when both declare plugin keys', () => {
      const projectRoot = path.join(fixturesDir, 'both-keys-order')
      fs.rmSync(projectRoot, {force: true, recursive: true})
      fs.mkdirSync(path.join(projectRoot, '.opencode'), {recursive: true})
      fs.writeFileSync(path.join(projectRoot, 'opencode.json'), '{"plugin": ["direct"]}')
      fs.writeFileSync(path.join(projectRoot, '.opencode', 'opencode.json'), '{"plugin": ["in-dir"]}')
      const result = loadProjectConfigWithPath(projectRoot)
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(projectRoot, '.opencode', 'opencode.json'))
      expect(result!.config.plugin).to.deep.equal(['in-dir'])
    })

    it('should find opencode.json in current directory', () => {
      const projectDir = path.join(fixturesDir, 'project-a')
      fs.mkdirSync(projectDir, {recursive: true})
      fs.writeFileSync(
        path.join(projectDir, 'opencode.json'),
        `{
  "plugin": ["@gopowerteam/opencode-commit"]
}`,
      )
      const result = loadProjectConfig(projectDir)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal(['@gopowerteam/opencode-commit'])
    })

    it('should find .opencode.json as fallback', () => {
      const projectDir = path.join(fixturesDir, 'project-b')
      fs.mkdirSync(projectDir, {recursive: true})
      fs.writeFileSync(
        path.join(projectDir, '.opencode.json'),
        `{"plugin": ["test-plugin"]}`,
      )
      const result = loadProjectConfig(projectDir)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal(['test-plugin'])
    })

    it('should search parent directories', () => {
      const rootDir = path.join(fixturesDir, 'project-c')
      const subDir = path.join(rootDir, 'sub', 'deep')
      fs.mkdirSync(subDir, {recursive: true})
      fs.writeFileSync(
        path.join(rootDir, 'opencode.json'),
        `{"plugin": ["parent-plugin"]}`,
      )
      const result = loadProjectConfig(subDir)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal(['parent-plugin'])
    })
  })
})
