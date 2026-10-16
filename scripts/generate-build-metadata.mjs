import { randomUUID } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'


const FULL_LOWERCASE_GIT_SHA = /^[0-9a-f]{40}$/

function parseArgs(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== '--sha' ||
    argv[2] !== '--out' ||
    !argv[3]
  ) {
    throw new Error('參數格式錯誤')
  }

  return { sha: argv[1], outputPath: resolve(argv[3]) }
}

async function writeBuildMetadata(sha, outputPath) {
  if (!FULL_LOWERCASE_GIT_SHA.test(sha)) {
    throw new Error('Git commit SHA 格式錯誤')
  }

  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  )

  try {
    const content = `${JSON.stringify({ commitSha: sha })}\n`
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
    await rename(temporaryPath, outputPath)
  } catch {
    await unlink(temporaryPath).catch(() => undefined)
    throw new Error('建置版本證據寫入失敗')
  }
}

async function main() {
  const { sha, outputPath } = parseArgs(process.argv.slice(2))
  await writeBuildMetadata(sha, outputPath)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : '未知錯誤'
    console.error(`[build-metadata] ${message}`)
    process.exitCode = 1
  })
}
