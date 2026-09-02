/**
 * TodayView 原始碼守衛（2026-09-02）。
 *
 * 兩張 sticky 橫幅與 bento 四格已退場，待辦改由 HomeTodoList 單一承載、
 * 娃娃車改由 HomeBusRow 承載。渲染測試只能證明「這次沒渲染」，擋不住
 * 日後有人把元件 import 回首頁製造第二份待辦清單，故加原始碼層級守衛。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(__dirname, '../TodayView.vue'),
  'utf-8',
)

describe('TodayView 原始碼守衛', () => {
  it('不得 import 已退場的兩張橫幅', () => {
    expect(source).not.toContain('PendingSignBanner')
    expect(source).not.toContain('PendingSurveyBanner')
  })

  it('不得直接使用 StatTile（bento 已退場，娃娃車格在 HomeBusRow 內）', () => {
    expect(source).not.toContain('StatTile')
  })

  it('不得殘留 bento 容器樣式或 class', () => {
    expect(source).not.toContain('today-bento')
  })

  it('必須掛載待辦清單與娃娃車列', () => {
    expect(source).toContain('HomeTodoList')
    expect(source).toContain('HomeBusRow')
  })
})
