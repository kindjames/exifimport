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

  describe('onConflict', () => {
    const expectedPath = path.join(destDir, 'photo', '2024', '2024-03-15', 'photo.jpg')

    async function writeOnce() {
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false)
        writer.write(makeChunk(), null, resolve)
      })
      // Tamper so we can detect overwrites
      await fs.writeFile(expectedPath, 'ORIGINAL')
    }

    it('replace — overwrites this file and calls onConflict with conflict details', async () => {
      await writeOnce()
      const onConflict = jest.fn().mockResolvedValue('replace')
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false, { onConflict })
        writer.write(makeChunk(), null, resolve)
      })
      expect(onConflict).toHaveBeenCalledWith(expect.objectContaining({
        filename: 'photo.jpg',
        destPath: expectedPath,
        fileSize: 20,
        destSize: 8, // 'ORIGINAL' is 8 bytes
        contentDiffers: null,
      }))
      const content = await fs.readFile(expectedPath, 'utf8')
      expect(content).toBe('fake image data here')
    })

    it('auto-skips silently when source and destination are identical', async () => {
      // Write without tampering so source and dest have identical content
      const onConflict = jest.fn()
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false)
        writer.write(makeChunk(), null, resolve)
      })
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false, { onConflict })
        writer.write(makeChunk(), null, resolve)
      })
      expect(onConflict).not.toHaveBeenCalled()
      const content = await fs.readFile(expectedPath, 'utf8')
      expect(content).toBe('fake image data here')
    })

    it('prompts with contentDiffers=true when sizes match but content differs', async () => {
      // Write first, then overwrite dest with same-length but different content
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false)
        writer.write(makeChunk(), null, resolve)
      })
      await fs.writeFile(expectedPath, 'XXXXXXXXXXXXXXXXXXXX') // same length (20 bytes), different content
      const onConflict = jest.fn().mockResolvedValue('skip')
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false, { onConflict })
        writer.write(makeChunk(), null, resolve)
      })
      expect(onConflict).toHaveBeenCalledWith(expect.objectContaining({
        filename: 'photo.jpg',
        contentDiffers: true,
      }))
    })

    it('skip — leaves existing file unchanged', async () => {
      await writeOnce()
      const onConflict = jest.fn().mockResolvedValue('skip')
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false, { onConflict })
        writer.write(makeChunk(), null, resolve)
      })
      const content = await fs.readFile(expectedPath, 'utf8')
      expect(content).toBe('ORIGINAL')
    })

    it('replaceAll — overwrites and skips future onConflict calls', async () => {
      await writeOnce()
      const onConflict = jest.fn().mockResolvedValue('replaceAll')
      const writer = new FileWriter(destDir, false, { onConflict })

      // First conflict — should call onConflict and overwrite
      await new Promise((resolve) => writer.write(makeChunk(), null, resolve))
      expect(onConflict).toHaveBeenCalledTimes(1)

      // Tamper again
      await fs.writeFile(expectedPath, 'ORIGINAL2')

      // Second conflict — should NOT call onConflict (bulk decision already set)
      await new Promise((resolve) => writer.write(makeChunk(), null, resolve))
      expect(onConflict).toHaveBeenCalledTimes(1)
      const content = await fs.readFile(expectedPath, 'utf8')
      expect(content).toBe('fake image data here')
    })

    it('skipAll — skips and stops calling onConflict for subsequent files', async () => {
      await writeOnce()
      const onConflict = jest.fn().mockResolvedValue('skipAll')
      const writer = new FileWriter(destDir, false, { onConflict })

      await new Promise((resolve) => writer.write(makeChunk(), null, resolve))
      expect(onConflict).toHaveBeenCalledTimes(1)

      // Second conflict — should NOT call onConflict
      await new Promise((resolve) => writer.write(makeChunk(), null, resolve))
      expect(onConflict).toHaveBeenCalledTimes(1)
      const content = await fs.readFile(expectedPath, 'utf8')
      expect(content).toBe('ORIGINAL')
    })

    it('calls onSkip with reason "identical" when files are identical', async () => {
      const onSkip = jest.fn()
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false)
        writer.write(makeChunk(), null, resolve)
      })
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false, { onSkip })
        writer.write(makeChunk(), null, resolve)
      })
      expect(onSkip).toHaveBeenCalledWith({ filename: 'photo.jpg', reason: 'identical' })
    })

    it('calls onSkip with reason "conflict" when user skips', async () => {
      await writeOnce()
      const onSkip = jest.fn()
      const onConflict = jest.fn().mockResolvedValue('skip')
      await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false, { onConflict, onSkip })
        writer.write(makeChunk(), null, resolve)
      })
      expect(onSkip).toHaveBeenCalledWith({ filename: 'photo.jpg', reason: 'conflict' })
    })

    it('calls onSkip with reason "conflict" for each file skipped via skipAll', async () => {
      await writeOnce()
      const onSkip = jest.fn()
      const onConflict = jest.fn().mockResolvedValue('skipAll')
      const writer = new FileWriter(destDir, false, { onConflict, onSkip })

      await new Promise((resolve) => writer.write(makeChunk(), null, resolve))
      await fs.writeFile(expectedPath, 'ORIGINAL')
      await new Promise((resolve) => writer.write(makeChunk(), null, resolve))

      expect(onSkip).toHaveBeenCalledTimes(2)
      expect(onSkip).toHaveBeenCalledWith({ filename: 'photo.jpg', reason: 'conflict' })
    })

    it('abort — calls callback with error and stops further writes', async () => {
      await writeOnce()
      const onConflict = jest.fn().mockResolvedValue('abort')
      const err = await new Promise((resolve) => {
        const writer = new FileWriter(destDir, false, { onConflict })
        writer.on('error', resolve)
        writer.write(makeChunk())
      })
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('Aborted by user')
    })
  })
})
