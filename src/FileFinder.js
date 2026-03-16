const fs = require('fs/promises')
const { extname, basename, join } = require('path')
const { Readable } = require('stream')

module.exports = class FileFinder extends Readable {
  constructor(startPath, extensions = [], onFileFound, options = {}) {
    super({ ...options, objectMode: true })
    this.directories = [startPath]
    this.extensions = new Set(extensions.map((ext) => `.${ext.toLowerCase()}`))
    this._onFileFoundCallback = typeof onFileFound === 'function' ? onFileFound : null
    this._reading = false
  }

  hasMatchingExtension(filePath) {
    const ext = extname(filePath).toLowerCase()
    return this.extensions.size === 0 || this.extensions.has(ext)
  }

  filenameDoesNotBeginWithDot(filePath) {
    return basename(filePath)[0] !== '.'
  }

  isRelevantFile(path) {
    return (
      this.filenameDoesNotBeginWithDot(path) && this.hasMatchingExtension(path)
    )
  }

  async _read() {
    if (this._reading) return
    this._reading = true
    try {
      while (this.directories.length > 0) {
        const currentPath = this.directories.pop()
        try {
          for await (const entry of await fs.opendir(currentPath)) {
            const path = join(currentPath, entry.name)
            if (entry.isDirectory()) this.directories.push(path)
            else if (this.isRelevantFile(path)) {
              const { size, atime, birthtime: btime, mtime } = await fs.stat(path)
              const fileTimes = { atime, mtime, btime }
              const payload = { filePath: path, fileSize: size, fileTimes }
              this.push(payload)
              if (this._onFileFoundCallback) await this._onFileFoundCallback(payload)
            }
          }
        } catch (err) {
          if (err.code === 'EPERM') console.debug(`Skipping: ${err.path}`)
          else console.error(err)
        }
      }
      this.push(null)
    } catch (err) {
      this.destroy(err)
    }
  }
}
