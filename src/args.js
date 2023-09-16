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
        description: '<DESCRIPTION>',
        default: process.cwd(),
        required: true,
      },
      destination: {
        type: 'string',
        alias: ['dest', 'd'],
        description: '<DESCRIPTION>',
        default: config.destination,
        required: true,
      },
      extensions: {
        type: 'array',
        description: '<DESCRIPTION>',
        choices: extensions,
        default: extensions,
        required: true,
      },
    })
    .middleware(async ({ ...argv }) => ({
      // ...(await )
      ...argv,
    })).argv
}
