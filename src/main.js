const _ = require('lodash')
const { filesize } = require('filesize')
const cliProgress = require('cli-progress')
const { pipeline } = require('stream/promises')
const FileFinder = require('./FileFinder')
const FileWriter = require('./FileWriter')
const ExifReader = require('./ExifReader')

module.exports = async function main({
  source,
  destination,
  overwrite,
  extensions,
}) {
  const total = {
    files: 0,
    data: 0,
  }
  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: true,
      stopOnComplete: true,
      hideCursor: true,
      forceRedraw: true,
    },
    cliProgress.Presets.shades_grey
  )

  const bars = {
    total: multibar.create(
      100,
      0,
      { label: 'overall' },
      {
        format:
          '{label} [{bar}] {percentage}% | ETA: {eta}s | {total} files {data}',
      }
    ),
    written: multibar.create(
      100,
      0,
      { label: 'current' },
      { format: '{label} [{bar}] {percentage}% | ETA: {eta}s | {data}' }
    ),
  }

  function onFileFound({ fileSize }) {
    total.files += 1
    total.data += fileSize
    bars.total.setTotal(total.files)
    bars.total.update({ data: filesize(total.data) })
  }

  function onFileChunkWrite(payload) {
    if (_.isUndefined(payload)) return // complete
    if (_.isError(payload)) throw `fatal: ${payload}`
    const { value, total } = payload
    bars.written.update(value, { ...payload, data: filesize(total) })
    if (value < total) bars.written.setTotal(total)
    else bars.total.increment()
  }

  await pipeline(
    new FileFinder(source, extensions, onFileFound),
    new ExifReader(),
    new FileWriter(destination, overwrite, onFileChunkWrite)
  )
    .catch((err) => console.error('Pipeline failed', err))
    .finally(() => multibar.stop())
}
