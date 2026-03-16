const { Writable } = require('stream')
const { createReadStream, createWriteStream } = require('fs')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs/promises')
const { utimes } = require('utimes')

module.exports = class FileWriter extends Writable {
  constructor(destination, overwrite, { onProgress, onFileComplete, onConflict, onSkip } = {}, options = {}) {
    super({ ...options, objectMode: true })
    this.destination = destination
    this.overwrite = overwrite
    this.onProgress = onProgress
    this.onFileComplete = onFileComplete
    this.onConflict = onConflict
    this.onSkip = onSkip
    this._activeStreams = null
    this._conflictDecision = null // 'replaceAll' | 'skipAll' | 'abort'
  }

  ensureDirectoryExists = (dirPath) =>
    fs.access(dirPath).catch(() => fs.mkdir(dirPath, { recursive: true }))

  computeChecksum = (filePath) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })

  checkCanWriteFile = async (filePath, { filename, sourcePath, fileSize, date, camera, lens }) => {
    if (this.overwrite) return true

    let existingStat
    try {
      existingStat = await fs.stat(filePath)
    } catch {
      return true // file doesn't exist, safe to write
    }

    // File exists — check for a prior bulk decision
    if (this._conflictDecision === 'replaceAll') return true
    if (this._conflictDecision === 'skipAll') { this.onSkip?.({ filename, reason: 'conflict' }); return false }
    if (this._conflictDecision === 'abort') throw new Error('Aborted by user')

    // Same size — compare checksums to detect identical or corrupted files
    let contentDiffers = null
    if (existingStat.size === fileSize) {
      const [srcHash, dstHash] = await Promise.all([
        this.computeChecksum(sourcePath),
        this.computeChecksum(filePath),
      ])
      if (srcHash === dstHash) { this.onSkip?.({ filename, reason: 'identical' }); return false }
      contentDiffers = true // same size, different content — may be corrupted
    }

    // No bulk decision — ask the caller
    if (!this.onConflict) { this.onSkip?.({ filename, reason: 'conflict' }); return false }

    const decision = await this.onConflict({
      filename, sourcePath, fileSize, date, camera, lens,
      destPath: filePath,
      destSize: existingStat.size,
      destModified: existingStat.mtime,
      contentDiffers,
    })
    if (decision === 'replaceAll') { this._conflictDecision = 'replaceAll'; return true }
    if (decision === 'skipAll') { this._conflictDecision = 'skipAll'; this.onSkip?.({ filename, reason: 'conflict' }); return false }
    if (decision === 'abort') { this._conflictDecision = 'abort'; throw new Error('Aborted by user') }
    if (decision === 'replace') return true
    this.onSkip?.({ filename, reason: 'conflict' }); return false // 'skip'
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
      canWrite = await this.checkCanWriteFile(destinationPath, { filename, sourcePath, fileSize, date, camera, lens })
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
