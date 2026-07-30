import { describe, it, expect } from 'vitest'
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  FUNNEL_STAGE_COLORS,
  WITHDRAWN_FROM_LABELS,
  FUNNEL_EVENT_LABELS,
} from '../recruitmentFunnel'

describe('recruitmentFunnel constants — 漏斗四欄單一來源', () => {
  it('stage 集合 = visited/deposited/enrolled/withdrawn（active 已移除，勿加回）', () => {
    expect([...FUNNEL_STAGES]).toEqual(['visited', 'deposited', 'enrolled', 'withdrawn'])
  })

  it('labels/colors key 集合與 FUNNEL_STAGES 一致', () => {
    const expected = [...FUNNEL_STAGES].sort()
    expect(Object.keys(FUNNEL_STAGE_LABELS).sort()).toEqual(expected)
    expect(Object.keys(FUNNEL_STAGE_COLORS).sort()).toEqual(expected)
  })

  it('第四欄用語鎖定「退預繳／退註冊」；退出類型標籤鎖定', () => {
    expect(FUNNEL_STAGE_LABELS.withdrawn).toBe('退預繳／退註冊')
    expect(WITHDRAWN_FROM_LABELS).toEqual({ deposited: '退預繳', enrolled: '退註冊' })
  })

  it('事件標籤含新舊事件型別（activated 為存量顯示用）', () => {
    expect(FUNNEL_EVENT_LABELS.withdrawn).toBe('退預繳／退註冊')
    expect(FUNNEL_EVENT_LABELS.withdraw_cancelled).toBe('取消退費')
    expect(FUNNEL_EVENT_LABELS.activated).toContain('舊紀錄')
  })
})
