import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
    expect(statSync(outputPath).mode & 0o777).toBe(0o644)
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

  it('Docker build 以平台中立變數取 SHA，缺值時跳過而非讓 build 失敗，且寫在 Vite build 之後', () => {
    const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
    const buildIndex = dockerfile.indexOf('RUN npm run build')
    const attestationIndex = dockerfile.indexOf('node scripts/generate-build-metadata.mjs')

    // 平台中立：GIT_COMMIT_SHA 為主，ZEABUR_* 僅為相容。
    // 綁死 PaaS 專屬名稱曾讓 Railway 部署 FAILED at BUILD_IMAGE（2026-09-01）。
    expect(dockerfile).toMatch(/^ARG GIT_COMMIT_SHA\s*$/m)
    expect(dockerfile).not.toMatch(/^ARG GIT_COMMIT_SHA=/m)
    expect(dockerfile).toMatch(/^ARG ZEABUR_GIT_COMMIT_SHA\s*$/m)
    expect(dockerfile).not.toMatch(/^ARG ZEABUR_GIT_COMMIT_SHA=/m)

    // 順序不變式：必須在 Vite/Workbox build 之後，否則會被收進 PWA precache。
    expect(attestationIndex).toBeGreaterThan(buildIndex)

    const attestation = dockerfile.slice(attestationIndex - 400, attestationIndex + 260)
    // 缺值＝跳過（e2e 無法 attest 是安全降級），有值才產生。
    expect(attestation).toContain('${GIT_COMMIT_SHA:-${ZEABUR_GIT_COMMIT_SHA:-}}')
    expect(attestation).toContain('--out dist/build-metadata.json')
    expect(attestation).not.toContain('VITE_SENTRY_RELEASE')
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
