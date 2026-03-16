const { Transform } = require('stream')
const { ExifTool } = require('exiftool-vendored')
const dayjs = require('dayjs')
const customParseFormat = require('dayjs/plugin/customParseFormat')
const utc = require('dayjs/plugin/utc')

dayjs.extend(customParseFormat)
dayjs.extend(utc)

const formatString = 'YYYY:MM:DD HH:mm:ss'

const getMediaType = ({ MIMEType }) => {
  if (MIMEType?.startsWith('image/')) return 'photo'
  if (MIMEType?.startsWith('video/')) return 'video'
  return 'unknown'
}

module.exports = class ExifReader extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true })
    this.exiftool = new ExifTool({ taskTimeoutMillis: 30_000 })
  }

  getDate(exif) {
    const dateTag = exif.DateTimeOriginal || exif.CreateDate
    if (!dateTag || !dateTag.rawValue) {
      throw new Error(
        `couldn't find date in metadata for ${exif.SourceFile || 'unknown file'}`
      )
    }
    const { rawValue, hasZone, zoneName } = dateTag
    const date = dayjs(rawValue, formatString)
    return hasZone ? date.utcOffset(zoneName) : date
  }

  async _transform({ filePath, fileSize, fileTimes }, encoding, callback) {
    try {
      const exif = await this.exiftool.read(filePath)
      this.push({
        fileSize,
        filePath,
        fileTimes,
        filename: exif.FileName,
        sourcePath: exif.SourceFile,
        exif,
        date: this.getDate(exif),
        mediaType: getMediaType(exif),
        camera: exif.Model,
        lens: exif.LensModel,
      })
      callback()
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)))
    }
  }

  _final(callback) {
    this.exiftool.end()
    callback()
  }
}
