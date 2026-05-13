import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {resolvePluginInfo, upgradePlugin} from '../../../src/services/plugin.js'

describe('plugin upgrade', () => {
  const cacheDir = path.join(os.tmpdir(), 'och-test-upgrade-cache')

  beforeEach(() => {
    fs.rmSync(cacheDir, {force: true, recursive: true})
  })

  after(() => {
    fs.rmSync(cacheDir, {force: true, recursive: true})
  })

  /**
   * 辅助函数：在缓存目录中模拟已安装的插件
   */
  function mockInstalledPlugin(ref: string, version: string): void {
    const match = ref.match(/^(.+?)@(\d+\.\d+\.\d+.*)$/)
    const name = match ? match[1] : ref
    const suffix = match ? `${ref}` : `${ref}@latest`
    const pkgDir = path.join(cacheDir, suffix, 'node_modules', ...name.split('/'))
    fs.mkdirSync(pkgDir, {recursive: true})
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({name, version}),
    )
  }

  it('skips fixed version npm plugin', async () => {
    mockInstalledPlugin('my-plugin@1.0.0', '1.0.0')
    const result = await upgradePlugin('my-plugin@1.0.0', cacheDir)
    expect(result.status).to.equal('skipped')
    expect(result.message).to.include('固定版本')
  })

  it('skips plugin not installed yet', async () => {
    const result = await upgradePlugin('nonexistent-plugin', cacheDir)
    expect(result.status).to.equal('skipped')
    expect(result.message).to.include('尚未安装')
  })

  it('reports previous version for fixed version plugin', async () => {
    mockInstalledPlugin('foo@2.0.0', '2.0.0')
    const result = await upgradePlugin('foo@2.0.0', cacheDir)
    expect(result.previousVersion).to.equal('2.0.0')
    expect(result.currentVersion).to.equal('2.0.0')
    expect(result.status).to.equal('skipped')
  })

  it('reports null previous version when not installed', async () => {
    const result = await upgradePlugin('missing-plugin', cacheDir)
    expect(result.previousVersion).to.be.null
    expect(result.currentVersion).to.be.null
  })

  describe('interactive', () => {
    it('resolvePluginInfo returns current version for installed plugin', async () => {
      mockInstalledPlugin('test-plugin@1.0.0', '1.0.0')
      const info = await resolvePluginInfo('test-plugin@1.0.0', cacheDir)
      expect(info.name).to.equal('test-plugin')
      expect(info.current).to.equal('1.0.0')
    })

    it('resolvePluginInfo returns null current for uninstalled plugin', async () => {
      const info = await resolvePluginInfo('nonexistent-plugin', cacheDir)
      expect(info.name).to.equal('nonexistent-plugin')
      expect(info.current).to.be.null
    })

    it('resolvePluginInfo returns null current for plain ref without cache', async () => {
      const info = await resolvePluginInfo('some-plugin', cacheDir)
      expect(info.current).to.be.null
    })
  })
})
