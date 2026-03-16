const fs = require('fs/promises')
const path = require('path')
const { pipeline } = require('stream/promises')
const FileFinder = require('../src/FileFinder')
const ExifReader = require('../src/ExifReader')
const FileWriter = require('../src/FileWriter')

// Mock exiftool-vendored to avoid needing real EXIF data
jest.mock('exiftool-vendored', () => ({
  ExifTool: jest.fn().mockImplementation(() => {
    const mockRead = jest.fn().mockImplementation((filePath) => {
      const filename = require('path').basename(filePath)
      const isVideo = filename.endsWith('.mp4') || filename.endsWith('.mov')
      return Promise.resolve({
        FileName: filename,
        SourceFile: filePath,
        MIMEType: isVideo ? 'video/mp4' : 'image/jpeg',
        Model: 'TestCamera',
        LensModel: 'TestLens',
        DateTimeOriginal: {
          rawValue: '2024:06:15 14:30:00',
          hasZone: false,
        },
      })
    })
    return { read: mockRead, end: jest.fn() }
  }),
}))

// Mock utimes
jest.mock('utimes', () => ({
  utimes: jest.fn().mockResolvedValue(undefined),
}))

describe('Integration: FileFinder → ExifReader → FileWriter', () => {
  const testDir = path.join(__dirname, 'integrationTestDir')
  const sourceDir = path.join(testDir, 'source')
  const nestedDir = path.join(sourceDir, 'nested')
  const destDir = path.join(testDir, 'dest')

  beforeAll(async () => {
    await fs.mkdir(nestedDir, { recursive: true })
    await fs.writeFile(path.join(sourceDir, 'photo1.jpg'), 'jpg content 1')
    await fs.writeFile(path.join(sourceDir, 'photo2.cr3'), 'cr3 content')
    await fs.writeFile(path.join(nestedDir, 'photo3.jpg'), 'jpg content 2')
    await fs.writeFile(path.join(nestedDir, 'video1.mp4'), 'mp4 content')
    // Hidden file and unsupported extension — should be skipped
    await fs.writeFile(path.join(sourceDir, '.hidden.jpg'), 'hidden')
    await fs.writeFile(path.join(sourceDir, 'readme.txt'), 'text file')
  })

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await fs.rm(destDir, { recursive: true, force: true }).catch(() => {})
  })

  it('should transfer files to the correct date-based directory structure', async () => {
    const foundFiles = []
    const progressCalls = []
    const completedFiles = []

    await pipeline(
      new FileFinder(sourceDir, ['jpg', 'cr3', 'mp4'], ({ filePath }) => {
        foundFiles.push(path.basename(filePath))
      }),
      new ExifReader(),
      new FileWriter(destDir, false, {
        onProgress: (data) => progressCalls.push(data),
        onFileComplete: (data) => completedFiles.push(data.filename),
      })
    )

    // Should have found 4 files (not .hidden.jpg, not readme.txt)
    expect(foundFiles.sort()).toEqual([
      'photo1.jpg',
      'photo2.cr3',
      'photo3.jpg',
      'video1.mp4',
    ])

    // Photos should be under photo/2024/2024-06-15/
    const photoDir = path.join(destDir, 'photo', '2024', '2024-06-15')
    const photos = await fs.readdir(photoDir)
    expect(photos.sort()).toEqual(['photo1.jpg', 'photo2.cr3', 'photo3.jpg'])

    // Video should be under video/2024/2024-06-15/
    const videoDir = path.join(destDir, 'video', '2024', '2024-06-15')
    const videos = await fs.readdir(videoDir)
    expect(videos).toEqual(['video1.mp4'])

    // Content should match source
    const content = await fs.readFile(path.join(photoDir, 'photo1.jpg'), 'utf8')
    expect(content).toBe('jpg content 1')

    // Progress and completion callbacks should have fired
    expect(progressCalls.length).toBeGreaterThan(0)
    expect(completedFiles.sort()).toEqual([
      'photo1.jpg',
      'photo2.cr3',
      'photo3.jpg',
      'video1.mp4',
    ])
  })

  it('should skip files that already exist when overwrite is false', async () => {
    // Run the pipeline once
    await pipeline(
      new FileFinder(sourceDir, ['jpg'], () => {}),
      new ExifReader(),
      new FileWriter(destDir, false)
    )

    const photoDir = path.join(destDir, 'photo', '2024', '2024-06-15')
    // Tamper with file content to verify it's not overwritten
    await fs.writeFile(path.join(photoDir, 'photo1.jpg'), 'ORIGINAL')

    // Run again — should skip
    await pipeline(
      new FileFinder(sourceDir, ['jpg'], () => {}),
      new ExifReader(),
      new FileWriter(destDir, false)
    )

    const content = await fs.readFile(path.join(photoDir, 'photo1.jpg'), 'utf8')
    expect(content).toBe('ORIGINAL')
  })

  it('should overwrite files when overwrite is true', async () => {
    // Run once
    await pipeline(
      new FileFinder(sourceDir, ['jpg'], () => {}),
      new ExifReader(),
      new FileWriter(destDir, false)
    )

    const photoDir = path.join(destDir, 'photo', '2024', '2024-06-15')
    await fs.writeFile(path.join(photoDir, 'photo1.jpg'), 'ORIGINAL')

    // Run again with overwrite
    await pipeline(
      new FileFinder(sourceDir, ['jpg'], () => {}),
      new ExifReader(),
      new FileWriter(destDir, true)
    )

    const content = await fs.readFile(path.join(photoDir, 'photo1.jpg'), 'utf8')
    expect(content).toBe('jpg content 1')
  })
})
