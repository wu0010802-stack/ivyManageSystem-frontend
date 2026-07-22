import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AuditChangesDetail from '../AuditChangesDetail.vue'

// el-table 的列內容在 mounted 後才透過 post-flush watcher 排版完成，
// 必須等一次 tick 才會出現在 DOM；純同步 mount() 只看得到表頭。
const mountDetail = async (changes: Record<string, unknown> | null, fieldLabels?: Record<string, string>) => {
  const w = mount(AuditChangesDetail, {
    props: { changes, fieldLabels },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

describe('AuditChangesDetail', () => {
  it('nested diff（before/after）呈現變更前後', async () => {
    const w = await mountDetail({ name: { before: '甲', after: '乙' } })
    expect(w.text()).toContain('變更欄位')
    expect(w.text()).toContain('甲')
    expect(w.text()).toContain('乙')
  })

  it('新格式 diff 巢狀鍵也呈現', async () => {
    const w = await mountDetail({ diff: { status: { before: 'pending', after: 'approved' } } })
    expect(w.text()).toContain('pending')
    expect(w.text()).toContain('approved')
  })

  it('flat 欄位進「操作上下文」區', async () => {
    const w = await mountDetail({ action: 'fee_refund' })
    expect(w.text()).toContain('操作上下文')
    expect(w.text()).toContain('fee_refund')
  })

  it('meta 清單（risk_tags）獨立分區', async () => {
    const w = await mountDetail({ risk_tags: ['force_overlap'] })
    expect(w.text()).toContain('force_overlap')
  })

  it('field label 有對映顯中文、無對映 fallback 原 key', async () => {
    const w = await mountDetail(
      { delta: { before: 100, after: 6000 }, unknown_key: { before: 1, after: 2 } },
      { delta: '金額變動' },
    )
    expect(w.text()).toContain('金額變動')
    expect(w.text()).not.toContain('delta')
    expect(w.text()).toContain('unknown_key')
  })

  it('無 changes 顯示空狀態文案', async () => {
    const w = await mountDetail(null)
    expect(w.text()).toContain('此紀錄未記錄欄位變更詳情')
  })

  it('長值截斷至 120 字並保留完整值於 title', async () => {
    const long = 'x'.repeat(200)
    const w = await mountDetail({ memo: { before: '', after: long } })
    // 「變更前」欄（before=''）也帶 title（空字串），故用 .diff-after 精準鎖定長值所在的欄位。
    const cell = w.find('.diff-after')
    expect(cell.attributes('title')).toContain(long)
    expect(w.text()).not.toContain(long)
    expect(w.text()).toContain('x'.repeat(120) + '…')
  })
})
