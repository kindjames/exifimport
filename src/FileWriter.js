const { Writable } = require('stream')
const { createReadStream, createWriteStream } = require('fs')
const path = require('path')
const fs = require('fs/promises')
const { utimes } = require('utimes')

module.exports = class FileWriter extends Writable {
  constructor(destination, overwrite, { onProgress, onFileComplete } = {}, options = {}) {
    super({ ...options, objectMode: true })
    this.destination = destination
    this.overwrite = overwrite
    this.onProgress = onProgress
    this.onFileComplete = onFileComplete
    this._activeStreams = null
  }

  ensureDirectoryExists = (dirPath) =>
    fs.access(dirPath).catch(() => fs.mkdir(dirPath, { recursive: true }))

  checkCanWriteFile = async (filePath) => {
    if (this.overwrite) return true
    try {
      await fs.access(filePath)
      return false // file exists, don't overwrite
    } catch {
      return true // file doesn't exist, safe to write
    }
  }

  async _write(
    {
      fileSize,
      fileTimes,
      mediaType,
      filename,
      sourcePath,
      date,
      camera,
      lens,
    },
    encoding,
    callback
  ) {
    const determinedDestinationDir = path.join(
      this.destination,
      mediaType,
      date.format('YYYY'),
      date.format('YYYY-MM-DD')
    )
    const destinationPath = path.join(determinedDestinationDir, filename)
    await this.ensureDirectoryExists(determinedDestinationDir)
    if (!(await this.checkCanWriteFile(destinationPath))) {
      callback()
      return
    }

    let callbackCalled = false
    const done = (err) => {
      if (callbackCalled) return
      callbackCalled = true
      this._activeStreams = null
      callback(err)
    }

    const readStream = createReadStream(sourcePath)
    const writeStream = createWriteStream(destinationPath)
    this._activeStreams = { readStream, writeStream }

    let current = 0
    readStream.on('data', (chunk) => {
      current += chunk.length
      if (this.onProgress) {
        this.onProgress({ current, fileSize, filename, camera, lens, date })
      }
    })
    readStream.pipe(writeStream)
    writeStream.on('finish', async () => {
      try {
        await utimes(destinationPath, fileTimes)
        if (this.onFileComplete) this.onFileComplete({ filename, fileSize })
        done()
      } catch (err) {
        done(err)
      }
    })
    readStream.on('error', (error) => {
      writeStream.destroy()
      done(error)
    })
    writeStream.on('error', (error) => {
      readStream.destroy()
      done(error)
    })
  }

  _destroy(err, callback) {
    if (this._activeStreams) {
      this._activeStreams.readStream.destroy()
      this._activeStreams.writeStream.destroy()
      this._activeStreams = null
    }
    callback(err)
  }
}
