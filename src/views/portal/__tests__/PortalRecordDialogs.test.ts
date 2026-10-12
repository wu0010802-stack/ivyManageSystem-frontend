import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * 教師端「新增事件紀錄」「新增評量」dialog（2026-10-12 UI/UX 審查）。
 *
 * 1. 送出鈕原本是泛用的「確認」，改成具體動詞（兩支 dialog 都只有新增、沒有編輯模式）：
 *    事件 → 「新增事件紀錄」、評量 → 「新增評量」。
 * 2. dialog 寬度原本寫死 500/520px，手機（< 768px）會比螢幕還寬或貼邊；
 *    手機改 92%，桌機維持原寬。
 */

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, media: '(max-width: 767.98px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
}

vi.mock('@/api/studentIncidents', () => ({
  getMyClassIncidents: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  createPortalIncident: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/studentAssessments', () => ({
  getMyClassAssessments: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  createPortalAssessment: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/portal', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    getMyStudents: vi.fn(() =>
      Promise.resolve({
        data: { classrooms: [{ classroom_id: 11, classroom_name: '小班', students: [{ id: 1, name: '小明' }] }] },
      }),
    ),
  }
})

import PortalIncidentView from '@/views/portal/PortalIncidentView.vue'
import PortalAssessmentView from '@/views/portal/PortalAssessmentView.vue'

async function openDialog(component: unknown) {
  const wrapper = mount(component as never, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await flushPromises()
  ;(wrapper.vm as unknown as { openCreate: () => void }).openCreate()
  await flushPromises()
  return wrapper
}

/** el-dialog teleport 到 body，footer 內「取消」之外的主按鈕即送出鈕。 */
function submitButtonText(): string {
  const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.el-dialog__footer button'))
  const primary = buttons.find((b) => b.classList.contains('el-button--primary'))
  expect(primary, '找不到 dialog 主按鈕').toBeTruthy()
  return primary!.textContent!.trim()
}

function dialogWidth(): string {
  const dialog = document.body.querySelector<HTMLElement>('.el-dialog')
  expect(dialog, '找不到 el-dialog').toBeTruthy()
  return dialog!.style.getPropertyValue('--el-dialog-width')
}

describe('教師端新增 dialog：送出鈕文案與手機寬度', () => {
  beforeEach(() => setMobile(false))

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('事件紀錄：送出鈕是「新增事件紀錄」，不是泛用的「確認」', async () => {
    const wrapper = await openDialog(PortalIncidentView)
    expect(submitButtonText()).toBe('新增事件紀錄')
    expect(submitButtonText()).not.toBe('確認')
    wrapper.unmount()
  })

  it('評量：送出鈕是「新增評量」，不是泛用的「確認」', async () => {
    const wrapper = await openDialog(PortalAssessmentView)
    expect(submitButtonText()).toBe('新增評量')
    expect(submitButtonText()).not.toBe('確認')
    wrapper.unmount()
  })

  it('桌機：維持原本寬度（事件 500px、評量 520px）', async () => {
    setMobile(false)
    const incident = await openDialog(PortalIncidentView)
    expect(dialogWidth()).toBe('500px')
    incident.unmount()
    document.body.innerHTML = ''

    const assessment = await openDialog(PortalAssessmentView)
    expect(dialogWidth()).toBe('520px')
    assessment.unmount()
  })

  it('手機：dialog 寬度改 92%，不再寫死 px', async () => {
    setMobile(true)
    const incident = await openDialog(PortalIncidentView)
    expect(dialogWidth()).toBe('92%')
    incident.unmount()
    document.body.innerHTML = ''

    const assessment = await openDialog(PortalAssessmentView)
    expect(dialogWidth()).toBe('92%')
    assessment.unmount()
  })
})
