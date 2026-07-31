import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { reactive, ref, nextTick } from 'vue'
import { usePublicRegistrationDraft, type PublicRegistrationDraftForm } from '../usePublicRegistrationDraft'

const STORAGE_KEY = 'ivy:public-activity-draft:v1'

function makeForm(overrides: Partial<PublicRegistrationDraftForm> = {}) {
  return reactive<PublicRegistrationDraftForm>({
    name: '',
    birthday: '',
    parent_phone: '',
    class_name: '',
    email: '',
    selectedCourses: [],
    selectedSupplies: [],
    ...overrides,
  })
}

function setup(formOverrides: Partial<PublicRegistrationDraftForm> = {}) {
  const form = makeForm(formOverrides)
  const currentStep = ref(1)
  const highestVisitedStep = ref(1)
  const draft = usePublicRegistrationDraft({ form, currentStep, highestVisitedStep })
  return { form, currentStep, highestVisitedStep, ...draft }
}

function writeDraft(payload: Record<string, unknown>) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

const FILLED_FORM = {
  name: '王小明',
  birthday: '2022-03-04',
  parent_phone: '0912345678',
  class_name: '小班A',
  email: '',
  selectedCourses: ['舞蹈'],
  selectedSupplies: ['舞衣'],
}

describe('usePublicRegistrationDraft', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounce 後把填寫中的表單寫進 sessionStorage', async () => {
    const { form, startAutosave } = setup()
    const stop = startAutosave()

    form.name = '王小明'
    await nextTick()
    // debounce 未到期前不應寫入（避免每個按鍵都碰 storage）
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()

    vi.advanceTimersByTime(400)
    const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) as string)
    expect(saved.form.name).toBe('王小明')

    stop()
  })

  it('空表單不留草稿：送出後 resetForm 不應寫回一筆空草稿', async () => {
    const { form, startAutosave } = setup(FILLED_FORM)
    const stop = startAutosave()

    form.name = '王小華'
    await nextTick()
    vi.advanceTimersByTime(400)
    expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()

    Object.assign(form, { name: '', birthday: '', parent_phone: '', class_name: '', email: '' })
    form.selectedCourses = []
    form.selectedSupplies = []
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    stop()
  })

  it('還原草稿並回復步驟', () => {
    writeDraft({
      savedAt: Date.now(),
      currentStep: 2,
      highestVisitedStep: 2,
      form: FILLED_FORM,
    })

    const { form, currentStep, highestVisitedStep, restoreDraft } = setup()
    expect(restoreDraft(['舞蹈'], ['舞衣'])).toBe(true)
    expect(form.name).toBe('王小明')
    expect(form.parent_phone).toBe('0912345678')
    expect(currentStep.value).toBe(2)
    expect(highestVisitedStep.value).toBe(2)
  })

  it('濾掉已下架的課程與用品，避免送出必吃後端 400', () => {
    writeDraft({
      savedAt: Date.now(),
      currentStep: 2,
      highestVisitedStep: 2,
      form: { ...FILLED_FORM, selectedCourses: ['舞蹈', '已下架的課'], selectedSupplies: ['舞衣'] },
    })

    const { form, restoreDraft } = setup()
    expect(restoreDraft(['舞蹈'], [])).toBe(true)
    expect(form.selectedCourses).toEqual(['舞蹈'])
    expect(form.selectedSupplies).toEqual([])
  })

  it('highestVisitedStep 永遠不小於 currentStep，否則所在步驟會被標成未解鎖', () => {
    writeDraft({
      savedAt: Date.now(),
      currentStep: 3,
      highestVisitedStep: 1,
      form: FILLED_FORM,
    })

    const { currentStep, highestVisitedStep, restoreDraft } = setup()
    restoreDraft(['舞蹈'], ['舞衣'])
    expect(currentStep.value).toBe(3)
    expect(highestVisitedStep.value).toBe(3)
  })

  it('超過 24 小時的草稿視為過期並清除', () => {
    writeDraft({
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
      currentStep: 2,
      highestVisitedStep: 2,
      form: FILLED_FORM,
    })

    const { form, restoreDraft } = setup()
    expect(restoreDraft(['舞蹈'], ['舞衣'])).toBe(false)
    expect(form.name).toBe('')
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('草稿內容毀損時靜默清除，不拋錯', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{ not json')
    const { restoreDraft } = setup()
    expect(restoreDraft([], [])).toBe(false)
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('濾完課程／用品後若整份草稿等於空白，不顯示還原提示', () => {
    writeDraft({
      savedAt: Date.now(),
      currentStep: 2,
      highestVisitedStep: 2,
      form: { ...FILLED_FORM, name: '', birthday: '', parent_phone: '', class_name: '', email: '' },
    })

    const { restoreDraft } = setup()
    expect(restoreDraft([], [])).toBe(false)
  })

  it('clearDraft 清掉 storage', () => {
    writeDraft({ savedAt: Date.now(), currentStep: 1, highestVisitedStep: 1, form: FILLED_FORM })
    const { clearDraft } = setup()
    clearDraft()
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('storage 寫入失敗時不影響報名主流程', async () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

    const { form, startAutosave } = setup()
    const stop = startAutosave()
    form.name = '王小明'
    await nextTick()
    expect(() => vi.advanceTimersByTime(400)).not.toThrow()

    stop()
    setItem.mockRestore()
  })
})
