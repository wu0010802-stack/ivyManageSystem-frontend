/**
 * Finding 3（2026-06-22）：公開報名草稿暫存排除幼兒 PII。
 *
 * ActivityPublicView 原本 useFormDraft 未設 exclude，姓名/生日/班級/家長電話會
 * 持久化到共用 localStorage（scope 固定 'public'，TTL 7 天），共用電腦的下一位
 * 訪客可被提示還原前一位幼兒的資料。修補後 PII 欄位不入草稿，只保留課程/用品選擇。
 *
 * happy-dom（vitest 預設）提供 localStorage / document / window。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { reactive } from 'vue'
import { useFormDraft } from '@/composables/useFormDraft'
import { PUBLIC_DRAFT_PII_FIELDS } from '@/composables/usePublicRegistrationForm'

describe('公開報名草稿排除 PII（Finding 3）', () => {
  beforeEach(() => localStorage.clear())

  it('PII 欄位清單涵蓋姓名/生日/家長電話/班級，且不含課程/用品選擇', () => {
    expect(PUBLIC_DRAFT_PII_FIELDS).toEqual(
      expect.arrayContaining(['name', 'birthday', 'parent_phone', 'class_name']),
    )
    expect(PUBLIC_DRAFT_PII_FIELDS).not.toContain('selectedCourses')
    expect(PUBLIC_DRAFT_PII_FIELDS).not.toContain('selectedSupplies')
  })

  it('用此清單作 exclude 時，寫入的草稿不含 PII，但保留課程/用品選擇', () => {
    const form = reactive({
      name: '王小明',
      birthday: '2020-01-01',
      parent_phone: '0912345678',
      class_name: '大象班',
      selectedCourses: ['圍棋'],
      selectedSupplies: ['畫具'],
    })
    const draft = useFormDraft({
      formId: 'activity-public',
      state: form,
      userScope: () => 'public',
      exclude: [...PUBLIC_DRAFT_PII_FIELDS],
      debounceMs: 0,
    })
    // 觸發 dirty 後立即 flush（debounceMs=0 同步寫入）
    form.selectedCourses = ['圍棋', '舞蹈']
    draft.flush()

    // happy-dom 的 Storage key 不一定能用 Object.keys 列舉 → 用 Storage API 走訪
    let key = null
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.includes('activity-public')) {
        key = k
        break
      }
    }
    expect(key).toBeTruthy()
    const env = JSON.parse(localStorage.getItem(key))
    // PII 不入草稿
    expect(env.data).not.toHaveProperty('name')
    expect(env.data).not.toHaveProperty('birthday')
    expect(env.data).not.toHaveProperty('parent_phone')
    expect(env.data).not.toHaveProperty('class_name')
    // 非 PII 的選擇保留
    expect(env.data.selectedCourses).toEqual(['圍棋', '舞蹈'])
    expect(env.data.selectedSupplies).toEqual(['畫具'])
  })
})
