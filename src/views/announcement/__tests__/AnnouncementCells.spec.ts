/**
 * 公告列表儲存格元件：桌機表格與手機卡片共用，避免兩邊顯示不一致。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AnnouncementReadCell from '@/views/announcement/AnnouncementReadCell.vue'
import AnnouncementAudienceTags from '@/views/announcement/AnnouncementAudienceTags.vue'
import AnnouncementStatusTag from '@/views/announcement/AnnouncementStatusTag.vue'

const stubs = {
  'el-tag': { template: '<span class="tag"><slot /></span>' },
  'el-button': { template: '<button><slot /></button>' },
  // popover 內容直接攤開，方便斷言
  'el-popover': { template: '<div><slot name="reference" /><slot /></div>' },
}
const directives = { loading: () => {} }
const mountCell = (props: Record<string, unknown>) =>
  mount(AnnouncementReadCell, { props, global: { stubs, directives } })

describe('AnnouncementReadCell', () => {
  it('名單載入失敗要明說並可重試，不能顯示成「尚未有人已讀」', async () => {
    const w = mountCell({ readCount: 3, error: true })
    expect(w.text()).toContain('名單載入失敗')
    expect(w.text()).not.toContain('尚未有人已讀')
    await w.find('.reader-error button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('載入完成但名單為空 → 尚未有人已讀；載入中不顯示空訊息', () => {
    expect(mountCell({ readCount: 2, readers: [] }).find('.reader-popover').text()).toContain('尚未有人已讀')
    expect(mountCell({ readCount: 2, readers: [], loading: true }).find('.reader-popover').text()).not.toContain('尚未有人已讀')
  })

  it('有已讀名單時逐筆列出；compact（手機卡片）不顯示姓名預覽 tags', () => {
    const base = {
      readCount: 4,
      preview: [{ employee_id: 1, name: '王老師' }],
      readers: [{ employee_id: 1, name: '王老師', read_at: '2026-03-14T09:05:00' }],
    }
    const full = mountCell(base)
    expect(full.find('.read-preview-tags').text()).toContain('王老師')
    expect(full.text()).toContain('已讀 4 人')
    expect(mountCell({ ...base, compact: true }).find('.read-preview-tags').exists()).toBe(false)
  })

  it('純家長已讀（員工 0）只顯示家長已讀，不誤顯尚未有人已讀', () => {
    const w = mountCell({ readCount: 0, parentReadCount: 5 })
    expect(w.text()).toContain('家長已讀 5 人')
    expect(w.text()).not.toContain('尚未有人已讀')
  })

  it('open popover 時通知父層載入', async () => {
    const w = mount(AnnouncementReadCell, {
      props: { readCount: 1 },
      global: {
        stubs: { ...stubs, 'el-popover': { emits: ['show'], template: '<div><button class="open" @click="$emit(\'show\')" /><slot name="reference" /><slot /></div>' } },
        directives,
      },
    })
    await w.find('.open').trigger('click')
    expect(w.emitted('show')).toHaveLength(1)
  })
})

describe('AnnouncementAudienceTags', () => {
  const mountAudience = (props: Record<string, unknown>) => mount(AnnouncementAudienceTags, { props, global: { stubs } })

  it('無員工限制 → 全體員工；有限制 → N 位員工', () => {
    expect(mountAudience({}).text()).toBe('全體員工')
    expect(mountAudience({ employeeCount: 3 }).text()).toBe('3 位員工')
  })

  it('有家長對象時加註「含家長」（手機卡片原本漏掉）', () => {
    const w = mountAudience({ hasParents: true })
    expect(w.text()).toContain('全體員工')
    expect(w.text()).toContain('含家長')
  })
})

describe('AnnouncementStatusTag', () => {
  const mountStatus = (props: Record<string, unknown>) => mount(AnnouncementStatusTag, { props, global: { stubs } })

  it('三種狀態文案', () => {
    expect(mountStatus({ status: 'active' }).text()).toBe('進行中')
    expect(mountStatus({ status: 'expired' }).text()).toBe('已過期')
    expect(mountStatus({ status: 'scheduled' }).text()).toContain('預定發佈')
  })

  it('預定發佈列出發佈時間，其他狀態不列', () => {
    expect(mountStatus({ status: 'scheduled', publishAt: '2099-01-01T08:30:00' }).text()).toContain('2099-01-01 08:30')
    expect(mountStatus({ status: 'active', publishAt: '2099-01-01T08:30:00' }).text()).not.toContain('2099')
  })
})
