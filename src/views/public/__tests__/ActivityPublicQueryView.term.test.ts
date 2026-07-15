import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicQueryRegistration: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  getPublicBootstrap: vi.fn(),
  getPublicCoursesAvailability: vi.fn(),
}))

import {
  getPublicBootstrap,
  getPublicCoursesAvailability,
  publicQueryByToken,
} from '@/api/activityPublic'
import ActivityPublicQueryView from '../ActivityPublicQueryView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPublicBootstrap).mockImplementation((params?: unknown) => {
    if (params) {
      return Promise.resolve({
        data: {
          courses: [{ name: '歷史仍開放課', price: 1800 }],
          supplies: [{ name: '歷史仍販售用品', price: 200 }],
          classes: ['大班'],
          course_videos: {},
        },
      } as never)
    }
    return Promise.resolve({
      data: {
        courses: [{ name: '本學期課程', price: 3000 }],
        supplies: [],
        classes: ['大班'],
        course_videos: {},
      },
    } as never)
  })
  vi.mocked(getPublicCoursesAvailability).mockResolvedValue({
    data: { 歷史仍開放課: 5 },
  } as never)
  vi.mocked(publicQueryByToken).mockResolvedValue({
    data: {
      id: 42,
      name: '小明',
      birthday: '2020-01-01',
      class_name: '大班',
      parent_phone: '0912345678',
      school_year: 113,
      semester: 2,
      courses: [{ course_id: 9, name: '舊陶藝', status: 'enrolled', price: 1600 }],
      supplies: [{ name: '舊材料包', price: 150 }],
      total_amount: 1750,
      paid_amount: 0,
      query_token_required: true,
      is_paid: false,
    },
  } as never)
})

describe('ActivityPublicQueryView 跨學期編修', () => {
  it('查到歷史報名後重載該學期，並保留已停用既有品項供取消但不可重加', async () => {
    const wrapper = mount(ActivityPublicQueryView)
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      queryMode: 'fields' | 'token'
      queryForm: { token: string; parent_phone: string }
      handleQuery: () => Promise<void>
      editForm: { selectedCourses: string[]; selectedSupplies: string[] }
      onToggleCourseOption: (course: { name: string; existing_only?: boolean }) => void
      onToggleSupplyOption: (supply: { name: string; existing_only?: boolean }) => void
    }
    vm.queryMode = 'token'
    vm.queryForm.token = 'HISTORICAL-TOKEN'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()
    await flushPromises()

    const term = { school_year: 113, semester: 2 }
    expect(getPublicBootstrap).toHaveBeenLastCalledWith(term)
    expect(getPublicCoursesAvailability).toHaveBeenCalledWith(term)
    expect(wrapper.text()).toContain('歷史仍開放課')
    expect(wrapper.text()).toContain('舊陶藝')
    expect(wrapper.text()).toContain('舊材料包')
    expect(wrapper.text()).toContain('已停用，僅可取消')
    expect(wrapper.text()).not.toContain('本學期課程')

    const oldCourse = { name: '舊陶藝', existing_only: true }
    vm.onToggleCourseOption(oldCourse)
    expect(vm.editForm.selectedCourses).toEqual([])
    vm.onToggleCourseOption(oldCourse)
    expect(vm.editForm.selectedCourses).toEqual([])

    const oldSupply = { name: '舊材料包', existing_only: true }
    vm.onToggleSupplyOption(oldSupply)
    expect(vm.editForm.selectedSupplies).toEqual([])
    vm.onToggleSupplyOption(oldSupply)
    expect(vm.editForm.selectedSupplies).toEqual([])

    wrapper.unmount()
  })

  it('歷史選項尚未載入時立即清除本學期選項，且禁止新增與儲存', async () => {
    const wrapper = mount(ActivityPublicQueryView)
    await flushPromises()

    const historical = deferred<{
      data: {
        courses: Array<{ name: string; price: number }>
        supplies: unknown[]
        classes: string[]
        course_videos: Record<string, never>
      }
    }>()
    vi.mocked(getPublicBootstrap).mockReturnValueOnce(historical.promise as never)
    const vm = wrapper.vm as unknown as {
      queryMode: 'fields' | 'token'
      queryForm: { token: string; parent_phone: string }
      handleQuery: () => Promise<void>
      editForm: { selectedCourses: string[] }
      onToggleCourseOption: (course: { name: string }) => void
      saveBlocked: boolean
    }
    vm.queryMode = 'token'
    vm.queryForm.token = 'HISTORICAL-TOKEN'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()

    expect(wrapper.text()).not.toContain('本學期課程')
    expect(wrapper.text()).toContain('舊陶藝')
    expect(wrapper.text()).toContain('正在載入該學期課程與名額')
    vm.onToggleCourseOption({ name: '本學期課程' })
    expect(vm.editForm.selectedCourses).toEqual(['舊陶藝'])
    expect(vm.saveBlocked).toBe(true)

    historical.resolve({
      data: {
        courses: [{ name: '歷史仍開放課', price: 1800 }],
        supplies: [],
        classes: ['大班'],
        course_videos: {},
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('歷史仍開放課')
    expect(wrapper.text()).not.toContain('本學期課程')
    expect(vm.saveBlocked).toBe(false)
    wrapper.unmount()
  })

  it('歷史選項載入失敗時保留既有品項但 fail closed，且不讓舊請求污染新結果', async () => {
    const wrapper = mount(ActivityPublicQueryView)
    await flushPromises()
    const failed = deferred<never>()
    vi.mocked(getPublicBootstrap).mockReturnValueOnce(failed.promise as never)
    const vm = wrapper.vm as unknown as {
      queryMode: 'fields' | 'token'
      queryForm: { token: string; parent_phone: string }
      handleQuery: () => Promise<void>
      saveBlocked: boolean
    }
    vm.queryMode = 'token'
    vm.queryForm.token = 'HISTORICAL-TOKEN'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()
    failed.reject(new Error('bootstrap down'))
    await flushPromises()

    expect(wrapper.text()).toContain('舊陶藝')
    expect(wrapper.text()).not.toContain('本學期課程')
    expect(wrapper.text()).toContain('無法載入該學期課程資料')
    expect(vm.saveBlocked).toBe(true)
    wrapper.unmount()
  })

  it('名額尚未載入或失敗時鎖住新課與儲存，成功取得同學期資料後才開放', async () => {
    const availability = deferred<{ data: Record<string, number> }>()
    vi.mocked(getPublicCoursesAvailability).mockReturnValueOnce(availability.promise as never)
    const wrapper = mount(ActivityPublicQueryView)
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      queryMode: 'fields' | 'token'
      queryForm: { token: string; parent_phone: string }
      handleQuery: () => Promise<void>
      courseLocked: (name: string) => boolean
      saveBlocked: boolean
    }
    vm.queryMode = 'token'
    vm.queryForm.token = 'HISTORICAL-TOKEN'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()
    await flushPromises()

    expect(vm.courseLocked('歷史仍開放課')).toBe(true)
    expect(vm.saveBlocked).toBe(true)

    availability.resolve({ data: { 歷史仍開放課: 5 } })
    await flushPromises()
    expect(vm.courseLocked('歷史仍開放課')).toBe(false)
    expect(vm.saveBlocked).toBe(false)
    wrapper.unmount()
  })
})
