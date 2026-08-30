import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'


const root = process.cwd()
const generator = join(root, 'scripts/generate-build-metadata.mjs')
const validSha = '0123456789abcdef0123456789abcdef01234567'

function runGenerator(sha: string) {
  const outputDir = mkdtempSync(join(tmpdir(), 'ivy-build-metadata-'))
  const outputPath = join(outputDir, 'build-metadata.json')
  const result = spawnSync(
    process.execPath,
    [generator, '--sha', sha, '--out', outputPath],
    { encoding: 'utf8' },
  )

  return { outputDir, outputPath, result }
}

describe('frontend build commit attestation', () => {
  it('合法的完整 lowercase Git SHA 產生固定且最小的 JSON schema', () => {
    const { outputDir, outputPath, result } = runGenerator(validSha)

    expect(result.status).toBe(0)
    expect(readFileSync(outputPath, 'utf8')).toBe(`{"commitSha":"${validSha}"}\n`)
    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual({ commitSha: validSha })
    expect(readdirSync(outputDir)).toEqual(['build-metadata.json'])
  })

  it.each([
    ['', '空值'],
    ['0123456789abcdef', '短 SHA'],
    ['0123456789ABCDEF0123456789ABCDEF01234567', '大寫 SHA'],
    [`${validSha}?url=https://example.invalid&token=sentinel`, '夾帶額外內容'],
  ])('拒絕%s（%s）且不產生 metadata', (sha) => {
    const { outputDir, result } = runGenerator(sha)

    expect(result.status).not.toBe(0)
    expect(readdirSync(outputDir)).toEqual([])
  })

  it('Docker build 只接受 Zeabur Git commit SHA，並在 Vite build 後寫入 dist', () => {
    const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
    const buildIndex = dockerfile.indexOf('RUN npm run build')
    const attestationIndex = dockerfile.indexOf('RUN node scripts/generate-build-metadata.mjs')

    expect(dockerfile).toMatch(/^ARG ZEABUR_GIT_COMMIT_SHA\s*$/m)
    expect(dockerfile).not.toMatch(/^ARG ZEABUR_GIT_COMMIT_SHA=/m)
    expect(attestationIndex).toBeGreaterThan(buildIndex)
    expect(dockerfile.slice(attestationIndex, attestationIndex + 220))
      .toContain('--sha "$ZEABUR_GIT_COMMIT_SHA" --out dist/build-metadata.json')
    expect(dockerfile.slice(attestationIndex, attestationIndex + 220))
      .not.toContain('VITE_SENTRY_RELEASE')
  })

  it('nginx 對 metadata 使用 exact location 與 no-store', () => {
    const nginx = readFileSync(join(root, 'nginx.conf.template'), 'utf8')
    const location = nginx.match(/location = \/build-metadata\.json \{([\s\S]*?)\n    \}/)?.[1]

    expect(location).toBeDefined()
    expect(location).toContain('add_header Cache-Control "no-store" always;')
    expect(location).toContain('types { } default_type application/json;')
  })

  it('Workbox 不會把 deployment metadata 收進 precache', () => {
    const vite = readFileSync(join(root, 'vite.config.js'), 'utf8')
    const workboxStart = vite.indexOf('workbox: {')
    const runtimeCachingStart = vite.indexOf('runtimeCaching:', workboxStart)
    const precacheConfig = vite.slice(workboxStart, runtimeCachingStart)

    expect(workboxStart).toBeGreaterThan(-1)
    expect(runtimeCachingStart).toBeGreaterThan(workboxStart)
    expect(precacheConfig).not.toContain('build-metadata.json')
    expect(precacheConfig).not.toMatch(/["'`]\*\*\/\*["'`]/)
  })
})
