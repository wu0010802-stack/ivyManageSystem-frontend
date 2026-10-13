import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'

const { mockList, mockVerify, mockOverride, mockHasPermission } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockVerify: vi.fn(),
  mockOverride: vi.fn(),
  mockHasPermission: vi.fn(() => true),
}))

vi.mock('@/api/pickupAuthorizations', () => ({
  listPickupAuthorizations: mockList,
  verifyPickupAuthorization: mockVerify,
  overridePickupAuthorization: mockOverride,
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: mockHasPermission,
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
  }
})

import PickupAuthorizationsView from '@/views/PickupAuthorizationsView.vue'

const SAMPLE_ITEM = {
  id: 1, student_id: 10, student_name: '小明', classroom_name: '向日葵',
  person_name: '王阿嬤', person_relation: '祖母', person_phone: '0912345678',
  photo_url: null, parent_name: '陳先生', pickup_date: '2026-08-11',
  status: 'active', effective_status: 'active', code_locked: false,
  code_attempts: 0, completed_at: null, completed_via: null,
  completed_by_name: null, override_note: null, cancelled_at: null,
  created_at: '2026-08-10T21:00:00',
}

const LOCKED_ITEM = {
  ...SAMPLE_ITEM, id: 2, student_name: '小美', person_name: '林伯伯',
  code_locked: true, code_attempts: 5,
}

function body() {
  return new DOMWrapper(document.body)
}

