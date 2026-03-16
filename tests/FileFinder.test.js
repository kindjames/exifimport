const fs = require('fs/promises')
const path = require('path')
const FileFinder = require('../src/FileFinder')

describe('FileFinder', () => {
  let testDir
  let fileFinder

  async function createTestDirectoryStructure() {
    testDir = path.join(__dirname, 'testDir')
    await fs.mkdir(testDir, { recursive: true })
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'Hello')
    await fs.mkdir(path.join(testDir, 'subDir'))
    await fs.writeFile(path.join(testDir, 'subDir', 'file2.jpg'), 'Image')
    await fs.writeFile(path.join(testDir, 'subDir', 'file3.jpg'), 'Image')
    await fs.writeFile(path.join(testDir, 'subDir', 'file4.cr2'), 'Image')
    await fs.writeFile(path.join(testDir, 'subDir', 'file5.cr3'), 'Image')
  }

  async function removeTestDirectory() {
    await fs.rm(testDir, { recursive: true, force: true })
  }

  beforeAll(createTestDirectoryStructure)
  afterAll(removeTestDirectory)

  it('should initialize with the correct startPath and extensions', () => {
    fileFinder = new FileFinder(testDir, ['jpg', 'cr2', 'cr3'])
    expect(fileFinder.directories).toEqual([testDir])
    expect(fileFinder.extensions).toEqual(new Set(['.jpg', '.cr2', '.cr3']))
  })

  it('should correctly identify matching extensions', () => {
    expect(fileFinder.hasMatchingExtension('file1.txt')).toBeFalsy()
    expect(fileFinder.hasMatchingExtension('file2.jpg')).toBeTruthy()
    expect(fileFinder.hasMatchingExtension('file3.jpg')).toBeTruthy()
    expect(fileFinder.hasMatchingExtension('file4.cr2')).toBeTruthy()
    expect(fileFinder.hasMatchingExtension('file5.cr3')).toBeTruthy()
  })

  it('should emit correct files while reading directories', (done) => {
    const finder = new FileFinder(testDir, ['jpg', 'cr2', 'cr3'])
    const emittedFiles = []

    finder.on('data', (data) => {
      emittedFiles.push(path.basename(data.filePath))
    })

    finder.on('end', () => {
      expect(emittedFiles.sort()).toEqual([
        'file2.jpg',
        'file3.jpg',
        'file4.cr2',
        'file5.cr3',
      ])
      done()
    })
  })
})
