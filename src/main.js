const readline = require('readline')
const path = require('path')
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
  const completed = {
    files: 0,
    data: 0,
  }
  const skipped = {
    identical: [],
    conflict: [],
  }
  const startTime = Date.now()
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

  function onFileComplete({ fileSize }) {
    completed.files += 1
    completed.data += fileSize
    bars.file.stop()
    bars.total.increment()
  }

  function onSkip({ filename, reason }) {
    skipped[reason].push(filename)
  }

  function onConflict({ filename, sourcePath, fileSize, date, camera, lens, destPath, destSize, destModified, contentDiffers }) {
    const homeDir = process.env.HOME || ''
    const shorten = (p) => homeDir && p.startsWith(homeDir) ? '~' + p.slice(homeDir.length) : p
    const srcDir = shorten(path.dirname(sourcePath)) + '/'
    const dstDir = shorten(path.dirname(destPath)) + '/'

    const rows = [
      ['path',     srcDir,                                  dstDir],
      ['size',     filesize(fileSize),                      filesize(destSize)],
      ['taken',    date ? date.format('YYYY-MM-DD') : '—',  '—'],
      ['modified', '—',                                     destModified.toISOString().slice(0, 10)],
      ['camera',   camera || '—',                           '—'],
      ['lens',     lens || '—',                             '—'],
    ]
    if (contentDiffers) rows.push(['match', '⚠ no (may be corrupted)', ''])

    const labelW = Math.max(...rows.map(([l]) => l.length)) + 2
    const col1W  = Math.max('incoming'.length, ...rows.map(([, c]) => c.length)) + 4
    const header = ' '.repeat(labelW + 2) + 'incoming'.padEnd(col1W) + 'existing'
    const lines  = rows.map(([label, c1, c2]) => `  ${label.padEnd(labelW)} ${c1.padEnd(col1W)}${c2}`)

    multibar.stop()
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => {
      rl.question(
        `\nConflict: ${filename}\n\n${header}\n${lines.join('\n')}\n\n[r]eplace, [R]eplace all, [s]kip, [S]kip all, [a]bort: `,
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
    new FileWriter(destination, overwrite, { onProgress, onFileComplete, onSkip, onConflict: overwrite ? undefined : onConflict })
  )
    .catch((err) => console.error('Pipeline failed', err))
    .finally(() => {
      multibar.stop()
      const elapsedSec = (Date.now() - startTime) / 1000
      const speed = elapsedSec > 0 ? filesize(completed.data / elapsedSec) + '/s' : '—'
      const mins = Math.floor(elapsedSec / 60)
      const secs = Math.round(elapsedSec % 60)
      const elapsed = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

      const formatList = (files) => {
        const shown = files.slice(0, 5)
        const extra = files.length - shown.length
        return shown.join(', ') + (extra > 0 ? ` (+${extra} more)` : '')
      }

      const lines = []
      if (completed.files > 0) {
        lines.push(`Finished copying ${completed.files} files in ${elapsed} (~ ${speed})`)
      } else {
        lines.push(`Finished in ${elapsed} — no files copied`)
      }
      if (skipped.identical.length > 0)
        lines.push(`Skipped ${skipped.identical.length} identical files: ${formatList(skipped.identical)}`)
      if (skipped.conflict.length > 0)
        lines.push(`Skipped ${skipped.conflict.length} files (already exist): ${formatList(skipped.conflict)}`)

      console.log('\n' + lines.join('\n'))
    })
}
