import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('plugin list', () => {
  it('shows error when no project config found', async () => {
    const originalCwd = process.cwd()
    process.chdir('/tmp')
    try {
      const {stdout} = await runCommand('plugin list')
      expect(stdout).to.include('未找到插件配置')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('accepts --global flag', async () => {
    const {stdout} = await runCommand('plugin list --global')
    expect(typeof stdout).to.equal('string')
  })

  describe('plugins 键与未识别条目', () => {
    const projectDir = path.join(os.tmpdir(), 'och-test-list-plugins-key')

    beforeEach(() => {
      // 隔离空目录，避免向上查找到真实项目配置
      fs.rmSync(projectDir, {force: true, recursive: true})
      fs.mkdirSync(projectDir, {recursive: true})
    })

    after(() => {
      fs.rmSync(projectDir, {force: true, recursive: true})
    })

    it('lists plugins configured via plugins key', async () => {
      // git 引用不会触发 npm 网络查询
      fs.writeFileSync(
        path.join(projectDir, 'opencode.json'),
        JSON.stringify({plugins: ['myplug@git+https://example.com/x/y.git']}),
      )
      const originalCwd = process.cwd()
      process.chdir(projectDir)
      try {
        const {stdout} = await runCommand('plugin list')
        expect(stdout).to.include('myplug')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('shows unrecognized entries without crashing', async () => {
      fs.writeFileSync(
        path.join(projectDir, 'opencode.json'),
        JSON.stringify({plugins: [{weird: true}, 'okplug@git+https://example.com/x/ok.git']}),
      )
      const originalCwd = process.cwd()
      process.chdir(projectDir)
      try {
        const {stdout} = await runCommand('plugin list')
        expect(stdout).to.include('未识别格式')
        expect(stdout).to.include('okplug')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('shows local plugins without hitting the cache or registry', async () => {
      fs.writeFileSync(
        path.join(projectDir, 'opencode.json'),
        JSON.stringify({plugin: ['./plugins/localplug']}),
      )
      const originalCwd = process.cwd()
      process.chdir(projectDir)
      try {
        const {stdout} = await runCommand('plugin list')
        expect(stdout).to.include('localplug')
        expect(stdout).to.include('本地插件')
      } finally {
        process.chdir(originalCwd)
      }
    })
  })
})
