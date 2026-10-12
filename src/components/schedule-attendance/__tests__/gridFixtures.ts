/** 排班與出勤格子測試共用資料（欄位對齊 schema.d.ts 的 ScheduleAttendanceGridOut）。 */
import type {
  GridCell,
  GridDay,
  GridEmployee,
  GridOut,
  GridShiftType,
} from '@/utils/scheduleAttendanceGrid'

export const W1 = '2026-09-14' // 週一
export const WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']

export const SHIFTS: GridShiftType[] = [
  { shift_type_id: 1, name: '早車', work_start: '07:00', work_end: '16:30', is_active: true },
  { shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00', is_active: true },
  { shift_type_id: 3, name: '舊班別', work_start: '07:30', work_end: '16:00', is_active: false },
]

export function day(date: string, overrides: Partial<GridDay> = {}): GridDay {
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7
  return {
    date,
    weekday,
    is_workday: weekday < 5,
    is_holiday: false,
    holiday_name: null,
    is_makeup_workday: false,
    import_covered: true,
    ...overrides,
  }
}

type Actual = NonNullable<GridCell['actual']>

export interface CellOptions {
  plan?: Partial<GridCell['plan']>
  /** 不給＝null（未來日或無打卡權限）；給 {} 即帶預設的「符合原班表」。 */
  actual?: Partial<Actual>
  edit?: Partial<GridCell['edit']>
  leaves?: GridCell['leaves']
  confirmation?: GridCell['confirmation']
  employed?: boolean
}

export function cell(employeeId: number, date: string, options: CellOptions = {}): GridCell {
  const actual: Actual | null = options.actual
    ? {
        attendance_id: 100 + employeeId,
        punch_in: null,
        punch_out: null,
        status: 'matched',
        reason: '打卡符合原班表及核准請假',
        late_minutes: 0,
        early_leave_minutes: 0,
        candidates: [],
        version: 'a'.repeat(64),
        confirmed_action: null,
        original_shift_type_id: 1,
        ...options.actual,
      }
    : null
  return {
    employee_id: employeeId,
    date,
    employed: options.employed ?? true,
    plan: {
      shift_type_id: 1,
      name: '早車',
      work_start: '07:00',
      work_end: '16:30',
      day_off: false,
      expected: true,
      source: 'weekly',
      rotation: null,
      swap_request_id: null,
      daily_notes: null,
      ...options.plan,
    },
    leaves: options.leaves ?? [],
    actual,
    confirmation: options.confirmation ?? null,
    edit: { plan: true, confirm: false, recorded: false, locked_reason: null, ...options.edit },
  }
}

export function employee(id: number, name: string, overrides: Partial<GridEmployee> = {}): GridEmployee {
  return {
    employee_id: id,
    name,
    employee_number: `E${String(id).padStart(3, '0')}`,
    group_key: 'classroom:1',
    role_label: '班導',
    hire_date: '2026-01-01',
    resign_date: null,
    other_classroom_labels: [],
    ...overrides,
  }
}

export function grid(overrides: Partial<GridOut> = {}): GridOut {
  const employees = overrides.employees ?? [employee(1, '林班導'), employee(2, '王副導', { role_label: '副班導' })]
  const days = overrides.days ?? WEEK.map((date) => day(date))
  const cells =
    overrides.cells ??
    employees.flatMap((e) =>
      days.map((d) =>
        cell(e.employee_id, d.date, { plan: { expected: d.is_workday } }),
      ),
    )
  return {
    start_date: days[0].date,
    end_date: days[days.length - 1].date,
    today: '2026-09-21',
    caller: { can_view_attendance: true, can_edit_plan: true, can_confirm: true, can_edit_attendance: true },
    days,
    groups: [
      { key: 'classroom:1', label: '滿天星', kind: 'classroom', classroom_id: 1 },
      { key: 'other', label: '行政／後勤', kind: 'other', classroom_id: null },
    ],
    employees,
    shift_types: SHIFTS,
    cells,
    ...overrides,
  }
}
