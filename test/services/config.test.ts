import {expect} from 'chai'
import {parse as parseJsonc} from 'jsonc-parser'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {loadGlobalConfig, loadGlobalConfigWithPath, loadProjectConfig, saveConfig} from '../../src/services/config.js'

describe('config service', () => {
  const fixturesDir = path.join(os.tmpdir(), 'och-test-fixtures')

  before(() => {
    fs.mkdirSync(fixturesDir, {recursive: true})
  })

  after(() => {
    fs.rmSync(fixturesDir, {force: true, recursive: true})
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
    let globalRoot: string

    beforeEach(() => {
      // 通过 XDG_CONFIG_HOME 隔离平台配置目录，避免读取开发者真实全局配置
      originalXdg = process.env.XDG_CONFIG_HOME
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
    })

    it('should find opencode.jsonc when only jsonc variant exists', () => {
      const configDir = path.join(globalRoot, 'opencode')
      fs.writeFileSync(path.join(configDir, 'opencode.jsonc'), '{"plugin": ["jsonc-only"]}')
      const result = loadGlobalConfigWithPath()
      expect(result).to.not.be.null
      expect(result!.path).to.equal(path.join(configDir, 'opencode.jsonc'))
      expect(result!.config.plugin).to.deep.equal(['jsonc-only'])
    })

    it('should prefer opencode.json over opencode.jsonc when both exist', () => {
      const configDir = path.join(globalRoot, 'opencode')
      fs.writeFileSync(path.join(configDir, 'opencode.json'), '{"plugin": ["plain-json"]}')
      fs.writeFileSync(path.join(configDir, 'opencode.jsonc'), '{"plugin": ["jsonc"]}')
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
