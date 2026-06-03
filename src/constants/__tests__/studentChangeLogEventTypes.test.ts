import { describe, it, expect } from 'vitest'
import {
  STUDENT_CHANGE_LOG_EVENT_TYPES,
  CHANGE_LOG_TAG_TYPE,
} from '../studentChangeLogEventTypes'

// 鏡像後端 models/student_log.py EVENT_TYPES（中文 7 種，順序固定）
const BACKEND_EVENT_TYPES = ['入學', '復學', '退學', '轉出', '轉入', '畢業', '休學']

describe('studentChangeLog event types — 鏡像後端 EVENT_TYPES', () => {
  it('清單與後端一致（含順序、含「休學」）', () => {
    expect([...STUDENT_CHANGE_LOG_EVENT_TYPES]).toEqual(BACKEND_EVENT_TYPES)
  })

  it('tag map 涵蓋全部 7 個 event types', () => {
    for (const t of STUDENT_CHANGE_LOG_EVENT_TYPES) {
      expect(CHANGE_LOG_TAG_TYPE[t], `缺 tag: ${t}`).toBeTruthy()
    }
    expect(Object.keys(CHANGE_LOG_TAG_TYPE).sort()).toEqual([...BACKEND_EVENT_TYPES].sort())
  })
})
