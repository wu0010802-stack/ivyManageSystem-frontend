import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

import ActivitySessionList from '../components/activity/ActivitySessionList.vue'
import { toSessionView, type BoardSession } from '@/utils/activitySessionBoard'

/**
 * 場次列表的呈現契約（2026-09-14 改版）。
 *
 * 改版前是 el-table：今天沒有標記、沒有上課時間、手機橫向溢出。這裡鎖住三件事：
 * 今天在自己的區塊、狀態文案分得出「還沒點／點一半／點完」、名冊不是 table
 *（table 正是手機被擠出畫面的來源）。
 */
const TODAY = '2026-09-16'

function row(over: Partial<BoardSession> & { id: number }): BoardSession {
  return {
    course_id: 1,
    course_name: '跆拳道',
    session_date: TODAY,
    present_count: 0,
    recorded_count: 0,
    enrolled_count: 16,
    meeting_start_time: '16:10:00',
    meeting_end_time: '17:10:00',
    ...over,
  }
}

function mountList(sessions: BoardSession[], extra: Record<string, unknown> = {}) {
  return mount(ActivitySessionList, {
    props: {
      sessions,
      today: TODAY,
      rangeLabel: '本週 9/14 至 9/20',
      ...extra,
    },
    global: { plugins: [ElementPlus], directives: { loading: () => {} } },
  })
}

async function settle() {
  await flushPromises()
  await new Promise((r) => setTimeout(r, 20))
}

describe('ActivitySessionList 今天優先', () => {
  it('今天的場次放在自己的區塊', async () => {
    const wrapper = mountList([
      row({ id: 1, session_date: '2026-09-14', course_name: '幼兒創意美術', recorded_count: 12, enrolled_count: 12 }),
      row({ id: 2, course_name: '跆拳道' }),
    ])
    await settle()

    const today = wrapper.find('[data-test="today-section"]')
    expect(today.text()).toContain('跆拳道')
    expect(today.text()).not.toContain('幼兒創意美術')
  })

  it('今天沒課時直說，不是留一片空白', async () => {
    const wrapper = mountList([row({ id: 1, session_date: '2026-09-14' })])
    await settle()

    expect(wrapper.find('[data-test="today-section"]').text()).toContain('今天沒有才藝課')
  })

  it('其餘場次依日分組並帶星期', async () => {
    const wrapper = mountList([
      row({ id: 1, session_date: '2026-09-14' }),
      row({ id: 2, session_date: '2026-09-18' }),
    ])
    await settle()

    expect(wrapper.text()).toContain('週一 9/14')
    expect(wrapper.text()).toContain('週五 9/18')
  })

  it('顯示上課時刻（同一天兩門課要分得出來）', async () => {
    const wrapper = mountList([
      row({ id: 1, course_name: '幼兒體適能', meeting_start_time: '16:00:00', meeting_end_time: '17:00:00' }),
      row({ id: 2, course_name: '跆拳道' }),
    ])
    await settle()

    const text = wrapper.find('[data-test="today-section"]').text()
    expect(text).toContain('16:00')
    expect(text).toContain('16:10')
  })
})

describe('ActivitySessionList 狀態與動作', () => {
  it('分得出還沒點、點一半、點完', async () => {
    const wrapper = mountList([
      row({ id: 1, session_date: '2026-09-14', recorded_count: 0 }),
      row({ id: 2, session_date: '2026-09-14', recorded_count: 8, present_count: 7 }),
      row({ id: 3, session_date: '2026-09-14', recorded_count: 16, present_count: 15 }),
      row({ id: 4, session_date: '2026-09-18', recorded_count: 0 }),
    ])
    await settle()

    const text = wrapper.text()
    expect(text).toContain('未點名')
    expect(text).toContain('已點 8／16')
    expect(text).toContain('已完成 16／16')
    expect(text).toContain('尚未開始')
  })

  it('按鈕文字跟著狀態走', async () => {
    const wrapper = mountList([row({ id: 1, recorded_count: 0 })])
    await settle()
    expect(wrapper.find('[data-test="today-section"]').text()).toContain('開始點名')

    const partial = mountList([row({ id: 1, recorded_count: 8 })])
    await settle()
    expect(partial.find('[data-test="today-section"]').text()).toContain('繼續點名')
  })

  it('點下去把整筆場次往上送', async () => {
    const wrapper = mountList([row({ id: 77 })])
    await settle()

    await wrapper.find('[data-test="today-section"] button').trigger('click')

    expect(wrapper.emitted('open-rollcall')?.[0][0]).toMatchObject({ id: 77 })
  })

  it('已完成的場次順帶說明幾人缺席', async () => {
    const wrapper = mountList([
      row({ id: 1, session_date: '2026-09-14', recorded_count: 16, present_count: 14 }),
    ])
    await settle()

    expect(wrapper.text()).toContain('2 缺席')
  })
})

