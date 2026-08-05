import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getPlatformConfigDir,
  loadGlobalConfig,
  loadProjectConfig,
} from '../../src/services/config.js'

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

    it('should prefer .opencode/opencode.json over legacy root files', () => {
      // opencode 1.x 把项目级配置放到 .opencode/opencode.json
      const projectDir = path.join(fixturesDir, 'project-new-style')
      fs.mkdirSync(path.join(projectDir, '.opencode'), {recursive: true})
      fs.writeFileSync(
        path.join(projectDir, '.opencode', 'opencode.json'),
        `{"plugin": ["new-style-plugin"]}`,
      )
      // 仍然存在的旧位置，必须被新位置覆盖
      fs.writeFileSync(
        path.join(projectDir, 'opencode.json'),
        `{"plugin": ["legacy-plugin"]}`,
      )
      const result = loadProjectConfig(projectDir)
      expect(result).to.not.be.null
      expect(result!.plugin).to.deep.equal(['new-style-plugin'])
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

  describe('getPlatformConfigDir', () => {
    const originalXdgHome = process.env.XDG_CONFIG_HOME
    const originalAppData = process.env.APPDATA

    afterEach(() => {
      if (originalXdgHome === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgHome
      }

      if (originalAppData === undefined) {
        delete process.env.APPDATA
      } else {
        process.env.APPDATA = originalAppData
      }
    })

    it('returns $XDG_CONFIG_HOME/opencode when XDG_CONFIG_HOME is set', () => {
      process.env.XDG_CONFIG_HOME = path.join(os.tmpdir(), 'xdg-config-fixture')
      delete process.env.APPDATA
      expect(getPlatformConfigDir()).to.equal(
        path.join(os.tmpdir(), 'xdg-config-fixture', 'opencode'),
      )
    })

    it('falls back to ~/.config/opencode (XDG), not %APPDATA%', () => {
      delete process.env.XDG_CONFIG_HOME
      delete process.env.APPDATA
      expect(getPlatformConfigDir()).to.equal(
        path.join(os.homedir(), '.config', 'opencode'),
      )
    })

    it('ignores non-absolute XDG_CONFIG_HOME', () => {
      process.env.XDG_CONFIG_HOME = 'relative/config'
      delete process.env.APPDATA
      expect(getPlatformConfigDir()).to.equal(
        path.join(os.homedir(), '.config', 'opencode'),
      )
    })
  })
})