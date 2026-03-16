const fs = require('fs').promises
const path = require('path')
const toml = require('toml')

const filename = '.exifimport.toml'

module.exports = async function config() {
  const homeDir = process.env.HOME || process.env.USERPROFILE
  if (!homeDir) return undefined

  let fileContents
  try {
    const filePath = path.join(homeDir, filename)
    fileContents = await fs.readFile(filePath, 'utf8')
  } catch {
    return undefined
  }

  try {
    const { destination } = toml.parse(fileContents)
    return { destination }
  } catch (error) {
    throw new Error(`could not read ${filename}: ${error.message}`)
  }
}
