import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ElementPlus from 'element-plus'
import StudentRollcallTable from '../StudentRollcallTable.vue'

/**
 * 到園點名三態呈現（2026-09-14 UI/UX 審查 P1）。
 *
 * 改版前：後端回的 `status=null` 被預選成「出席」，27 列全部亮著同一種藍，
 * 「誰還沒點」這個本頁唯一要回答的問題在畫面上不存在。
 *
 * 這裡掛**真的 Element Plus**：舊測試把 el-radio-group／el-radio-button 全 stub 掉，
 * 所以選中態、顏色、aria 狀態一律測不到，改壞了也全綠（同 el-switch 那次教訓）。
 */

const ROSTER = [
  { student_id: 1, student_no: '01', name: '王小明', status: '出席', remark: '' },
  { student_id: 2, student_no: '02', name: '陳語彤', status: '病假', remark: '家長申請#12' },
  { student_id: 3, student_no: '03', name: '林承翰', status: null, remark: '' },
  { student_id: 4, student_no: '04', name: '張詠晴', status: '缺席', remark: '' },
]

function mountTable(props = {}) {
  return mount(StudentRollcallTable, {
    props: { students: ROSTER, pendingCount: 1, ...props },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

describe('未點名是第一級狀態', () => {
  it('未點名的列不得有任何狀態被選中', () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[2]
      const pressed = row.findAll('[aria-pressed="true"]')
      expect(pressed).toHaveLength(0)
    } finally {
      w.unmount()
    }
  })

  it('未點名的列掛 is-unmarked 並顯示「未點」徽章', () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[2]
      expect(row.classes()).toContain('is-unmarked')
      expect(row.text()).toContain('未點')
    } finally {
      w.unmount()
    }
  })

  it('已點名的列不得被誤標成未點名', () => {
    const w = mountTable()
    try {
      const rows = w.findAll('.student-row')
      expect(rows[0].classes()).not.toContain('is-unmarked')
      expect(rows[1].classes()).not.toContain('is-unmarked')
      expect(rows[3].classes()).not.toContain('is-unmarked')
    } finally {
      w.unmount()
    }
  })
})

describe('狀態語意色', () => {
  it('出席列標 is-present、選中的是出席那顆', () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[0]
      expect(row.classes()).toContain('is-present')
      expect(row.find('[aria-pressed="true"]').text()).toBe('出席')
    } finally {
      w.unmount()
    }
  })

  it('缺席列標 is-absent', () => {
    const w = mountTable()
    try {
      expect(w.findAll('.student-row')[3].classes()).toContain('is-absent')
    } finally {
      w.unmount()
    }
  })

  it('請假列標 is-leave，與缺席分開', () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[1]
      expect(row.classes()).toContain('is-leave')
      expect(row.classes()).not.toContain('is-absent')
    } finally {
      w.unmount()
    }
  })
})

describe('缺席會通知家長', () => {
  it('選了缺席的列要講明會即時通知家長', () => {
    const w = mountTable()
    try {
      expect(w.findAll('.student-row')[3].text()).toContain('會即時通知家長')
    } finally {
      w.unmount()
    }
  })

  it('沒選缺席的列不出現這句提示', () => {
    const w = mountTable()
    try {
      expect(w.findAll('.student-row')[0].text()).not.toContain('會即時通知家長')
    } finally {
      w.unmount()
    }
  })
})

describe('批次操作只留出席', () => {
  it('不得有任何「全部缺席」批次按鈕（整班缺席是停課，不是點名）', () => {
    const w = mountTable()
    try {
      const batch = w.findAll('.rollcall-actions button').map((b) => b.text())
      expect(batch.some((t) => t.includes('缺席'))).toBe(false)
    } finally {
      w.unmount()
    }
  })

  it('「未點名者全部出席」帶出人數並 emit 出席', async () => {
    const w = mountTable()
    try {
      const btn = w.findAll('.rollcall-actions button').find((b) => b.text().includes('全部出席'))
      expect(btn!.text()).toContain('1')
      await btn!.trigger('click')
      expect(w.emitted('quick-set-all')![0]).toEqual(['出席'])
    } finally {
      w.unmount()
    }
  })

  it('沒有未點名者時該按鈕停用', () => {
    const w = mountTable({ pendingCount: 0 })
    try {
      const btn = w.findAll('.rollcall-actions button').find((b) => b.text().includes('全部出席'))
      expect(btn!.attributes('disabled')).toBeDefined()
    } finally {
      w.unmount()
    }
  })
})

describe('家長請假帶進來的列', () => {
  it('顯示「家長請假」而非機器字串', () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[1]
      expect(row.text()).toContain('家長請假')
      expect(row.text()).not.toContain('家長申請#12')
    } finally {
      w.unmount()
    }
  })
})

describe('無障礙', () => {
  it('每列的狀態按鈕群組帶學生姓名，讀屏才知道在點誰', () => {
    const w = mountTable()
    try {
      const group = w.findAll('.student-row')[0].find('[role="group"]')
      expect(group.attributes('aria-label')).toContain('王小明')
    } finally {
      w.unmount()
    }
  })
})

describe('點選狀態', () => {
  it('點未點名列的出席會 emit update-status', async () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[2]
      const present = row.findAll('button').find((b) => b.text() === '出席')
      await present!.trigger('click')
      expect(w.emitted('update-status')![0][0]).toEqual({
        student_id: 3,
        status: '出席',
        remark: '',
      })
    } finally {
      w.unmount()
    }
  })

  it('重複點已選中的狀態仍 emit，讓父頁確認這列已被看過', async () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[0]
      const present = row.findAll('button').find((b) => b.text() === '出席')
      await present!.trigger('click')
      expect(w.emitted('update-status')![0][0]).toEqual({
        student_id: 1,
        status: '出席',
        remark: '',
      })
    } finally {
      w.unmount()
    }
  })
})
