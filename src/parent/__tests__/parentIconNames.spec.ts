import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-expect-error TODO(ts-strict): scripts/ 下的 .mjs 無型別宣告，此為建置工具共用模組
import { extractIconNames } from '../../../scripts/lib/parent-icon-names.mjs'

/**
 * 子集字型抽取器的盲區回歸（2026-09-02）。
 *
 * iconMapping.ts 的 ICON_MAP 值行長這樣：`trophy: 'emoji_events',`——整行沒有
 * "icon" 字樣，舊規則 5（只掃含 icon 字樣的行）看不到，`emoji_events` 因此不在
 * 子集內；ChildProfileView 的「成長里程碑」標題圖示在 prod 直接 render 成被裁切
 * 的英文。守衛測試用同一支抽取器，盲區同步，所以也擋不住。
 */
const created: string[] = []

function makeRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivy-icon-names-'))
  created.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return root
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('parent-icon-names 抽取器', () => {
  it('iconMapping.ts 的對照值行（不含 icon 字樣）也會被收進候選', () => {
    const root = makeRepo({
      'src/parent/utils/iconMapping.ts':
        "const ICON_MAP = {\n  trophy: 'emoji_events',\n  ruler: 'straighten',\n}\n",
    })
    const names = extractIconNames(root)
    expect(names).toContain('emoji_events')
    expect(names).toContain('straighten')
  })

  it('一般檔案裡不含 icon 字樣的字串字面值仍不會被誤收', () => {
    const root = makeRepo({
      'src/parent/views/Foo.vue':
        "<script setup lang=\"ts\">\nconst tone = 'success'\nconst x = { trophy: 'emoji_events' }\n</script>\n",
    })
    const names = extractIconNames(root)
    expect(names).not.toContain('success')
    expect(names).not.toContain('emoji_events')
  })

  // 2026-09-26：ContactBookDayCard 的 MOOD_STAT_ICON 值行（`happy: 'sentiment_very_satisfied',`）
  // 不含 icon 字樣、檔名也不含 icon，心情統計格在 prod render 成亂碼。
  // 宣告名含 icon 的多行物件字面值，整個區塊的值都要收。
  it('宣告名含 icon 的多行物件字面值，區塊內每行的值都會被收進候選', () => {
    const root = makeRepo({
      'src/parent/components/Foo.vue':
        "<script setup lang=\"ts\">\n"
        + "const MOOD_STAT_ICON: Record<string, string> = {\n"
        + "  happy: 'sentiment_very_satisfied',\n"
        + "  sick: 'sick',\n"
        + "}\n"
        + "const tone = 'success'\n"
        + "</script>\n",
    })
    const names = extractIconNames(root)
    expect(names).toContain('sentiment_very_satisfied')
    expect(names).toContain('sick')
    // 區塊結束後不再擴散
    expect(names).not.toContain('success')
  })
})
