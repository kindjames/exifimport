const _ = require('lodash')
const util = require('util')
const moment = require('moment')
const { Transform } = require('stream')
const { ExifTool } = require('exiftool-vendored')

const formatString = 'YYYY:MM:DD HH:mm:ss'

module.exports = class ExifReader extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true })
    this.exiftool = new ExifTool({ taskTimeoutMillis: 30_000 })
  }

  getDate(original) {
    const { CreateDate, DateTimeOriginal } = original
    try {
      const { rawValue, hasZone, zoneName } = DateTimeOriginal || CreateDate
      const date = moment(rawValue, formatString)
      return hasZone ? date.utcOffset(zoneName) : date
    } catch (error) {
      throw util.format(`error: couldn't find date in metadata\n%o`, original)
    }
  }

  async _transform({ filePath, fileSize, fileTimes }, encoding, callback) {
    try {
      const exif = await this.exiftool.read(filePath)
      this.push({
        fileSize,
        filePath,
        fileTimes,
        filename: exif.FileName,
        sourcePath: _.get(exif, 'SourceFile'),
        exif,
        date: this.getDate(exif),
        camera: _.get(exif, 'Model'),
        lens: _.get(exif, 'LensModel'),
      })
      callback()
    } catch (err) {
      callback(err)
    }
  }

  _final(callback) {
    this.exiftool.end()
    callback()
  }
}
