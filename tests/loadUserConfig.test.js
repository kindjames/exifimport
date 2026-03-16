const loadUserConfig = require('../src/loadUserConfig')
const fs = require('fs')

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}))

describe('loadUserConfig function', () => {
  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods
    fs.promises.readFile.mockClear()
  })

  it('should read valid TOML and return destination', async () => {
    process.env.HOME = '/some/path'
    fs.promises.readFile.mockResolvedValue('destination = "/dest/path"')
    const result = await loadUserConfig()
    expect(result).toEqual({ destination: '/dest/path' })
  })

  it('should throw an error for invalid TOML', async () => {
    process.env.HOME = '/some/path'
    fs.promises.readFile.mockResolvedValue('invalid TOML content')
    await expect(loadUserConfig()).rejects.toThrow(/could not read/)
  })

  it('should return undefined if the file is not found', async () => {
    process.env.HOME = '/some/path'
    fs.promises.readFile.mockRejectedValue(new Error('File not found'))
    const result = await loadUserConfig()
    expect(result).toBeUndefined()
  })

  it('should handle missing HOME/USERPROFILE environment variables', async () => {
    delete process.env.HOME
    delete process.env.USERPROFILE
    fs.promises.readFile.mockResolvedValue('destination = "/dest/path"')
    const result = await loadUserConfig()
    expect(result).toBeUndefined()
  })
})
