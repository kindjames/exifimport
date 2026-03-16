const fs = require('fs/promises')
const path = require('path')
const dayjs = require('dayjs')
const customParseFormat = require('dayjs/plugin/customParseFormat')
const FileWriter = require('../src/FileWriter')

dayjs.extend(customParseFormat)

// Mock utimes since it's a native module
jest.mock('utimes', () => ({
  utimes: jest.fn().mockResolvedValue(undefined),
}))

const { utimes } = require('utimes')

describe('FileWriter', () => {
  const testDir = path.join(__dirname, 'writerTestDir')
  const sourceDir = path.join(testDir, 'source')
  const destDir = path.join(testDir, 'dest')

  beforeAll(async () => {
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.writeFile(path.join(sourceDir, 'photo.jpg'), 'fake image data here')
    await fs.writeFile(path.join(sourceDir, 'video.mp4'), 'fake video data')
  })

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await fs.rm(destDir, { recursive: true, force: true }).catch(() => {})
    utimes.mockClear()
  })

  function makeChunk(overrides = {}) {
    return {
      fileSize: 20,
      fileTimes: { atime: new Date(), mtime: new Date(), btime: new Date() },
      mediaType: 'photo',
      filename: 'photo.jpg',
      sourcePath: path.join(sourceDir, 'photo.jpg'),
      date: dayjs('2024:03:15 10:00:00', 'YYYY:MM:DD HH:mm:ss'),
      camera: 'Canon R5',
      lens: 'RF 50mm',
      ...overrides,
    }
  }

  it('should write a file to the correct directory structure', (done) => {
    const writer = new FileWriter(destDir, false)

    writer.write(makeChunk(), null, async () => {
      const expectedPath = path.join(destDir, 'photo', '2024', '2024-03-15', 'photo.jpg')
      const exists = await fs.access(expectedPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)

      const content = await fs.readFile(expectedPath, 'utf8')
      expect(content).toBe('fake image data here')
      done()
    })
  })

  it('should preserve file timestamps via utimes', (done) => {
    const fileTimes = { atime: new Date(), mtime: new Date(), btime: new Date() }
    const writer = new FileWriter(destDir, false)

    writer.write(makeChunk({ fileTimes }), null, () => {
      const expectedPath = path.join(destDir, 'photo', '2024', '2024-03-15', 'photo.jpg')
      expect(utimes).toHaveBeenCalledWith(expectedPath, fileTimes)
      done()
    })
  })

  it('should skip existing files when overwrite is false', (done) => {
    const writer = new FileWriter(destDir, false)
    const chunk = makeChunk()

    // Write the file first
    writer.write(chunk, null, () => {
      // Write again — should skip (callback called without error)
      writer.write(chunk, null, async () => {
        // File should still have original content
        const expectedPath = path.join(destDir, 'photo', '2024', '2024-03-15', 'photo.jpg')
        const content = await fs.readFile(expectedPath, 'utf8')
        expect(content).toBe('fake image data here')
        done()
      })
    })
  })

  it('should overwrite existing files when overwrite is true', (done) => {
    const writer = new FileWriter(destDir, true)

    // Write photo.jpg first
    writer.write(makeChunk(), null, () => {
      // Now overwrite with video.mp4 content but same filename
      writer.write(
        makeChunk({ sourcePath: path.join(sourceDir, 'video.mp4') }),
        null,
        async () => {
          const expectedPath = path.join(destDir, 'photo', '2024', '2024-03-15', 'photo.jpg')
          const content = await fs.readFile(expectedPath, 'utf8')
          expect(content).toBe('fake video data')
          done()
        }
      )
    })
  })

  it('should call onProgress during transfer', (done) => {
    const progressCalls = []
    const onProgress = (data) => progressCalls.push(data)
    const writer = new FileWriter(destDir, false, { onProgress })

    writer.write(makeChunk(), null, () => {
      expect(progressCalls.length).toBeGreaterThan(0)
      expect(progressCalls[0]).toHaveProperty('current')
      expect(progressCalls[0]).toHaveProperty('fileSize')
      expect(progressCalls[0]).toHaveProperty('filename', 'photo.jpg')
      done()
    })
  })

  it('should call onFileComplete when transfer finishes', (done) => {
    const onFileComplete = jest.fn()
    const writer = new FileWriter(destDir, false, { onFileComplete })

    writer.write(makeChunk(), null, () => {
      expect(onFileComplete).toHaveBeenCalledTimes(1)
      expect(onFileComplete).toHaveBeenCalledWith({
        filename: 'photo.jpg',
        fileSize: 20,
      })
      done()
    })
  })

  it('should handle missing source file gracefully', (done) => {
    const writer = new FileWriter(destDir, false)

    writer.on('error', (err) => {
      expect(err).toBeTruthy()
      expect(err.code).toBe('ENOENT')
      done()
    })

    writer.write(
      makeChunk({ sourcePath: path.join(sourceDir, 'nonexistent.jpg') })
    )
  })
})
