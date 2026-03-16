const { Writable } = require('stream')
const { createReadStream, createWriteStream } = require('fs')
const path = require('path')
const fs = require('fs/promises')
const { utimes } = require('utimes')

module.exports = class FileWriter extends Writable {
  constructor(destination, overwrite, { onProgress, onFileComplete, onConflict } = {}, options = {}) {
    super({ ...options, objectMode: true })
    this.destination = destination
    this.overwrite = overwrite
    this.onProgress = onProgress
    this.onFileComplete = onFileComplete
    this.onConflict = onConflict
    this._activeStreams = null
    this._conflictDecision = null // 'replaceAll' | 'skipAll' | 'abort'
  }

  ensureDirectoryExists = (dirPath) =>
    fs.access(dirPath).catch(() => fs.mkdir(dirPath, { recursive: true }))

  checkCanWriteFile = async (filePath, filename) => {
    if (this.overwrite) return true
    try {
      await fs.access(filePath)
    } catch {
      return true // file doesn't exist, safe to write
    }

    // File exists — check for a prior bulk decision
    if (this._conflictDecision === 'replaceAll') return true
    if (this._conflictDecision === 'skipAll') return false
    if (this._conflictDecision === 'abort') throw new Error('Aborted by user')

    // No bulk decision — ask the caller
    if (!this.onConflict) return false // default: skip

    const decision = await this.onConflict(filename, filePath)
    if (decision === 'replaceAll') { this._conflictDecision = 'replaceAll'; return true }
    if (decision === 'skipAll') { this._conflictDecision = 'skipAll'; return false }
    if (decision === 'abort') { this._conflictDecision = 'abort'; throw new Error('Aborted by user') }
    if (decision === 'replace') return true
    return false // 'skip'
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

    let canWrite
    try {
      canWrite = await this.checkCanWriteFile(destinationPath, filename)
    } catch (err) {
      callback(err)
      return
    }
    if (!canWrite) {
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
