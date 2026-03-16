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
          '{label} [{bar}] {percentage}% | eta {eta}s | {total} files {totalSizeReadable} {speed}',
      }
    ),
    file: multibar.create(
      100,
      0,
      { label: 'current' },
      {
        format:
          '{label} [{bar}] {percentage}% | eta {eta}s | {fileSizeReadable} {speed}',
      }
    ),
  }

  function onFileFound({ fileSize }) {
    total.files += 1
    total.data += fileSize
    bars.total.setTotal(total.files)
    bars.total.update({ totalSizeReadable: filesize(total.data) })
  }

  function onProgress({ current, fileSize, filename, date }) {
    bars.total.update({
      label: date.format('YYYY-MM-DD'),
      speed: '',
    })
    bars.file.update(current, {
      label: filename,
      fileSizeReadable: filesize(fileSize),
    })
    if (current < fileSize) bars.file.setTotal(fileSize)
  }

  function onFileComplete() {
    bars.file.stop()
    bars.total.increment()
  }

  await pipeline(
    new FileFinder(source, extensions, onFileFound),
    new ExifReader(),
    new FileWriter(destination, overwrite, { onProgress, onFileComplete })
  )
    .catch((err) => console.error('Pipeline failed', err))
    .finally(() => multibar.stop())
}
