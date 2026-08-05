import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getPlatformCacheDir,
  parsePluginRef,
  resolvePluginInfo,
} from '../../src/services/plugin.js'

describe('plugin service', () => {
  describe('parsePluginRef', () => {
    it('should parse npm scoped package', () => {
      const result = parsePluginRef('@gopowerteam/opencode-commit')
      expect(result).to.deep.equal({
        name: '@gopowerteam/opencode-commit',
        type: 'npm',
      })
    })

    it('should parse npm unscoped package', () => {
      const result = parsePluginRef('my-plugin')
      expect(result).to.deep.equal({
        name: 'my-plugin',
        type: 'npm',
      })
    })

    it('should parse git reference', () => {
      const result = parsePluginRef('superpowers@git+https://github.com/obra/superpowers.git')
      expect(result).to.deep.equal({
        name: 'superpowers',
        type: 'git',
        url: 'git+https://github.com/obra/superpowers.git',
      })
    })

    it('should parse npm versioned package', () => {
      const result = parsePluginRef('plugin@1.2.3')
      expect(result).to.deep.equal({
        name: 'plugin',
        type: 'npm',
        version: '1.2.3',
      })
    })

    it('should parse npm scoped package with @latest tag', () => {
      const result = parsePluginRef('@plannotator/opencode@latest')
      expect(result).to.deep.equal({
        name: '@plannotator/opencode',
        type: 'npm',
        version: 'latest',
      })
    })

    it('should parse npm package with @latest tag', () => {
      const result = parsePluginRef('opencode-pty@latest')
      expect(result).to.deep.equal({
        name: 'opencode-pty',
        type: 'npm',
        version: 'latest',
      })
    })

    it('should parse npm package with non-@latest tag', () => {
      const result = parsePluginRef('plugin@beta')
      expect(result).to.deep.equal({
        name: 'plugin',
        type: 'npm',
        version: 'beta',
      })
    })
  })

  describe('resolvePluginInfo', () => {
    const cacheDir = path.join(os.tmpdir(), 'och-test-cache')

    beforeEach(() => {
      fs.rmSync(cacheDir, {force: true, recursive: true})
    })

    after(() => {
      fs.rmSync(cacheDir, {force: true, recursive: true})
    })

    it('should resolve current version from installed package', async () => {
      const pkgDir = path.join(cacheDir, 'my-plugin@latest', 'node_modules', 'my-plugin')
      fs.mkdirSync(pkgDir, {recursive: true})
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({name: 'my-plugin', version: '1.0.0'}),
      )

      const result = await resolvePluginInfo('my-plugin', cacheDir)
      expect(result.name).to.equal('my-plugin')
      expect(result.current).to.equal('1.0.0')
    })

    it('should return null current version when not installed', async () => {
      const result = await resolvePluginInfo('nonexistent', cacheDir)
      expect(result.name).to.equal('nonexistent')
      expect(result.current).to.be.null
    })

    it('should resolve scoped package from cache', async () => {
      const pkgDir = path.join(
        cacheDir,
        '@gopowerteam/opencode-commit@latest',
        'node_modules',
        '@gopowerteam',
        'opencode-commit',
      )
      fs.mkdirSync(pkgDir, {recursive: true})
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({name: '@gopowerteam/opencode-commit', version: '0.0.6'}),
      )

      const result = await resolvePluginInfo('@gopowerteam/opencode-commit', cacheDir)
      expect(result.current).to.equal('0.0.6')
    })
  })

  describe('getPlatformCacheDir', () => {
    const originalCacheHome = process.env.XDG_CACHE_HOME
    const originalAppData = process.env.LOCALAPPDATA

    afterEach(() => {
      // 恢复原始环境变量，避免污染其他测试
      if (originalCacheHome === undefined) {
        delete process.env.XDG_CACHE_HOME
      } else {
        process.env.XDG_CACHE_HOME = originalCacheHome
      }

      if (originalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = originalAppData
      }
    })

    it('returns $XDG_CACHE_HOME/opencode when XDG_CACHE_HOME is set', () => {
      process.env.XDG_CACHE_HOME = path.join(os.tmpdir(), 'xdg-cache-fixture')
      delete process.env.LOCALAPPDATA
      expect(getPlatformCacheDir()).to.equal(
        path.join(os.tmpdir(), 'xdg-cache-fixture', 'opencode'),
      )
    })

    it('falls back to ~/.cache/opencode (XDG), not %LOCALAPPDATA%', () => {
      delete process.env.XDG_CACHE_HOME
      delete process.env.LOCALAPPDATA
      expect(getPlatformCacheDir()).to.equal(
        path.join(os.homedir(), '.cache', 'opencode'),
      )
    })

    it('ignores non-absolute XDG_CACHE_HOME', () => {
      // XDG 规范要求必须是绝对路径，相对路径应被忽略
      process.env.XDG_CACHE_HOME = 'relative/cache'
      delete process.env.LOCALAPPDATA
      expect(getPlatformCacheDir()).to.equal(
        path.join(os.homedir(), '.cache', 'opencode'),
      )
    })
  })
})