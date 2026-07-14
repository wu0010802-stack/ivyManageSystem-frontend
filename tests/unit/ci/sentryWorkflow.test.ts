import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

describe('Sentry source map CI secret isolation', () => {
  it('PR build 完全不引用 Sentry secrets，只有 trusted main/release build 可注入', () => {
    const workflow = read('.github/workflows/ci.yml')
    const prStart = workflow.indexOf('- name: Build check (PR, no Sentry secrets)')
    const trustedStart = workflow.indexOf('- name: Build check (trusted main/release)')
    expect(prStart).toBeGreaterThan(-1)
    expect(trustedStart).toBeGreaterThan(prStart)

    const prBlock = workflow.slice(prStart, trustedStart)
    const trustedBlock = workflow.slice(trustedStart, workflow.indexOf('\n  openapi-drift:', trustedStart))
    expect(prBlock).toContain("if: github.event_name == 'pull_request'")
    expect(prBlock).not.toContain('SENTRY_AUTH_TOKEN')
    expect(trustedBlock).toContain("if: github.event_name != 'pull_request'")
    expect(trustedBlock).toContain('SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}')
    expect(trustedBlock).toContain("SENTRY_UPLOAD_TRUSTED: 'true'")
  })

  it('vite config 需同時有 trusted gate 與三個 Sentry secret 才啟用上傳', () => {
    const config = read('vite.config.js')
    expect(config).toContain("process.env.SENTRY_UPLOAD_TRUSTED === 'true'")
    expect(config).toContain('process.env.SENTRY_AUTH_TOKEN')
    expect(config).toContain('process.env.SENTRY_ORG')
    expect(config).toContain('process.env.SENTRY_PROJECT')
  })
})

describe('CI dependency audit coverage', () => {
  it('同時掃描 production 與 build/CI devDependencies', () => {
    const workflow = read('.github/workflows/ci.yml')
    const auditStart = workflow.indexOf('- name: Run npm audit')
    const nextJob = workflow.indexOf('\n  test:', auditStart)
    expect(auditStart).toBeGreaterThan(-1)
    expect(nextJob).toBeGreaterThan(auditStart)

    const auditBlock = workflow.slice(auditStart, nextJob)
    expect(auditBlock).toContain('npm audit --audit-level=moderate')
    expect(auditBlock).not.toContain('--omit=dev')
    expect(auditBlock).not.toContain('--production')
  })
})
