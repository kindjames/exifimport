const _ = require('lodash')
const fs = require('fs').promises
const path = require('path')
const toml = require('toml')

const filename = '.exifimport.toml'

module.exports = async function config() {
  let fileContents
  try {
    const filePath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      filename
    )
    fileContents = await fs.readFile(filePath, 'utf8')
  } catch (error) {}
  if (fileContents) {
    try {
      return _.pick(toml.parse(fileContents), ['destination'])
    } catch (error) {
      throw `fatal: could not read ${filename} ${error}`
    }
  }
}
