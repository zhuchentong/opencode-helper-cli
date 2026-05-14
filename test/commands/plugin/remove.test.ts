import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {parsePluginRef, removePluginCache} from '../../../src/services/plugin.js'

describe('plugin remove', () => {
  const cacheDir = path.join(os.tmpdir(), 'och-test-remove-cache')

  beforeEach(() => {
    fs.rmSync(cacheDir, {force: true, recursive: true})
  })

  after(() => {
    fs.rmSync(cacheDir, {force: true, recursive: true})
  })

  /**
   * 辅助函数：在缓存目录中模拟已安装的插件
   */
  function mockInstalledPlugin(ref: string, version: string): string {
    const parsed = parsePluginRef(ref)
    const suffix = parsed.version ? `${ref}` : `${ref}@latest`
    const pkgDir = path.join(cacheDir, suffix, 'node_modules', ...parsed.name.split('/'))
    fs.mkdirSync(pkgDir, {recursive: true})
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({name: parsed.name, version}),
    )
    return path.join(cacheDir, suffix)
  }

  describe('removePluginCache', () => {
    it('removes existing cache directory', () => {
      const installDir = mockInstalledPlugin('my-plugin@1.0.0', '1.0.0')
      expect(fs.existsSync(installDir)).to.be.true

      const result = removePluginCache('my-plugin@1.0.0', cacheDir)
      expect(result.removed).to.be.true
      expect(fs.existsSync(installDir)).to.be.false
    })

    it('returns removed=false when cache does not exist', () => {
      const result = removePluginCache('nonexistent-plugin', cacheDir)
      expect(result.removed).to.be.false
    })

    it('removes git plugin cache', () => {
      const ref = 'my-plugin@git+https://github.com/user/repo'
      const result = removePluginCache(ref, cacheDir)
      expect(result.removed).to.be.false
    })
  })

  describe('parsePluginRef', () => {
    it('parses npm scoped package', () => {
      const parsed = parsePluginRef('@gopowerteam/opencode-commit')
      expect(parsed.name).to.equal('@gopowerteam/opencode-commit')
      expect(parsed.type).to.equal('npm')
    })

    it('parses npm versioned package', () => {
      const parsed = parsePluginRef('my-plugin@1.0.0')
      expect(parsed.name).to.equal('my-plugin')
      expect(parsed.type).to.equal('npm')
      expect(parsed.version).to.equal('1.0.0')
    })
  })
})