describe('ActivitySessionList 漏點名與篩選', () => {
  const overdue = [
    toSessionView(row({ id: 9, session_date: '2026-09-10', course_name: '幼兒芭蕾舞', recorded_count: 0 }), TODAY),
  ]

  it('漏點名浮出成一條，不用自己往回翻', async () => {
    const wrapper = mountList([row({ id: 1 })], { overdue })
    await settle()

    const strip = wrapper.find('[data-test="overdue-strip"]')
    expect(strip.exists()).toBe(true)
    expect(strip.text()).toContain('1 堂沒點完')
    expect(strip.text()).toContain('幼兒芭蕾舞')
  })

  it('沒有漏點名時不顯示那一條', async () => {
    const wrapper = mountList([row({ id: 1 })])
    await settle()

    expect(wrapper.find('[data-test="overdue-strip"]').exists()).toBe(false)
  })

  it('課程 chip 篩選同時作用在列表與漏點名', async () => {
    const wrapper = mountList(
      [
        row({ id: 1, course_id: 1, course_name: '跆拳道' }),
        row({ id: 2, course_id: 2, course_name: '幼兒體適能' }),
      ],
      { overdue, filterCourseId: 2 },
    )
    await settle()

    // 漏點名那筆是 course_id 1，被篩掉
    expect(wrapper.find('[data-test="overdue-strip"]').exists()).toBe(false)
    const today = wrapper.find('[data-test="today-section"]').text()
    expect(today).toContain('幼兒體適能')
    expect(today).not.toContain('跆拳道')
  })

  it('chip 會把選到的課程往上送', async () => {
    const wrapper = mountList([
      row({ id: 1, course_id: 1, course_name: '跆拳道' }),
      row({ id: 2, course_id: 2, course_name: '幼兒體適能' }),
    ])
    await settle()

    const chips = wrapper.findAll('.board-chips button')
    expect(chips[0].text()).toContain('全部 2 門')
    await chips[1].trigger('click')

    expect(wrapper.emitted('update:filterCourseId')?.[0][0]).toBe(2)
  })

  it('週切換與回到今天往上送', async () => {
    const wrapper = mountList([row({ id: 1 })])
    await settle()

    await wrapper.find('[aria-label="上一週"]').trigger('click')
    await wrapper.find('[data-test="go-today"]').trigger('click')

    expect(wrapper.emitted('shift-week')?.[0][0]).toBe(-1)
    expect(wrapper.emitted('go-today')).toBeTruthy()
  })
})

describe('ActivitySessionList 版面', () => {
  it('不用 el-table 畫名冊（table 正是手機橫向溢出的來源）', async () => {
    const wrapper = mountList([row({ id: 1 }), row({ id: 2, session_date: '2026-09-14' })])
    await settle()

    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="session-row"]').length).toBe(2)
  })

  it('這個範圍沒有場次時給得出下一步', async () => {
    const wrapper = mountList([])
    await settle()

    expect(wrapper.text()).toContain('這個範圍沒有才藝場次')
    expect(wrapper.text()).toContain('才藝管理')
  })

  it('自訂日期範圍收在最後，預設不展開', async () => {
    const wrapper = mountList([row({ id: 1 })])
    await settle()

    const details = wrapper.find('details.board-more')
    expect(details.exists()).toBe(true)
    expect(details.attributes('open')).toBeUndefined()
    expect(details.text()).toContain('更早的場次')
  })
})
