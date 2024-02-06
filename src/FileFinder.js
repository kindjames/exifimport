const _ = require('lodash')
const fs = require('fs/promises')
const { extname, basename, join } = require('path')
const { Readable } = require('stream')

module.exports = class FileFinder extends Readable {
  constructor(startPath, extensions = [], onFileFound, options = {}) {
    super({ ...options, objectMode: true })
    this.directories = [startPath]
    this.extensions = new Set(extensions.map((ext) => `.${ext.toLowerCase()}`))
    this.onFileFound = async (filePath) => {
      const { size, atime, birthtime: btime, mtime } = await fs.stat(filePath)
      const fileTimes = { atime, mtime, btime }
      const payload = { filePath, fileSize: size, fileTimes }
      this.push(payload)
      if (_.isFunction(onFileFound)) await onFileFound(payload)
    }
  }

  hasMatchingExtension(filePath) {
    const ext = extname(filePath).toLowerCase()
    return this.extensions.size === 0 || this.extensions.has(ext)
  }

  filenameDoesNotBeginWithDot(filePath) {
    const filename = basename(filePath)
    return _.first(filename) !== '.'
  }

  isRelevantFile(path) {
    return (
      this.filenameDoesNotBeginWithDot(path) && this.hasMatchingExtension(path)
    )
  }

  async _read() {
    while (this.directories.length > 0) {
      const currentPath = this.directories.pop()
      try {
        for await (const entry of await fs.opendir(currentPath)) {
          const path = join(currentPath, entry.name)
          if (entry.isDirectory()) this.directories.push(path)
          else if (this.isRelevantFile(path)) await this.onFileFound(path)
        }
      } catch (err) {
        if (err.code === 'EPERM') console.debug(`Skipping: ${err.path}`)
        else console.error(err)
      }
    }
  }
}