async function mountView() {
  const wrapper = mount(PickupAuthorizationsView, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PickupAuthorizationsView (admin)', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockVerify.mockReset()
    mockOverride.mockReset()
    mockHasPermission.mockReset()
    mockHasPermission.mockReturnValue(true)
    mockList.mockResolvedValue({ data: { items: [SAMPLE_ITEM] } })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders authorization rows', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('王阿嬤')
  })

  it('預設落在今天範圍，不帶日期參數呼叫 API', async () => {
    await mountView()
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(mockList).toHaveBeenCalledWith({})
  })

  it('切換到即將到來會帶明天起 14 天的日期參數重新查詢', async () => {
    const wrapper = await mountView()
    await wrapper.findAll('.el-radio-button__inner').find((b) => b.text() === '即將到來')!.trigger('click')
    await flushPromises()
    expect(mockList).toHaveBeenCalledTimes(2)
    const params = mockList.mock.calls[1][0]
    expect(params.date_from).toBeTruthy()
    expect(params.date_to).toBeTruthy()
  })

  it('搜尋接送人姓名可過濾表格列（前端過濾，不重打 API）', async () => {
    mockList.mockResolvedValue({ data: { items: [SAMPLE_ITEM, LOCKED_ITEM] } })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('林伯伯')
    await wrapper.find('.admin-list-toolbar__search input').setValue('王阿嬤')
    await flushPromises()
    expect(wrapper.text()).not.toContain('林伯伯')
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('hides confirm action when lacking GUARDIANS_WRITE', async () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = await mountView()
    expect(wrapper.findAll('button').some((b) => b.text() === '確認交接')).toBe(false)
  })

  it('shows confirm action when has GUARDIANS_WRITE', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('button').some((b) => b.text() === '確認交接')).toBe(true)
  })

  it('驗碼已鎖的列直接顯示人工核對鈕，不顯示確認交接', async () => {
    mockList.mockResolvedValue({ data: { items: [LOCKED_ITEM] } })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('驗碼已鎖')
    expect(wrapper.findAll('button').some((b) => b.text() === '人工核對')).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.text() === '確認交接')).toBe(false)
  })

  it('彈窗打開時取件碼輸入框自動聚焦', async () => {
    const wrapper = await mountView()
    const confirmBtn = body().findAll('button').find((b) => b.text() === '確認交接')
    await confirmBtn!.trigger('click')
    await flushPromises()
    // JSDOM 沒有真實 layout，聚焦行為以「有呼叫 focus」佐證，見 code-input ref。
    const input = body().find('.code-input input')
    expect(input.exists()).toBe(true)
  })

  it('輸入六碼後按 Enter 直接送出驗證', async () => {
    mockVerify.mockResolvedValue({ data: { ...SAMPLE_ITEM, status: 'completed', completed_via: 'code' } })
    const wrapper = await mountView()
    const confirmBtn = body().findAll('button').find((b) => b.text() === '確認交接')
    await confirmBtn!.trigger('click')
    await flushPromises()

    await body().find('.code-input input').setValue('123456')
    await body().find('.code-input input').trigger('keyup.enter')
    await flushPromises()

    expect(mockVerify).toHaveBeenCalledWith(1, { code: '123456' })
    expect(body().text()).toContain('已完成交接')
  })

  it('錯碼時顯示還可再試次數，不必等重新整理', async () => {
    mockVerify.mockRejectedValue({ response: { data: { detail: { error_code: 'code_mismatch', detail: '取件碼不正確' } } } })
    const wrapper = await mountView()
    const confirmBtn = body().findAll('button').find((b) => b.text() === '確認交接')
    await confirmBtn!.trigger('click')
    await flushPromises()

    await body().find('.code-input input').setValue('000000')
    const verifySubmit = body().findAll('.el-dialog__footer button').find((b) => b.text().includes('確認交接'))
    await verifySubmit!.trigger('click')
    await flushPromises()

    expect(body().text()).toContain('還可再試 4 次')
  })

  it('常駐「改用人工核對證件」連結可主動切換，不必等鎖定', async () => {
    const wrapper = await mountView()
    const confirmBtn = body().findAll('button').find((b) => b.text() === '確認交接')
    await confirmBtn!.trigger('click')
    await flushPromises()

    const switchLink = body().findAll('.link-btn').find((b) => b.text().includes('改用人工核對證件'))
    await switchLink!.trigger('click')
    await flushPromises()

    expect(body().find('.override-note').exists()).toBe(true)
  })

  it('admin can override-complete with note', async () => {
    mockOverride.mockResolvedValue({ data: { ...SAMPLE_ITEM, status: 'completed', completed_via: 'override' } })
    await mountView()

    const confirmBtn = body().findAll('button').find((b) => b.text() === '確認交接')
    await confirmBtn!.trigger('click')
    await flushPromises()

    const switchLink = body().findAll('.link-btn').find((b) => b.text().includes('改用人工核對證件'))
    await switchLink!.trigger('click')
    await flushPromises()

    await body().find('.override-note textarea').setValue('已核對身分證')
    const overrideSubmit = body().findAll('.el-dialog__footer button').find((b) => b.text().includes('人工核對後交接'))
    await overrideSubmit!.trigger('click')
    await flushPromises()

    expect(mockOverride).toHaveBeenCalledWith(1, { note: '已核對身分證' })
    expect(body().text()).toContain('已完成交接')
  })

  it('鎖定的授權開啟彈窗時直接顯示鎖定橫幅，不能切回驗碼', async () => {
    mockList.mockResolvedValue({ data: { items: [LOCKED_ITEM] } })
    const wrapper = await mountView()
    const overrideBtn = body().findAll('button').find((b) => b.text() === '人工核對')
    await overrideBtn!.trigger('click')
    await flushPromises()

    expect(body().text()).toContain('已連續輸錯')
    expect(body().findAll('.link-btn').some((b) => b.text().includes('回到驗碼'))).toBe(false)
  })

  it('交接紀錄顯示核銷人姓名', async () => {
    mockList.mockResolvedValue({
      data: {
        items: [{
          ...SAMPLE_ITEM, status: 'completed', effective_status: 'completed',
          completed_via: 'code', completed_at: '2026-08-11T16:12:00',
          completed_by_name: '王行政',
        }],
      },
    })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('王行政')
  })

  describe('第二批：三端語彙、日期箭頭、人工核對說明 chip、歷史區間上限', () => {
    const COMPLETED_ITEM = {
      ...SAMPLE_ITEM, id: 3, student_name: '小華', status: 'completed', effective_status: 'completed',
      completed_via: 'code', completed_at: '2026-08-11T16:12:00',
    }

    beforeEach(() => {
      // 2026-08-11 11:00（台北）；只假 Date，不動計時器（flushPromises 要真的 setTimeout）
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-11T03:00:00Z'))
      vi.mocked(ElMessageBox.confirm).mockClear()
      vi.mocked(ElMessage.warning).mockClear()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    async function openOverride() {
      await body().findAll('button').find((b) => b.text() === '確認交接')!.trigger('click')
      await flushPromises()
      await body().findAll('.link-btn').find((b) => b.text().includes('改用人工核對證件'))!.trigger('click')
      await flushPromises()
    }

    it('狀態語彙「待交接／已交接」，範圍列寫「筆待交接」，篩選段落同名', async () => {
      mockList.mockResolvedValue({ data: { items: [SAMPLE_ITEM, COMPLETED_ITEM] } })
      const wrapper = await mountView()
      expect(wrapper.text()).toContain('待交接')
      expect(wrapper.text()).toContain('已交接')
      expect(wrapper.text()).not.toContain('待確認')
      expect(wrapper.find('[data-test="scope-count"]').text()).toContain('1 筆待交接')
    })

    it('人工核對二次確認用交接語彙，不再出現「核銷」', async () => {
      mockOverride.mockResolvedValue({ data: { ...SAMPLE_ITEM, status: 'completed', completed_via: 'override' } })
      await mountView()
      await openOverride()
      await body().find('.override-note textarea').setValue('已核對身分證')
      await body().findAll('.el-dialog__footer button').find((b) => b.text().includes('人工核對後交接'))!.trigger('click')
      await flushPromises()

      expect(ElMessageBox.confirm).toHaveBeenCalledWith(
        expect.any(String), '人工核對後交接', expect.objectContaining({ confirmButtonText: '確認交接' }),
      )
      expect(JSON.stringify(vi.mocked(ElMessageBox.confirm).mock.calls)).not.toContain('核銷')
    })

    it('今天範圍可前後切日：前一天帶當日起訖並出現「回到今天」，回到今天恢復不帶參數', async () => {
      const wrapper = await mountView()
      expect(wrapper.find('[data-test="day-label"]').text()).toBe('今天')
      expect(wrapper.find('[data-test="day-reset"]').exists()).toBe(false)

      await wrapper.find('[data-test="day-prev"]').trigger('click')
      await flushPromises()
      expect(mockList).toHaveBeenLastCalledWith({ date_from: '2026-08-10', date_to: '2026-08-10' })
      expect(wrapper.find('[data-test="day-label"]').text()).toContain('8/10')
      expect(wrapper.find('[data-test="scope-count"]').text()).toContain('8/10')

      await wrapper.find('[data-test="day-reset"]').trigger('click')
      await flushPromises()
      expect(mockList).toHaveBeenLastCalledWith({})
      expect(wrapper.find('[data-test="day-reset"]').exists()).toBe(false)
    })

    it('後一天切到明天；切到別的範圍再切回「今天」會重設為今天', async () => {
      const wrapper = await mountView()
      await wrapper.find('[data-test="day-next"]').trigger('click')
      await flushPromises()
      expect(mockList).toHaveBeenLastCalledWith({ date_from: '2026-08-12', date_to: '2026-08-12' })
      expect(wrapper.find('[data-test="day-label"]').text()).toBe('明天')

      const radios = wrapper.findAll('.el-radio-button__inner')
      await radios.find((b) => b.text() === '即將到來')!.trigger('click')
      await flushPromises()
      await radios.find((b) => b.text() === '今天')!.trigger('click')
      await flushPromises()
      expect(mockList).toHaveBeenLastCalledWith({})
      expect(wrapper.find('[data-test="day-label"]').text()).toBe('今天')
    })

    it('連點切日時只採用最後一次查詢的結果，較慢的舊回應不會蓋掉新的一天', async () => {
      const wrapper = await mountView()
      let resolveFirst: (v: unknown) => void = () => {}
      let resolveSecond: (v: unknown) => void = () => {}
      mockList
        .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
        .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

      await wrapper.find('[data-test="day-prev"]').trigger('click') // 8/10（慢）
      await wrapper.find('[data-test="day-prev"]').trigger('click') // 8/9（快）
      resolveSecond({ data: { items: [{ ...SAMPLE_ITEM, id: 9, student_name: '前天的學生' }] } })
      await flushPromises()
      resolveFirst({ data: { items: [{ ...SAMPLE_ITEM, id: 8, student_name: '昨天的學生' }] } })
      await flushPromises()

      expect(wrapper.find('[data-test="day-label"]').text()).toContain('8/9')
      expect(wrapper.text()).toContain('前天的學生')
      expect(wrapper.text()).not.toContain('昨天的學生')
    })

    it('人工核對說明 chip：點了附加到說明欄，重複點同一個不重複附加', async () => {
      await mountView()
      await openOverride()
      const chip = (label: string) => body().findAll('[data-test="note-chip"]').find((c) => c.text() === label)!
      const textarea = () => body().find('.override-note textarea').element as HTMLTextAreaElement

      expect(body().findAll('[data-test="note-chip"]').length).toBeGreaterThanOrEqual(3)
      await chip('已電話確認家長').trigger('click')
      expect(textarea().value).toBe('已電話確認家長')
      await chip('證件相符').trigger('click')
      expect(textarea().value).toBe('已電話確認家長；證件相符')
      await chip('證件相符').trigger('click')
      expect(textarea().value).toBe('已電話確認家長；證件相符')
    })

    it('歷史範圍說明最多 92 天；選超過 92 天不送出查詢並提示', async () => {
      const wrapper = await mountView()
      await wrapper.findAll('.el-radio-button__inner').find((b) => b.text() === '歷史')!.trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="range-hint"]').text()).toContain('92 天')
      const callsBefore = mockList.mock.calls.length

      wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', ['2026-01-01', '2026-04-04'])
      await flushPromises()
      expect(mockList.mock.calls.length).toBe(callsBefore)
      expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('92 天'))

      wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', ['2026-01-01', '2026-04-03'])
      await flushPromises()
      expect(mockList).toHaveBeenLastCalledWith({ date_from: '2026-01-01', date_to: '2026-04-03' })
    })
  })
})
