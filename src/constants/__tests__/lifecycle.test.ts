import { describe, it, expect } from 'vitest'
import {
  LIFECYCLE_STATUSES,
  LIFECYCLE_LABELS_ADMIN,
  LIFECYCLE_LABELS_PORTAL,
  LIFECYCLE_LABELS_PARENT,
  LIFECYCLE_TAG_TYPE,
  ALLOWED_TRANSITIONS,
} from '../lifecycle'

describe('lifecycle constants — 涵蓋後端 7 個 canonical 狀態', () => {
  it('三套 label + tag + 狀態機 key 集合都等於 LIFECYCLE_STATUSES', () => {
    const expected = [...LIFECYCLE_STATUSES].sort()
    for (const m of [
      LIFECYCLE_LABELS_ADMIN,
      LIFECYCLE_LABELS_PORTAL,
      LIFECYCLE_LABELS_PARENT,
      LIFECYCLE_TAG_TYPE,
      ALLOWED_TRANSITIONS,
    ]) {
      expect(Object.keys(m).sort()).toEqual(expected)
    }
  })
})

describe('lifecycle label — 受眾差異刻意保留（勿壓平成一套）', () => {
  it('transferred / withdrawn 三套受眾用語不同', () => {
    expect(LIFECYCLE_LABELS_ADMIN.transferred).toBe('轉出')
    expect(LIFECYCLE_LABELS_PORTAL.transferred).toBe('轉學')
    expect(LIFECYCLE_LABELS_PARENT.transferred).toBe('已轉出')
    expect(LIFECYCLE_LABELS_ADMIN.withdrawn).toBe('退學')
    expect(LIFECYCLE_LABELS_PORTAL.withdrawn).toBe('離校')
    expect(LIFECYCLE_LABELS_PARENT.withdrawn).toBe('已退學')
  })
})

describe('ALLOWED_TRANSITIONS — 鏡像後端 services/student_lifecycle.py（後端權威）', () => {
  it('逐狀態合法目標與後端一致', () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      prospect: ['enrolled', 'withdrawn'],
      enrolled: ['active', 'withdrawn'],
      active: ['on_leave', 'transferred', 'withdrawn', 'graduated'],
      on_leave: ['active', 'withdrawn'],
      withdrawn: ['active'],
      transferred: [],
      graduated: [],
    })
  })
})
