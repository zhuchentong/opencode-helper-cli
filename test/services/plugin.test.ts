import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {OpenCodeConfig} from '../../src/types.js'

import {getPackageCacheDir, getPlatformCacheDir, isPinnedNpmRef, normalizePluginEntries, parsePluginRef, readPluginEntries, removePluginRefs, resolvePluginInfo} from '../../src/services/plugin.js'

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
        pinned: true,
        type: 'npm',
        version: '1.2.3',
      })
    })

    it('should parse local relative path', () => {
      const result = parsePluginRef('./plugins/myplug')
      expect(result).to.deep.equal({
        name: './plugins/myplug',
        type: 'local',
      })
    })

    it('should parse local absolute path', () => {
      const result = parsePluginRef('/opt/myplug')
      expect(result).to.deep.equal({name: '/opt/myplug', type: 'local'})
    })

    it('should parse local home path', () => {
      const result = parsePluginRef('~/plugins/myplug')
      expect(result).to.deep.equal({name: '~/plugins/myplug', type: 'local'})
    })

    it('should parse file URL as local', () => {
      const result = parsePluginRef('file:///opt/myplug')
      expect(result).to.deep.equal({name: 'file:///opt/myplug', type: 'local'})
    })

    it('should parse windows drive path as local', () => {
      // 对齐 v2 isAbsolutePath：盘符路径视为本地插件
      const result = parsePluginRef('C:\\tools\\myplug')
      expect(result).to.deep.equal({name: 'C:\\tools\\myplug', type: 'local'})
    })

    it('should parse github shorthand', () => {
      const result = parsePluginRef('github:owner/repo')
      expect(result).to.deep.equal({
        name: 'owner/repo',
        type: 'git',
        url: 'github:owner/repo',
      })
    })

    it('should parse github shorthand with fragment', () => {
      const result = parsePluginRef('github:owner/repo#v1.0.0')
      expect(result).to.deep.equal({
        name: 'owner/repo',
        type: 'git',
        url: 'github:owner/repo#v1.0.0',
      })
    })

    it('should parse semver range as unpinned', () => {
      const result = parsePluginRef('plug@^1.2.3')
      expect(result).to.deep.equal({
        name: 'plug',
        pinned: false,
        type: 'npm',
        version: '^1.2.3',
      })
    })

    it('should parse partial range as unpinned', () => {
      const result = parsePluginRef('plug@1.2.x')
      expect(result).to.deep.equal({
        name: 'plug',
        pinned: false,
        type: 'npm',
        version: '1.2.x',
      })
    })

    it('should parse tag as unpinned', () => {
      const result = parsePluginRef('plug@beta')
      expect(result).to.deep.equal({
        name: 'plug',
        pinned: false,
        type: 'npm',
        version: 'beta',
      })
    })
  })

  describe('isPinnedNpmRef', () => {
    it('should be true only for exact npm versions', () => {
      expect(isPinnedNpmRef(parsePluginRef('plug@1.2.3'))).to.be.true
      expect(isPinnedNpmRef(parsePluginRef('plug@1.2.3-beta.1'))).to.be.true
      expect(isPinnedNpmRef(parsePluginRef('plug@^1.2.3'))).to.be.false
      expect(isPinnedNpmRef(parsePluginRef('plug@latest'))).to.be.false
      expect(isPinnedNpmRef(parsePluginRef('plug'))).to.be.false
      expect(isPinnedNpmRef(parsePluginRef('plug@git+https://x/y.git'))).to.be.false
    })
  })

  describe('getPackageCacheDir', () => {
    it('should map npm ref to <base>/<ref> (v2 原始 spec 命名)', () => {
      expect(getPackageCacheDir('a@1.0.0', '/cache')).to.equal(path.join('/cache', 'a@1.0.0'))
    })

    it('should append @latest for plain npm name', () => {
      expect(getPackageCacheDir('my-plugin', '/cache')).to.equal(path.join('/cache', 'my-plugin@latest'))
    })

    it('should keep raw git spec as dir name (v2 sanitize 语义)', () => {
      // v2 core/npm.ts：目录名为 sanitize 后的原始 spec，POSIX 下不做字符替换
      expect(getPackageCacheDir('a@git+https://x/y.git', '/cache')).to.equal(
        path.join('/cache', 'a@git+https://x/y.git'),
      )
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

  describe('readPluginEntries', () => {
    it('should read plugin key when present', () => {
      const config: OpenCodeConfig = {plugin: ['a', 'b']}
      const result = readPluginEntries(config)
      expect(result.key).to.equal('plugin')
      expect(result.raw).to.deep.equal(['a', 'b'])
    })

    it('should read plugins key when plugin key is absent', () => {
      const config = {plugins: ['a', {package: 'b', options: {}}]} as OpenCodeConfig
      const result = readPluginEntries(config)
      expect(result.key).to.equal('plugins')
      expect(result.raw).to.deep.equal(['a', {package: 'b', options: {}}])
    })

    it('should treat plugin key as authoritative when both keys exist', () => {
      // v2 迁移语义：plugin 键存在时整体走 v1 迁移，字面 plugins 键被丢弃
      const config = {plugin: ['from-plugin'], plugins: ['from-plugins']} as OpenCodeConfig
      const result = readPluginEntries(config)
      expect(result.key).to.equal('plugin')
      expect(result.raw).to.deep.equal(['from-plugin'])
    })

    it('should return empty raw when neither key exists', () => {
      const result = readPluginEntries({} as OpenCodeConfig)
      expect(result.key).to.equal('plugin')
      expect(result.raw).to.deep.equal([])
    })
  })

  describe('normalizePluginEntries', () => {
    it('should normalize string entries as managed', () => {
      const entries = normalizePluginEntries(['my-plugin', 'superpowers@git+https://example.com/x.git'])
      expect(entries).to.have.lengthOf(2)
      expect(entries[0]).to.include({managed: true, name: 'my-plugin', ref: 'my-plugin'})
      expect(entries[1]).to.include({
        managed: true,
        name: 'superpowers',
        ref: 'superpowers@git+https://example.com/x.git',
      })
    })

    it('should normalize v2 object entries with options preserved', () => {
      const entries = normalizePluginEntries([{package: 'my-plugin', options: {enabled: true}}])
      expect(entries).to.have.lengthOf(1)
      expect(entries[0]!.managed).to.be.true
      expect(entries[0]!.name).to.equal('my-plugin')
      expect(entries[0]!.ref).to.equal('my-plugin')
      expect(entries[0]!.options).to.deep.equal({enabled: true})
    })

    it('should normalize v1 tuple entries with options preserved', () => {
      const entries = normalizePluginEntries([['my-plugin', {strict: true}]])
      expect(entries).to.have.lengthOf(1)
      expect(entries[0]!.managed).to.be.true
      expect(entries[0]!.name).to.equal('my-plugin')
      expect(entries[0]!.options).to.deep.equal({strict: true})
    })

    it('should mark invalid entries as unmanaged and keep raw', () => {
      const raw = {weird: true}
      const entries = normalizePluginEntries([42, raw])
      expect(entries).to.have.lengthOf(2)
      expect(entries[0].managed).to.be.false
      expect(entries[1].managed).to.be.false
      expect(entries[1].raw).to.equal(raw)
    })
  })

  describe('removePluginRefs', () => {
    it('should remove managed entries by name and keep unmanaged raw', () => {
      const config = {
        plugin: ['a@1.0.0', {package: 'keep-obj'}, ['b', {}], {weird: 1}],
      } as OpenCodeConfig
      const result = removePluginRefs(config, ['a', 'b', 'unknown'])
      expect(result.removed.sort()).to.deep.equal(['a', 'b'])
      // 未识别条目原样保留
      expect(result.remaining).to.deep.equal([{package: 'keep-obj'}, {weird: 1}])
      expect(result.key).to.equal('plugin')
    })

    it('should keep the authoritative plugins key when config uses plugins', () => {
      const config = {plugins: ['a', 'c']} as OpenCodeConfig
      const result = removePluginRefs(config, ['a'])
      expect(result.key).to.equal('plugins')
      expect(result.remaining).to.deep.equal(['c'])
    })

    it('should match entries by full ref as well as name', () => {
      const config = {plugin: ['a@1.0.0', 'b']} as OpenCodeConfig
      const result = removePluginRefs(config, ['a@1.0.0'])
      expect(result.removed).to.deep.equal(['a'])
      expect(result.remaining).to.deep.equal(['b'])
    })
  })

  describe('getPlatformCacheDir', () => {
    const saved = process.env.XDG_CACHE_HOME

    afterEach(() => {
      // 恢复环境变量，避免污染其他测试
      if (saved === undefined) {
        delete process.env.XDG_CACHE_HOME
      } else {
        process.env.XDG_CACHE_HOME = saved
      }
    })

    it('should fall back to ~/.cache/opencode when XDG_CACHE_HOME is unset', () => {
      delete process.env.XDG_CACHE_HOME
      // 固化跨平台契约：与 opencode v2 的 xdg-basedir 行为一致
      expect(getPlatformCacheDir()).to.equal(path.join(os.homedir(), '.cache', 'opencode'))
    })

    it('should prefer XDG_CACHE_HOME when set to absolute path', () => {
      process.env.XDG_CACHE_HOME = path.join(os.tmpdir(), 'och-test-xdg-cache')
      expect(getPlatformCacheDir()).to.equal(process.env.XDG_CACHE_HOME)
    })
  })
})
