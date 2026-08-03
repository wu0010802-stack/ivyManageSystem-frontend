/**
 * usePublicRegistrationForm 新版 composable 測試（A1-P1 重寫後）。
 *
 * 涵蓋:
 *  - form / errors reactive 初始值
 *  - normalizeMobile（純函式）
 *  - validateForm（success + 各 fail case + 邊界）
 *  - clearError
 *  - toggleCourse（額滿 -1 擋 / 候補 0 允許）
 *  - toggleSupply
 *  - resetForm
 *  - feePreview（含 waitlistCount 估算）
 *  - parentPhoneError（touched + value 組合）
 *  - maxBirthdayISO / minBirthdayISO 邊界
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import {
  usePublicRegistrationForm,
  normalizeMobile,
} from '@/composables/usePublicRegistrationForm'

function makeCtx() {
  return {
    courses: ref([
      { name: '美術', price: 1200, sessions: 8 },
      { name: '舞蹈', price: 1500, sessions: 8 },
      { name: '英文', price: 1800, sessions: 10 },
    ]),
    supplies: ref([
      { name: '畫具組', price: 300 },
      { name: '舞鞋', price: 500 },
    ]),
    availability: ref({ 美術: 5, 舞蹈: 0, 英文: -1 }), // 美術剩 5、舞蹈候補、英文額滿
  }
}

describe('usePublicRegistrationForm — 新版 composable', () => {
  let ctx
  let f
  beforeEach(() => {
    ctx = makeCtx()
    f = usePublicRegistrationForm(ctx)
  })

  describe('初始狀態', () => {
    it('form 初始全空、selectedCourses/selectedSupplies 為空陣列', () => {
      expect(f.form.name).toBe('')
      expect(f.form.parent_phone).toBe('')
      expect(f.form.class_name).toBe('')
      expect(f.form.email).toBe('')
      expect(f.form.selectedCourses).toEqual([])
      expect(f.form.selectedSupplies).toEqual([])
    })

    it('errors 全空字串、phoneTouched=false', () => {
      expect(f.errors.name).toBe('')
      expect(f.errors.email).toBe('')
      expect(f.errors.courses).toBe('')
      expect(f.phoneTouched.value).toBe(false)
    })

    it('FIELD_FOCUS_ORDER 包含 5 欄（課程優先流程：courses 排最前；2026-08-03 生日欄已移除）', () => {
      expect(f.FIELD_FOCUS_ORDER).toEqual([
        'courses',
        'name',
        'parent_phone',
        'class_name',
        'email',
      ])
    })
  })

  describe('normalizeMobile 純函式', () => {
    it('拿掉空白 / dash / 括號', () => {
      expect(normalizeMobile('0912-345-678')).toBe('0912345678')
      expect(normalizeMobile('0912 345 678')).toBe('0912345678')
      expect(normalizeMobile('(09)1234-5678')).toBe('0912345678')
    })

    it('null/undefined 回空字串', () => {
      expect(normalizeMobile(null)).toBe('')
      expect(normalizeMobile(undefined)).toBe('')
    })
  })

  describe('validateForm', () => {
    it('完整正確資料 → true,errors 全空', () => {
      f.form.name = '小明'
      f.form.parent_phone = '0912345678'
      f.form.class_name = '大班'
      f.form.selectedCourses = ['美術']
      expect(f.validateForm()).toBe(true)
      expect(f.errors.name).toBe('')
      expect(f.errors.courses).toBe('')
    })

    it('缺姓名 → false,errors.name 填入', () => {
      f.form.parent_phone = '0912345678'
      f.form.class_name = '大班'
      f.form.selectedCourses = ['美術']
      expect(f.validateForm()).toBe(false)
      expect(f.errors.name).toBe('請輸入幼兒姓名')
    })

    it('手機格式錯誤 → errors.parent_phone', () => {
      f.form.name = '小明'
      f.form.parent_phone = '12345'
      f.form.class_name = '大班'
      f.form.selectedCourses = ['美術']
      expect(f.validateForm()).toBe(false)
      expect(f.errors.parent_phone).toContain('09')
    })

    it('未選課程且未選用品 → false,errors.courses', () => {
      f.form.name = '小明'
      f.form.parent_phone = '0912345678'
      f.form.class_name = '大班'
      expect(f.validateForm()).toBe(false)
      expect(f.errors.courses).toContain('至少')
    })

    it('只選用品、無課程 → false（用品只能加購）', () => {
      f.form.name = '小明'
      f.form.parent_phone = '0912345678'
      f.form.class_name = '大班'
      f.form.selectedSupplies = ['畫具組']
      expect(f.validateForm()).toBe(false)
      expect(f.errors.courses).toContain('課程')
    })

    it('課程與用品皆空 → false,errors.courses 標記', () => {
      f.form.name = '小明'
      f.form.parent_phone = '0912345678'
      f.form.class_name = '大班'
      f.form.selectedCourses = []
      f.form.selectedSupplies = []
      expect(f.validateForm()).toBe(false)
      expect(f.errors.courses).toContain('至少')
    })
  })

  describe('step validation', () => {
    it('寶貝資料完整時可先進入選課，不要求先選課程', () => {
      f.form.name = '小明'
      f.form.parent_phone = '0912345678'
      f.form.class_name = '大班'

      expect(f.validatePersonalDetails()).toBe(true)
      expect(f.errors.courses).toBe('')
    })

    it('選課步驟至少要選一門課，用品為選填', () => {
      expect(f.validateSelections()).toBe(false)
      expect(f.errors.courses).toContain('課程')

      f.form.selectedSupplies = ['畫具組']
      expect(f.validateSelections()).toBe(false)

      f.form.selectedCourses = ['美術']
      expect(f.validateSelections()).toBe(true)
      expect(f.errors.courses).toBe('')
    })
  })

  describe('clearError', () => {
    it('清除指定欄位 error', () => {
      f.errors.name = '請輸入姓名'
      f.clearError('name')
      expect(f.errors.name).toBe('')
    })

    it('不影響其他欄位', () => {
      f.errors.name = '請輸入姓名'
      f.errors.class_name = '請選擇寶貝班級'
      f.clearError('name')
      expect(f.errors.class_name).toBe('請選擇寶貝班級')
    })
  })

  describe('toggleCourse', () => {
    it('一般課程: toggle 加入再 toggle 移除', () => {
      const c = ctx.courses.value[0] // 美術
      f.toggleCourse(c)
      expect(f.form.selectedCourses).toContain('美術')
      f.toggleCourse(c)
      expect(f.form.selectedCourses).not.toContain('美術')
    })

    it('候補課程(availability=0): 仍允許加入', () => {
      const c = ctx.courses.value[1] // 舞蹈,availability=0
      f.toggleCourse(c)
      expect(f.form.selectedCourses).toContain('舞蹈')
    })

    it('額滿課程(availability=-1): 拒絕加入', () => {
      const c = ctx.courses.value[2] // 英文,availability=-1
      f.toggleCourse(c)
      expect(f.form.selectedCourses).not.toContain('英文')
    })
  })

  describe('toggleSupply', () => {
    it('toggle 加入再移除', () => {
      const s = ctx.supplies.value[0]
      f.toggleSupply(s)
      expect(f.form.selectedSupplies).toContain('畫具組')
      f.toggleSupply(s)
      expect(f.form.selectedSupplies).not.toContain('畫具組')
    })
  })

  describe('resetForm', () => {
    it('全欄位重置為空', () => {
      f.form.name = '小明'
      f.form.parent_phone = '0912345678'
      f.form.class_name = '大班'
      f.form.email = 'test@example.com'
      f.form.selectedCourses = ['美術']
      f.form.selectedSupplies = ['畫具組']

      f.resetForm()

      expect(f.form.name).toBe('')
      expect(f.form.parent_phone).toBe('')
      expect(f.form.class_name).toBe('')
      expect(f.form.email).toBe('')
      expect(f.form.selectedCourses).toEqual([])
      expect(f.form.selectedSupplies).toEqual([])
    })
  })

  describe('feePreview', () => {
    it('全空時為 null', () => {
      expect(f.feePreview.value).toBe(null)
    })

    it('1 課程: total = 該課程 price', () => {
      f.form.selectedCourses = ['美術']
      expect(f.feePreview.value.total).toBe(1200)
      expect(f.feePreview.value.courseCount).toBe(1)
      expect(f.feePreview.value.supplyCount).toBe(0)
      expect(f.feePreview.value.waitlistCount).toBe(0)
    })

    it('課程 + 用品合計', () => {
      f.form.selectedCourses = ['美術', '英文']
      f.form.selectedSupplies = ['畫具組']
      expect(f.feePreview.value.total).toBe(1200 + 1800 + 300)
      expect(f.feePreview.value.courseCount).toBe(2)
      expect(f.feePreview.value.supplyCount).toBe(1)
    })

    it('候補課程(availability=0)計入 waitlistCount 但仍含 price', () => {
      // 註:候補課程實際不收費,但 feePreview 估算「最大金額」含候補
      f.form.selectedCourses = ['美術', '舞蹈']
      const fp = f.feePreview.value
      expect(fp.courseCount).toBe(2)
      expect(fp.waitlistCount).toBe(1)
      expect(fp.coursesTotal).toBe(1200 + 1500)
    })
  })

  describe('parentPhoneError', () => {
    it('未 touched 時: 不顯示錯誤', () => {
      f.form.parent_phone = '123'
      expect(f.parentPhoneError.value).toBe('')
    })

    it('touched + 空: 不顯示(留給 validateForm)', () => {
      f.phoneTouched.value = true
      f.form.parent_phone = ''
      expect(f.parentPhoneError.value).toBe('')
    })

    it('touched + 非法格式: 顯示提示', () => {
      f.phoneTouched.value = true
      f.form.parent_phone = '1234567890'
      expect(f.parentPhoneError.value).toContain('09')
    })

    it('touched + 合法手機: 不顯示', () => {
      f.phoneTouched.value = true
      f.form.parent_phone = '0912345678'
      expect(f.parentPhoneError.value).toBe('')
    })

    it('errors.parent_phone 直接設置時優先顯示', () => {
      f.errors.parent_phone = 'server 錯誤訊息'
      expect(f.parentPhoneError.value).toBe('server 錯誤訊息')
    })
  })
})
