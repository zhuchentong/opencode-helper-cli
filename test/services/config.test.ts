import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {loadGlobalConfig, loadProjectConfig} from '../../src/services/config.js'

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
