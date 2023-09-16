const { Writable } = require('stream')
const { createReadStream, createWriteStream } = require('fs')
const path = require('path')
const fs = require('fs/promises')
const { utimes } = require('utimes')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = class FileWriter extends Writable {
  constructor(destination, overwrite, onFileChunkWrite, options = {}) {
    super({ ...options, objectMode: true })
    this.destination = destination
    this.overwrite = overwrite
    this.onFileChunkWrite = onFileChunkWrite
  }

  ensureDirectoryExists = (path) =>
    fs.access(path).catch(() => fs.mkdir(path, { recursive: true }))

  checkCanWriteFile = async (path) =>
    this.overwrite ||
    !(await fs.access(path, fs.constants.W_OK).catch(() => false))

  async _write(
    { fileSize, fileTimes, filename, sourcePath, date, camera, lens },
    encoding,
    callback
  ) {
    const determinedDestinationDir = path.join(
      this.destination,
      date.format('YYYY'),
      date.format('YYYY-MM-DD')
    )
    const destinationPath = path.join(determinedDestinationDir, filename)
    await this.ensureDirectoryExists(determinedDestinationDir)
    if (await this.checkCanWriteFile(destinationPath)) {
      const readStream = createReadStream(sourcePath)
      const writeStream = createWriteStream(destinationPath)
      let current = 0
      readStream.on('data', async (chunk) => {
        current += chunk.length
        this.onFileChunkWrite({
          value: current,
          total: fileSize,
          filename,
          camera,
          lens,
          date,
        })
      })
      readStream.pipe(writeStream)
      readStream.on('end', async () => {
        await utimes(destinationPath, fileTimes)
        this.onFileChunkWrite()
        callback()
      })
      readStream.on('error', (error) => {
        writeStream.destroy()
        this.onFileChunkWrite(error)
        callback(error)
      })
      writeStream.on('error', (error) => {
        readStream.destroy()
        this.onFileChunkWrite(error)
        callback(error)
      })
    } else throw `cannot write file`
  }
}
