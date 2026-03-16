const readline = require('readline')
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

  let fileTransferStart = null
  let lastFilename = null

  function onProgress({ current, fileSize, filename, date }) {
    const now = Date.now()
    if (filename !== lastFilename) {
      fileTransferStart = now
      lastFilename = filename
    }
    const elapsed = (now - fileTransferStart) / 1000
    const speed = elapsed > 0.05 ? filesize(current / elapsed) + '/s' : ''

    bars.total.update({ label: date.format('YYYY-MM-DD'), speed })
    bars.file.update(current, { label: filename, fileSizeReadable: filesize(fileSize), speed })
    if (current < fileSize) bars.file.setTotal(fileSize)
  }

  function onFileComplete() {
    bars.file.stop()
    bars.total.increment()
  }

  function onConflict(filename) {
    multibar.stop()
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => {
      rl.question(
        `\nFile already exists: ${filename}\n[r]eplace, [R]eplace all, [s]kip, [S]kip all, [a]bort: `,
        (answer) => {
          rl.close()
          const choices = { r: 'replace', R: 'replaceAll', s: 'skip', S: 'skipAll', a: 'abort' }
          resolve(choices[answer] ?? 'skip')
        }
      )
    })
  }

  await pipeline(
    new FileFinder(source, extensions, onFileFound),
    new ExifReader(),
    new FileWriter(destination, overwrite, { onProgress, onFileComplete, onConflict: overwrite ? undefined : onConflict })
  )
    .catch((err) => console.error('Pipeline failed', err))
    .finally(() => multibar.stop())
}
