const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const loadUserConfig = require('./loadUserConfig')
const extensions = require('./extensions')

module.exports = async () => {
  const config = await loadUserConfig()
  return yargs(hideBin(process.argv))
    .options({
      source: {
        type: 'string',
        alias: ['src', 's'],
        description: 'Location to search for files',
        default: process.cwd(),
        required: true,
      },
      destination: {
        type: 'string',
        alias: ['dest', 'd'],
        description: 'Where the files will be transferred to',
        default: config.destination,
        required: true,
      },
      extensions: {
        type: 'array',
        description: 'File types to search for and copy',
        choices: extensions,
        default: extensions,
        required: true,
      },
      overwrite: {
        type: 'boolean',
        description: 'Overwrite a file if it already exists',
        default: false,
        required: true,
      },
    }).argv
}
