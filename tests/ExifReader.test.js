const ExifReader = require('../src/ExifReader')

// Mock exiftool-vendored
jest.mock('exiftool-vendored', () => ({
  ExifTool: jest.fn().mockImplementation(() => ({
    read: jest.fn(),
    end: jest.fn(),
  })),
}))

describe('ExifReader', () => {
  let reader

  beforeEach(() => {
    reader = new ExifReader()
  })

  afterEach(() => {
    reader.exiftool.end()
    reader.destroy()
  })

  describe('getDate', () => {
    it('should parse DateTimeOriginal with timezone', () => {
      const exif = {
        DateTimeOriginal: {
          rawValue: '2024:01:15 10:30:00',
          hasZone: true,
          zoneName: '+05:00',
        },
      }
      const date = reader.getDate(exif)
      expect(date.format('YYYY-MM-DD')).toBe('2024-01-15')
      expect(date.utcOffset()).toBe(300)
    })

    it('should parse DateTimeOriginal without timezone', () => {
      const exif = {
        DateTimeOriginal: {
          rawValue: '2023:06:20 14:00:00',
          hasZone: false,
        },
      }
      const date = reader.getDate(exif)
      expect(date.format('YYYY-MM-DD')).toBe('2023-06-20')
      expect(date.format('HH:mm:ss')).toBe('14:00:00')
    })

    it('should fall back to CreateDate when DateTimeOriginal is missing', () => {
      const exif = {
        CreateDate: {
          rawValue: '2023:12:25 08:00:00',
          hasZone: false,
        },
      }
      const date = reader.getDate(exif)
      expect(date.format('YYYY-MM-DD')).toBe('2023-12-25')
    })

    it('should throw when no date tags are present', () => {
      expect(() => reader.getDate({})).toThrow(/couldn't find date/)
    })

    it('should throw when date tag has no rawValue', () => {
      const exif = { DateTimeOriginal: { hasZone: false } }
      expect(() => reader.getDate(exif)).toThrow(/couldn't find date/)
    })
  })

  describe('getMediaType (via _transform)', () => {
    it('should classify images as photo', (done) => {
      reader.exiftool.read.mockResolvedValue({
        FileName: 'test.jpg',
        SourceFile: '/src/test.jpg',
        MIMEType: 'image/jpeg',
        Model: 'Canon R5',
        LensModel: 'RF 50mm',
        DateTimeOriginal: { rawValue: '2024:01:01 12:00:00', hasZone: false },
      })

      reader.on('data', (data) => {
        expect(data.mediaType).toBe('photo')
        done()
      })

      reader.write({ filePath: '/src/test.jpg', fileSize: 1000, fileTimes: {} })
    })

    it('should classify videos as video', (done) => {
      reader.exiftool.read.mockResolvedValue({
        FileName: 'clip.mp4',
        SourceFile: '/src/clip.mp4',
        MIMEType: 'video/mp4',
        DateTimeOriginal: { rawValue: '2024:01:01 12:00:00', hasZone: false },
      })

      reader.on('data', (data) => {
        expect(data.mediaType).toBe('video')
        done()
      })

      reader.write({ filePath: '/src/clip.mp4', fileSize: 5000, fileTimes: {} })
    })

    it('should classify unknown MIME types as unknown', (done) => {
      reader.exiftool.read.mockResolvedValue({
        FileName: 'file.xyz',
        SourceFile: '/src/file.xyz',
        MIMEType: 'application/octet-stream',
        DateTimeOriginal: { rawValue: '2024:01:01 12:00:00', hasZone: false },
      })

      reader.on('data', (data) => {
        expect(data.mediaType).toBe('unknown')
        done()
      })

      reader.write({ filePath: '/src/file.xyz', fileSize: 100, fileTimes: {} })
    })
  })

  describe('_transform', () => {
    it('should pass through file metadata with exif data', (done) => {
      const fileTimes = { atime: new Date(), mtime: new Date(), btime: new Date() }
      reader.exiftool.read.mockResolvedValue({
        FileName: 'photo.cr3',
        SourceFile: '/card/photo.cr3',
        MIMEType: 'image/x-canon-cr3',
        Model: 'Canon EOS R5',
        LensModel: 'RF 24-70mm F2.8',
        DateTimeOriginal: { rawValue: '2024:03:10 09:15:30', hasZone: false },
      })

      reader.on('data', (data) => {
        expect(data.filePath).toBe('/card/photo.cr3')
        expect(data.fileSize).toBe(25000000)
        expect(data.fileTimes).toBe(fileTimes)
        expect(data.filename).toBe('photo.cr3')
        expect(data.sourcePath).toBe('/card/photo.cr3')
        expect(data.camera).toBe('Canon EOS R5')
        expect(data.lens).toBe('RF 24-70mm F2.8')
        expect(data.date.format('YYYY-MM-DD')).toBe('2024-03-10')
        done()
      })

      reader.write({ filePath: '/card/photo.cr3', fileSize: 25000000, fileTimes })
    })

    it('should emit error when exiftool.read fails', (done) => {
      reader.exiftool.read.mockRejectedValue(new Error('corrupt file'))

      reader.on('error', (err) => {
        expect(err.message).toBe('corrupt file')
        done()
      })

      reader.write({ filePath: '/bad/file.jpg', fileSize: 100, fileTimes: {} })
    })
  })
})
