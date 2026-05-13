import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {parsePluginRef, resolvePluginInfo} from '../../src/services/plugin.js'

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
})
