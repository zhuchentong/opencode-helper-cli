import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('plugin list', () => {
  it('shows error when no project config found', async () => {
    const originalCwd = process.cwd()
    process.chdir('/tmp')
    try {
      const {error} = await runCommand('plugin list')
      expect(error?.message).to.include('No project opencode config found')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('accepts --global flag', async () => {
    const {stdout} = await runCommand('plugin list --global')
    expect(typeof stdout).to.equal('string')
  })
})
