// 選單樹 manifest（2026-07-31 manifest 化改造）：管理端「群組 → 頁面 → 檢視/操作碼」
// 的唯一事實來源。側邊欄（AdminSidebar）、路由權限規則（ROUTE_PERMISSION_RULES）、
// 權限編輯器樹（PermissionPicker）皆由本檔經 ./derive.ts 衍生，不再各自手寫。
//
// 維護規則：
// - 新增/移除後台頁面、掛新權限碼：改這裡（見 .claude/skills/admin-page-lifecycle）。
// - 每個權限碼必須「主屬」恰好一處（某頁 views、某頁 actions、或 standalonePermissions
//   豁免表）；多頁共用碼用 sharedViews 借道（OR 語意）。manifestIntegrity.test.ts enforce。
// - 權限碼欄位一律綁 PermissionName literal union：打錯字直接 typecheck error。
// - scope 旗標（own_class/all）**不進 manifest**：scope 是「碼」的屬性，單一來源為
//   src/utils/auth.ts 的 SCOPE_AWARE_CODES + 後端 definition.scope_options
//   （scope-aware-parity.test.ts 守同步），manifest 再放一份是第三份漂移源。
// - portal / public 路由（TEACHER_PORTAL_ROUTES、PUBLIC_ROUTES）走完全不同的判斷
//   路徑，維持在 permissions.ts，不納入本 manifest。
//
// 對 permissions.ts 僅 type-only import（runtime 依賴單向：permissions.ts → navigation，
// 無循環初始化問題）。
import { markRaw } from 'vue'
import type { Component } from 'vue'
import type { PermissionName } from '@/constants/permissions'
import { MODULE_TERMS, PAGE_TERMS } from '@/constants/moduleTerms'
// namespace import + 安全取值，而非 named import：permissions.ts re-export 使本檔進入
// 幾乎所有測試的 import 鏈；既有測試慣以 vi.mock 部分 stub '@element-plus/icons-vue'，
// 對 mock 未列出的 export，named import 在 link 期就會被 vitest mock proxy 丟錯
// （"No X export is defined on the mock"）——以 try/catch 兜底 fallback 空 stub 元件。
// 真實 runtime（完整套件）永遠走 try 分支，行為不變。
// ⚠ 取值必須是「靜態屬性存取」（ElementPlusIcons.Xxx），禁止 ElementPlusIcons[name]
// 動態索引——動態索引會讓 rollup 無法 tree-shake，整包 icons 被拖進 admin 首屏
// （scripts/check-entry-chunks.mjs 預算會爆）。新增選單 icon 時在 SIDEBAR_ICONS
// 補一行靜態引用即可。
import * as ElementPlusIcons from '@element-plus/icons-vue'

function safeIcon(get: () => Component): Component {
  try {
    return markRaw(get() ?? ({} as Component))
  } catch {
    return {} as Component
  }
}

const SIDEBAR_ICONS = {
  Bell: safeIcon(() => ElementPlusIcons.Bell),
  Calendar: safeIcon(() => ElementPlusIcons.Calendar),
  ChatDotRound: safeIcon(() => ElementPlusIcons.ChatDotRound),
  Checked: safeIcon(() => ElementPlusIcons.Checked),
  CircleCheck: safeIcon(() => ElementPlusIcons.CircleCheck),
  Clock: safeIcon(() => ElementPlusIcons.Clock),
  Coin: safeIcon(() => ElementPlusIcons.Coin),
  Collection: safeIcon(() => ElementPlusIcons.Collection),
  CreditCard: safeIcon(() => ElementPlusIcons.CreditCard),
  DataAnalysis: safeIcon(() => ElementPlusIcons.DataAnalysis),
  DataBoard: safeIcon(() => ElementPlusIcons.DataBoard),
  Document: safeIcon(() => ElementPlusIcons.Document),
  EditPen: safeIcon(() => ElementPlusIcons.EditPen),
  Files: safeIcon(() => ElementPlusIcons.Files),
  Finished: safeIcon(() => ElementPlusIcons.Finished),
  Guide: safeIcon(() => ElementPlusIcons.Guide),
  Histogram: safeIcon(() => ElementPlusIcons.Histogram),
  MapLocation: safeIcon(() => ElementPlusIcons.MapLocation),
  Key: safeIcon(() => ElementPlusIcons.Key),
  List: safeIcon(() => ElementPlusIcons.List),
  Memo: safeIcon(() => ElementPlusIcons.Memo),
  Money: safeIcon(() => ElementPlusIcons.Money),
  OfficeBuilding: safeIcon(() => ElementPlusIcons.OfficeBuilding),
  PieChart: safeIcon(() => ElementPlusIcons.PieChart),
  Promotion: safeIcon(() => ElementPlusIcons.Promotion),
  School: safeIcon(() => ElementPlusIcons.School),
  Setting: safeIcon(() => ElementPlusIcons.Setting),
  Star: safeIcon(() => ElementPlusIcons.Star),
  Suitcase: safeIcon(() => ElementPlusIcons.Suitcase),
  Tickets: safeIcon(() => ElementPlusIcons.Tickets),
  Timer: safeIcon(() => ElementPlusIcons.Timer),
  Tools: safeIcon(() => ElementPlusIcons.Tools),
  TrendCharts: safeIcon(() => ElementPlusIcons.TrendCharts),
  Trophy: safeIcon(() => ElementPlusIcons.Trophy),
  User: safeIcon(() => ElementPlusIcons.User),
  Van: safeIcon(() => ElementPlusIcons.Van),
  Wallet: safeIcon(() => ElementPlusIcons.Wallet),
  Watch: safeIcon(() => ElementPlusIcons.Watch),
} satisfies Record<string, Component>

function icon(name: keyof typeof SIDEBAR_ICONS): Component {
  return SIDEBAR_ICONS[name]
}

/** 頁面檢視碼節點：此碼「主屬」此頁，picker 只在這裡渲染它（全 manifest 唯一）。 */
export interface ManifestView {
  code: PermissionName
  /** 多檢視碼頁（如 收支簽收）各碼的顯示名 fallback；後端 definition label 優先。 */
  label?: string
}

/** 操作碼節點（WRITE / 特殊動作碼；主屬此頁，全 manifest 唯一）。 */
export interface ManifestAction {
  code: PermissionName
  label?: string
  /** 此操作依附的檢視碼；頁面該 view 取消時一併移除本碼。省略 = 依附「頁面全部 views」。 */
  requiresView?: PermissionName
}

/** 附屬路由規則（redirect 保留規則、工作台子頁、無選單入口路由等）。 */
export interface ManifestRouteRule {
  path: string
  permission: PermissionName
  prefix?: boolean
}

export interface ManifestPage {
  /** 穩定識別 key（測試、picker DOM data-* 用），全 manifest 唯一。 */
  key: string
  /** 顯示名稱：一律引用 MODULE_TERMS / PAGE_TERMS 或字面（同現行 sidebar）。 */
  title: string
  /** 主路由；null = 純授權節點（picker-only，無路由）。 */
  routePath: string | null
  /** 主路由是否 prefix 匹配（衍生成 rule 的 prefix: true）。 */
  routePrefix?: boolean
  /** 主屬檢視碼（可空：actions-only 節點如「家園溝通」）。 */
  views: readonly ManifestView[]
  /** 借道可見碼：別處 owned 的碼也能開啟本頁（OR）。只進 route/sidebar 衍生，不進 picker。 */
  sharedViews?: readonly PermissionName[]
  /** 主屬操作碼。 */
  actions?: readonly ManifestAction[]
  /** 本頁附屬路由（各自帶 permission，衍生時直接攤平）。 */
  extraRoutes?: readonly ManifestRouteRule[]
  /** 側欄設定；undefined = 不出現在側欄（隱藏頁 / picker-only 節點）。 */
  menu?: {
    icon: Component
    badgeKey?: 'workbench' | 'governance' | 'activityInquiries' | 'activityReview'
    /**
     * 'bottom' = 渲染在所有群組之後（側欄最底），給「日常不進、但需要常駐入口」的
     * 稽核類頁面；省略 = 照既有行為渲染在群組之前。
     */
    placement?: 'bottom'
  }
}

export interface ManifestGroup {
  /** el-sub-menu index = `group-${key}`，沿用現值：leave/students/admin/activity/reports/settings。 */
  key: string
  title: string
  icon: Component
  /** true = 僅出現在 picker（如「教師端功能」群組），sidebar 衍生跳過。 */
  pickerOnly?: boolean
  pages: readonly ManifestPage[]
}

export interface NavigationManifest {
  topLevel: readonly ManifestPage[]
  groups: readonly ManifestGroup[]
  /** 不屬任何頁面、但必須出現在 picker 的孤兒碼（顯式豁免，附理由）。 */
  standalonePermissions: readonly { code: PermissionName; label: string; note: string }[]
}

export const NAVIGATION_MANIFEST = {
  topLevel: [
    {
      key: 'dashboard', title: '儀表板', routePath: '/',
      views: [{ code: 'DASHBOARD' }],
      menu: { icon: icon('DataBoard') },
    },
    {
      // 2026-08-20 整併：高風險事件分頁移至 /governance，工作台收斂成單頁待簽核
      //（分頁殼 WorkbenchLayout 一併移除）。/workbench 本身即實頁。
      key: 'workbench', title: PAGE_TERMS.workbench, routePath: '/workbench',
      views: [{ code: 'APPROVALS', label: '待簽核' }],
      menu: { icon: icon('Finished'), badgeKey: 'workbench' },
      extraRoutes: [
        // 兩條舊路徑已 redirect 至 /workbench；規則保留供 redirect 解析。
        { path: '/approvals', permission: 'APPROVALS' },
        { path: '/workbench/approvals', permission: 'APPROVALS' },
      ],
    },
    {
      // 稽核與資料品質（2026-08-20 整併）：高風險事件（原審核工作台分頁）、操作紀錄、
      // 資料異常待辦（原報表群組兩頁）合為一頁三分頁。
      //
      // 頁面 views 為 OR：只持其中一碼者仍能進 /governance，落點由 router redirect
      // 依權限決定。⚠ 三個子路徑一律 exact 掛各自的碼、**禁用 routePrefix**——
      // prefix 會讓三碼互相外溢（只持 DATA_QUALITY_READ 者深連結進操作紀錄）。
      key: 'governance', title: PAGE_TERMS.governance, routePath: '/governance',
      views: [
        { code: 'HIGH_RISK_READ', label: '高風險事件' },
        { code: 'AUDIT_LOGS', label: '操作紀錄' },
        { code: 'DATA_QUALITY_READ', label: '資料異常待辦' },
      ],
      actions: [{ code: 'DATA_QUALITY_WRITE', label: '資料異常處理' }],
      menu: { icon: icon('Memo'), badgeKey: 'governance', placement: 'bottom' },
      extraRoutes: [
        { path: '/governance/high-risk', permission: 'HIGH_RISK_READ' },
        { path: '/governance/audit-logs', permission: 'AUDIT_LOGS' },
        { path: '/governance/data-quality', permission: 'DATA_QUALITY_READ' },
        // 三條舊路徑已 redirect 至上面三個分頁；規則保留供 redirect 解析。
        { path: '/workbench/high-risk', permission: 'HIGH_RISK_READ' },
        { path: '/audit-logs', permission: 'AUDIT_LOGS' },
        { path: '/data-quality', permission: 'DATA_QUALITY_READ' },
      ],
    },
  ],
  groups: [
    {
      key: 'leave', title: '人事薪資', icon: icon('Suitcase'), pages: [
        {
          key: 'employees', title: '員工管理', routePath: '/employees', routePrefix: true,
          views: [{ code: 'EMPLOYEES_READ' }],
          actions: [{ code: 'EMPLOYEES_WRITE' }],
          menu: { icon: icon('User') },
          // 離職管理（獨立路由渲染 OffboardingView）：對齊後端 api/offboarding.py
          // 讀取端點的 EMPLOYEES_READ 守衛。
          extraRoutes: [{ path: '/admin/offboarding', permission: 'EMPLOYEES_READ' }],
        },
        {
          // prefix: 薪資 IA 拆分（2026-06-12）後涵蓋 /salary/settle|history|simulate|settings 全部子頁
          key: 'salary', title: '薪資管理', routePath: '/salary', routePrefix: true,
          views: [{ code: 'SALARY_READ' }],
          actions: [{ code: 'SALARY_WRITE' }],
          menu: { icon: icon('Money') },
        },
        {
          key: 'appraisalYearEnd', title: '考核與年終', routePath: '/appraisal-year-end', routePrefix: true,
          views: [
            { code: 'APPRAISAL_READ', label: '考核檢視' },
            { code: 'YEAR_END_READ', label: '年終檢視' },
          ],
          // 整合工作區頂層 prefix 承載 5 碼 OR（含 overview）；此 3 碼 owned 於他處
          //（settingsGeneral / salary / 本頁 actions 的 APPRAISAL_FINALIZE）。
          sharedViews: ['SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'],
          actions: [
            { code: 'APPRAISAL_EVENT_WRITE', requiresView: 'APPRAISAL_READ' },
            { code: 'APPRAISAL_REVIEW', requiresView: 'APPRAISAL_READ' },
            { code: 'APPRAISAL_ACCOUNTING', requiresView: 'APPRAISAL_READ' },
            { code: 'APPRAISAL_FINALIZE', requiresView: 'APPRAISAL_READ' },
            { code: 'APPRAISAL_RULE_WRITE', requiresView: 'APPRAISAL_READ' },
            { code: 'YEAR_END_WRITE', requiresView: 'YEAR_END_READ' },
            { code: 'YEAR_END_REVIEW', requiresView: 'YEAR_END_READ' },
            { code: 'YEAR_END_ACCOUNTING', requiresView: 'YEAR_END_READ' },
            { code: 'YEAR_END_FINALIZE', requiresView: 'YEAR_END_READ' },
          ],
          menu: { icon: icon('Trophy') },
          // 逐條對齊原 permissions.ts 手寫規則（SYNC-2 / 2026-07-10 巢狀路由「最長匹配」細分）。
          extraRoutes: [
            { path: '/appraisal', permission: 'SETTINGS_READ', prefix: true },
            { path: '/appraisal', permission: 'APPRAISAL_READ', prefix: true },
            { path: '/appraisal-management', permission: 'SETTINGS_READ' },
            { path: '/appraisal-management', permission: 'SALARY_READ' },
            { path: '/year_end', permission: 'YEAR_END_READ', prefix: true },
            { path: '/year-end/appraisal-payout', permission: 'APPRAISAL_FINALIZE' },
            { path: '/appraisal-year-end/appraisal', permission: 'APPRAISAL_READ', prefix: true },
            { path: '/appraisal-year-end/year-end', permission: 'YEAR_END_READ', prefix: true },
            { path: '/appraisal-year-end/year-end/payout', permission: 'APPRAISAL_FINALIZE' },
            { path: '/appraisal-year-end/rules', permission: 'APPRAISAL_READ', prefix: true },
            { path: '/appraisal-year-end/rules', permission: 'SETTINGS_READ', prefix: true },
            { path: '/appraisal-year-end/rules/scoring', permission: 'APPRAISAL_READ' },
            { path: '/appraisal-year-end/rules/bonus-rates', permission: 'APPRAISAL_READ' },
            { path: '/appraisal-year-end/rules/catalog', permission: 'APPRAISAL_READ' },
            { path: '/appraisal-year-end/rules/enrollment-targets', permission: 'APPRAISAL_READ' },
            { path: '/appraisal-year-end/rules/year-end-rules', permission: 'SETTINGS_READ' },
            { path: '/appraisal-year-end/exceptions', permission: 'APPRAISAL_READ' },
            { path: '/appraisal-year-end/exceptions', permission: 'YEAR_END_READ' },
          ],
        },
        {
          key: 'attendance', title: MODULE_TERMS.attendance, routePath: '/attendance',
          views: [{ code: 'ATTENDANCE_READ' }],
          actions: [{ code: 'ATTENDANCE_WRITE' }],
          menu: { icon: icon('Clock') },
        },
        {
          key: 'leaves', title: '請假管理', routePath: '/leaves',
          views: [{ code: 'LEAVES_READ' }],
          actions: [{ code: 'LEAVES_WRITE' }],
          menu: { icon: icon('Document') },
        },
        {
          key: 'overtime', title: PAGE_TERMS.overtime, routePath: '/overtime',
          views: [
            { code: 'OVERTIME_READ', label: '加班檢視' },
            { code: 'MEETINGS', label: '園務會議' },
          ],
          actions: [{ code: 'OVERTIME_WRITE', requiresView: 'OVERTIME_READ' }],
          menu: { icon: icon('Watch') },
          // /meetings 舊獨立路由規則保留（原手寫陣列既有，redirect/直連解析用）。
          extraRoutes: [{ path: '/meetings', permission: 'MEETINGS' }],
        },
        {
          key: 'schedule', title: MODULE_TERMS.schedule, routePath: '/schedule',
          views: [{ code: 'SCHEDULE' }],
          menu: { icon: icon('Timer') },
        },
      ],
    },

    {
      key: 'students', title: '學生與班級', icon: icon('School'), pages: [
        {
          key: 'classrooms', title: PAGE_TERMS.classrooms, routePath: '/classrooms',
          views: [{ code: 'CLASSROOMS_READ' }],
          actions: [{ code: 'CLASSROOMS_WRITE' }],
          menu: { icon: icon('OfficeBuilding') },
          extraRoutes: [
            // 在籍記錄表已折入班級學生管理頁；舊路徑 redirect 至 /classrooms，規則保留供解析。
            { path: '/student-enrollment', permission: 'CLASSROOMS_READ' },
            // 新學年預編班：對齊後端 api/classroom_year_plans.py 的 CLASSROOMS_READ 守衛。
            { path: '/students/year-plan', permission: 'CLASSROOMS_READ' },
          ],
        },
        {
          key: 'studentsMain', title: PAGE_TERMS.students, routePath: '/students',
          views: [{ code: 'STUDENTS_READ' }],
          actions: [
            { code: 'STUDENTS_WRITE' },
            { code: 'STUDENTS_LIFECYCLE_WRITE' },
            { code: 'GUARDIANS_READ' },
            { code: 'GUARDIANS_WRITE' },
            // PARENT_MESSAGES_WRITE 不掛此頁：教師 Portal 能力，主屬 teacherPortal 群組（已定案）。
          ],
          menu: { icon: icon('User') },
          extraRoutes: [
            { path: '/students/profile', permission: 'STUDENTS_READ', prefix: true },
            { path: '/student-attendance', permission: 'STUDENTS_READ' },
            { path: '/student-leaves', permission: 'STUDENTS_READ' },
            { path: '/student-assessments', permission: 'STUDENTS_READ' },
            { path: '/student-incidents', permission: 'STUDENTS_READ' },
            { path: '/student-academic-affairs', permission: 'STUDENTS_READ' },
          ],
        },
        {
          // 入學文件電子簽署（esign01，2026-08-11）：範本管理 + 發送追蹤，
          // 沿用既有 STUDENTS_READ/WRITE，不新增 Permission（spec D9）。
          // STUDENTS_READ 已由 studentsMain 主屬（views），本頁改用 sharedViews 借道
          // （M3：同一碼只能一處 owned，同 enrollmentStats 模式）。STUDENTS_WRITE 同理
          // 已由 studentsMain 主屬（actions）且無 sharedActions 機制，寫入門檻改在頁面
          // 元件內以 hasPermission('STUDENTS_WRITE') 判斷（見 SignDocumentsView.vue
          // 的 canWrite，控制發送/新增範本等按鈕顯示）。
          key: 'signDocuments', title: '入學文件簽署', routePath: '/students/sign-documents',
          views: [], sharedViews: ['STUDENTS_READ'],
          menu: { icon: icon('EditPen') },
        },
        {
          // 隱藏頁：健康與給藥（路由存在但無選單入口）。
          key: 'studentsHealth', title: '健康與給藥', routePath: '/portfolio/medication-today',
          views: [{ code: 'STUDENTS_HEALTH_READ' }],
          actions: [
            { code: 'STUDENTS_HEALTH_WRITE' },
            { code: 'STUDENTS_MEDICATION_ADMINISTER' },
          ],
        },
        {
          // picker-only：特教需求（無獨立路由）。
          key: 'specialNeeds', title: '特教需求', routePath: null,
          views: [{ code: 'STUDENTS_SPECIAL_NEEDS_READ' }],
          actions: [
            { code: 'STUDENTS_SPECIAL_NEEDS_WRITE' },
            { code: 'STUDENTS_IEP_APPROVE' },
          ],
        },
        {
          // 權限對齊後端 GET /growth-books/batch-status 的 PORTFOLIO_READ 守衛（非 STUDENTS_READ）。
          key: 'growthBooks', title: '成長冊工作台', routePath: '/growth-books',
          views: [{ code: 'PORTFOLIO_READ' }],
          actions: [{ code: 'PORTFOLIO_WRITE' }, { code: 'PORTFOLIO_PUBLISH' }],
          menu: { icon: icon('Collection') },
        },
        {
          key: 'admissions', title: '招生入學', routePath: '/students/admissions',
          views: [{ code: 'RECRUITMENT_READ' }],
          actions: [{ code: 'RECRUITMENT_WRITE' }, { code: 'RECRUITMENT_CONVERT' }],
          menu: { icon: icon('Promotion') },
          // /recruitment 為 redirect 至 /students/admissions；規則保留供 redirect 解析。
          extraRoutes: [{ path: '/recruitment', permission: 'RECRUITMENT_READ' }],
        },
        {
          key: 'dismissalQueue', title: PAGE_TERMS.dismissalQueue, routePath: '/dismissal-queue',
          views: [{ code: 'DISMISSAL_CALLS_READ' }],
          actions: [{ code: 'DISMISSAL_CALLS_WRITE' }],
          menu: { icon: icon('Van') },
        },
        {
          // 未新增 Permission enum 值，沿用既有 GUARDIANS_READ/WRITE（照預編班先例）。
          // 兩碼已由 studentsMain 主屬（M3：每碼恰一處 owned），本頁走 sharedViews
          // 借道可見；實際寫入授權仍由後端 require_staff_permission 強制，元件內
          // hasPermission('GUARDIANS_WRITE') 只控制核銷按鈕顯示。
          key: 'pickupAuthorizations', title: PAGE_TERMS.pickupAuthorizations,
          routePath: '/pickup-authorizations',
          views: [], sharedViews: ['GUARDIANS_READ', 'GUARDIANS_WRITE'],
          menu: { icon: icon('User') },
        },
        {
          // 娃娃車管理（2026-08-13 三頁整合單一入口＋頁內分頁，比照 workbench）：
          // 即時監看／乘車歷史＝BUS_READ（後端 GET /bus/trips/today 與 /bus/trips(/{id})
          // 守衛）、路線管理＝BUS_WRITE（三個寫端點守衛；該分頁「能進入」與「能寫入」
          // 同一碼，沒有唯讀模式）。主路由 /bus 承載兩碼 OR（只持其中一碼也進得來，
          // 落點由 router redirect 依權限決定、分頁可見性由 BusLayout 各自判斷）。
          //
          // **不可 routePrefix**：三個分頁子路由權限不同，prefix 會讓 /bus 的
          // BUS_WRITE 外溢到監看／歷史（或 BUS_READ 外溢到路線管理），故子路由
          // 一律走 extraRoutes 各自 exact。
          //
          // ⚠ 授權路線管理時 BUS_WRITE / BUS_READ / STUDENTS_READ 三碼要一起給：
          // 該分頁進頁後還會打 GET /bus/routes（後端 BUS_READ）與 GET /students
          // （後端 STUDENTS_READ）。route gate 是 OR 語意、寫不出 AND，所以只授
          // BUS_WRITE 的角色進得了頁，但兩支載入全 403（畫面退化成錯誤卡）。
          key: 'bus', title: '娃娃車管理', routePath: '/bus',
          views: [
            { code: 'BUS_READ', label: '娃娃車檢視' },
            { code: 'BUS_WRITE', label: '娃娃車路線管理' },
          ],
          menu: { icon: icon('MapLocation') },
          extraRoutes: [
            { path: '/bus/monitor', permission: 'BUS_READ' },
            { path: '/bus/history', permission: 'BUS_READ' },
            { path: '/bus/routes', permission: 'BUS_WRITE' },
            // 舊路徑 redirect 保留規則（比照 /approvals → /workbench/approvals）。
            { path: '/bus-monitor', permission: 'BUS_READ' },
            { path: '/bus-history', permission: 'BUS_READ' },
            { path: '/bus-routes', permission: 'BUS_WRITE' },
          ],
        },
        {
          key: 'fees', title: '學費管理', routePath: '/fees',
          views: [{ code: 'FEES_READ' }],
          actions: [{ code: 'FEES_WRITE' }],
          menu: { icon: icon('CreditCard') },
        },
        {
          // 統計圖表：資料同源於在籍統計 API，權限借道學生模組 STUDENTS_READ（owned 於 studentsMain）。
          // 依業主指示置於本群組最下方（2026-07-31）。
          key: 'enrollmentStats', title: '統計圖表', routePath: '/enrollment-stats',
          views: [], sharedViews: ['STUDENTS_READ'],
          menu: { icon: icon('PieChart') },
        },
      ],
    },

    {
      key: 'admin', title: '園務行政', icon: icon('Files'), pages: [
        {
          key: 'announcements', title: '公告管理', routePath: '/announcements',
          views: [{ code: 'ANNOUNCEMENTS_READ' }],
          actions: [{ code: 'ANNOUNCEMENTS_WRITE' }],
          menu: { icon: icon('Bell') },
        },
        {
          key: 'calendar', title: PAGE_TERMS.calendar, routePath: '/calendar',
          views: [{ code: 'CALENDAR' }],
          menu: { icon: icon('Calendar') },
        },
        {
          // 活動參加調查表（Task 13，2026-08-10）：SURVEYS_* 兩碼，單頁模組。
          // 2026-08-17 業主指示：自獨立的「活動調查」群組移入本群組（原群組僅此一頁，
          // 隨之移除）；權限碼主屬、路由規則與頁面 title 全不動，僅選單歸屬變更
          // （title 亦為麵包屑來源，見 deriveBreadcrumbParents）。
          // ⚠ 與 brief 草稿的差異（已跑 manifestRouteParity 驗證修正）：/surveys/:id/edit
          // 是動態路由，實際導覽路徑帶真實數字 id（如 /surveys/123/edit），extraRoutes
          // 的 permission rule 只做字面比對——寫 literal ':id' 字串永遠比對不到真實路徑，
          // 規則命中不到即回空集合，manifest 權限判定 default-deny，等同把有權限的人
          // 一起擋下（並非「完全不設防」）。改採 /employees 既有慣例：/surveys 掛
          // routePrefix: true + SURVEYS_READ 涵蓋 list/detail/edit 全部子路由，WRITE 純作
          // actions 級的按鈕/表單顯示控制（實際寫入仍由後端 SURVEYS_WRITE 守衛擋）；
          // 唯一例外是 /surveys/new——純靜態路徑（無參數段），可用 exact extraRoute
          // 精確要求 SURVEYS_WRITE（longest-match 優先於 /surveys prefix 的 READ）。
          key: 'surveyList', title: '調查管理', routePath: '/surveys', routePrefix: true,
          views: [{ code: 'SURVEYS_READ', label: '檢視' }],
          actions: [{ code: 'SURVEYS_WRITE', label: '建立與管理' }],
          menu: { icon: icon('EditPen') },
          extraRoutes: [{ path: '/surveys/new', permission: 'SURVEYS_WRITE' }],
        },
        {
          // 收支簽收：廠商付款／雜項收款任一 READ 即可進整合頁（OR 語意，比照 /overtime）。
          key: 'financeSignoffs', title: '收支簽收', routePath: '/finance-signoffs',
          views: [
            { code: 'VENDOR_PAYMENT_READ', label: '廠商付款檢視' },
            { code: 'MISC_RECEIPT_READ', label: '雜項收款檢視' },
          ],
          actions: [
            { code: 'VENDOR_PAYMENT_WRITE', requiresView: 'VENDOR_PAYMENT_READ' },
            { code: 'MISC_RECEIPT_WRITE', requiresView: 'MISC_RECEIPT_READ' },
          ],
          menu: { icon: icon('Wallet') },
        },
        // 政府報表五頁自「報表」群組移入本群組（業主指示，2026-08-01）；
        // 權限碼主屬與路由不動，僅選單歸屬變更。
        {
          key: 'govMonthly', title: PAGE_TERMS.govMonthly, routePath: '/admin/gov-reports/monthly',
          views: [{ code: 'GOV_REPORTS_VIEW' }],
          menu: { icon: icon('Histogram') },
          // /admin/gov-reports/{monthly,certificates,subsidies,iep} 由此 prefix 規則涵蓋。
          extraRoutes: [{ path: '/admin/gov-reports', permission: 'GOV_REPORTS_VIEW', prefix: true }],
        },
        {
          key: 'govCertificates', title: PAGE_TERMS.govCertificates, routePath: '/admin/gov-reports/certificates',
          views: [], sharedViews: ['GOV_REPORTS_VIEW'],
          menu: { icon: icon('Document') },
        },
        {
          key: 'govSubsidies', title: PAGE_TERMS.govSubsidies, routePath: '/admin/gov-reports/subsidies',
          views: [], sharedViews: ['GOV_REPORTS_VIEW'],
          menu: { icon: icon('Document') },
        },
        {
          key: 'govIep', title: 'IEP 個別化教育計畫', routePath: '/admin/gov-reports/iep',
          views: [], sharedViews: ['GOV_REPORTS_VIEW'],
          menu: { icon: icon('Document') },
        },
        {
          // 勞健保與稅務申報：對齊後端 api/gov_reports.py 的 GOV_REPORTS_EXPORT 守衛。
          key: 'govExport', title: PAGE_TERMS.govExport, routePath: '/gov-reports',
          views: [{ code: 'GOV_REPORTS_EXPORT' }],
          menu: { icon: icon('Files') },
        },
      ],
    },

    {
      key: 'activity', title: MODULE_TERMS.activity, icon: icon('Star'), pages: [
        {
          // picker-only 模組節點：ACTIVITY_* 三碼本來就是模組級粗粒度，picker 以單節點誠實呈現；
          // 各實頁以 sharedViews 借道（下方 9 頁）。
          key: 'activityModule', title: '課後才藝（全模組）', routePath: null,
          views: [{ code: 'ACTIVITY_READ', label: '檢視' }],
          actions: [
            { code: 'ACTIVITY_WRITE', label: '編輯與 POS 收銀' },
            { code: 'ACTIVITY_PAYMENT_APPROVE', label: 'POS 收款簽核與解鎖' },
          ],
        },
        {
          key: 'activityDashboard', title: PAGE_TERMS.activityDashboard, routePath: '/activity/dashboard',
          views: [], sharedViews: ['ACTIVITY_READ'],
          menu: { icon: icon('TrendCharts') },
        },
        {
          key: 'activityRegistrations', title: '報名管理', routePath: '/activity/registrations',
          views: [], sharedViews: ['ACTIVITY_READ'],
          menu: { icon: icon('Tickets'), badgeKey: 'activityReview' },
          // 業主裁決（2026-06-13）：pending 動作頁對齊後端動作端點的 ACTIVITY_WRITE。
          extraRoutes: [{ path: '/activity/registrations/pending', permission: 'ACTIVITY_WRITE' }],
        },
        {
          // 課程與用品已於 2026-07-31 併入本頁前兩個 tab，gate 放寬為 ACTIVITY_READ
          // （否則唯讀角色連原本看得到的課程/用品清單都進不去）；設定與信件模板 tab
          // 由頁內 ACTIVITY_WRITE 自行擋。
          key: 'activitySettings', title: PAGE_TERMS.activitySettings, routePath: '/activity/settings',
          views: [], sharedViews: ['ACTIVITY_READ'],
          menu: { icon: icon('Collection') },
          // catalog/courses/supplies 為併頁後的 redirect 保留路徑，規則保留
          // 避免 redirect 落點前被 default-deny 擋。
          extraRoutes: [
            { path: '/activity/catalog', permission: 'ACTIVITY_READ' },
            { path: '/activity/supplies', permission: 'ACTIVITY_READ' },
            { path: '/activity/courses', permission: 'ACTIVITY_READ' },
          ],
        },
        {
          key: 'activityPos', title: 'POS 收銀', routePath: '/activity/pos',
          views: [], sharedViews: ['ACTIVITY_WRITE'],
          menu: { icon: icon('Coin') },
        },
        {
          key: 'activityPosApproval', title: PAGE_TERMS.activityPosApproval, routePath: '/activity/pos/approval',
          views: [], sharedViews: ['ACTIVITY_PAYMENT_APPROVE'],
          menu: { icon: icon('CircleCheck') },
          // POS 日結解鎖稽核軌跡：對齊後端 api/activity/pos_approval.py 的 ACTIVITY_PAYMENT_APPROVE。
          extraRoutes: [{ path: '/activity/audit/pos-unlock', permission: 'ACTIVITY_PAYMENT_APPROVE' }],
        },
        {
          key: 'activityInquiries', title: '家長提問', routePath: '/activity/inquiries',
          views: [], sharedViews: ['ACTIVITY_READ'],
          menu: { icon: icon('ChatDotRound'), badgeKey: 'activityInquiries' },
        },
        {
          key: 'activityAttendance', title: '點名管理', routePath: '/activity/attendance', routePrefix: true,
          views: [], sharedViews: ['ACTIVITY_READ'],
          menu: { icon: icon('Checked') },
        },
        {
          key: 'activityChanges', title: PAGE_TERMS.activityChanges, routePath: '/activity/changes',
          views: [], sharedViews: ['ACTIVITY_READ'],
          menu: { icon: icon('List') },
        },
      ],
    },

    {
      // 2026-08-20：操作紀錄與資料異常待辦移至 topLevel 的 governance 節點（整合頁）。
      key: 'reports', title: '報表', icon: icon('DataAnalysis'), pages: [
        {
          key: 'reportsMain', title: PAGE_TERMS.reports, routePath: '/reports',
          views: [{ code: 'REPORTS' }],
          menu: { icon: icon('PieChart') },
        },
      ],
    },

    {
      key: 'settings', title: '系統設定', icon: icon('Setting'), pages: [
        {
          key: 'accounts', title: '帳號設定', routePath: '/settings/accounts',
          views: [{ code: 'USER_MANAGEMENT_READ' }],
          actions: [{ code: 'USER_MANAGEMENT_WRITE' }],
          menu: { icon: icon('User') },
        },
        {
          key: 'roles', title: '角色設定', routePath: '/settings/roles',
          views: [{ code: 'ROLES_MANAGE' }],
          menu: { icon: icon('Key') },
        },
        {
          // ⚠ /settings 不可改 routePrefix（子路由權限不同，外溢 = SETTINGS_READ 就能進帳號/角色頁）。
          key: 'settingsGeneral', title: PAGE_TERMS.settingsGeneral, routePath: '/settings',
          views: [{ code: 'SETTINGS_READ' }],
          actions: [{ code: 'SETTINGS_WRITE' }],
          menu: { icon: icon('Tools') },
        },
        {
          // picker-only：教師端預覽與代操作（管理端無獨立頁面）。
          key: 'portalOps', title: '教師端預覽與代操作', routePath: null,
          views: [],
          actions: [
            { code: 'PORTAL_PREVIEW', label: '教師端預覽' },
            { code: 'PORTAL_IMPERSONATE', label: '代為操作' },
          ],
        },
        {
          key: 'dsr', title: '個資請求管理', routePath: null,
          views: [],
          actions: [{ code: 'DSR_MANAGE', label: '個資請求管理' }],
        },
      ],
    },

    {
      // 總部（platform / hq）console。**只有 kind='platform' 租戶的角色會持有 PLATFORM_* 碼**
      //（後端 tests/test_platform_admin_flag.py 的 PLATFORM_ONLY_CODES parity 測試守著——
      //  它直接讀本 repo 的 src/constants/permissions.ts 比對兩份清單），
      // 因此分校 admin 的 canView 對這三碼恆為 false、整個群組自然不出現。AdminSidebar 另有
      // 一道以 isPlatformAdmin() 為準的顯式過濾（CT-P-04(3) 雙向），兩道是刻意的縱深。
      //
      // ⚠ 這三碼 2026-08-04 之前掛在 standalonePermissions 豁免表（4e 交付前無對應頁面），
      // 本批已改為主屬本群組各頁——不要再往豁免表加回去。
      key: 'platform', title: '總部管理', icon: icon('OfficeBuilding'), pages: [
        {
          key: 'platformOverview', title: '總部總覽', routePath: '/platform/overview',
          // 總覽同時吃分校清單與跨校報表，兩碼皆非 owned 於此（借道，OR 語意）。
          views: [],
          sharedViews: ['PLATFORM_REPORTS_VIEW', 'PLATFORM_TENANTS_MANAGE'],
          menu: { icon: icon('DataBoard') },
        },
        {
          // prefix：/platform/tenants/:id 詳情頁與清單同權限（都是 PLATFORM_TENANTS_MANAGE）。
          key: 'platformTenants', title: '分校管理', routePath: '/platform/tenants', routePrefix: true,
          views: [{ code: 'PLATFORM_TENANTS_MANAGE' }],
          menu: { icon: icon('School') },
        },
        {
          key: 'platformReports', title: '跨分校報表', routePath: '/platform/reports',
          views: [{ code: 'PLATFORM_REPORTS_VIEW' }],
          menu: { icon: icon('TrendCharts') },
        },
        {
          key: 'platformRoleSync', title: '角色同步', routePath: '/platform/roles-sync',
          views: [],
          sharedViews: ['PLATFORM_TENANTS_MANAGE'],
          menu: { icon: icon('Key') },
        },
        {
          key: 'platformAudit', title: '跨分校稽核', routePath: '/platform/audit',
          views: [{ code: 'PLATFORM_AUDIT_VIEW' }],
          menu: { icon: icon('List') },
        },
        {
          // 勞健保級距／費率是 GLOBAL 表（無 tenant_id），一改對全平台生效，
          // 後端寫入端已於 SEC-02 降為 require_platform_admin。此處借道
          // PLATFORM_TENANTS_MANAGE（比照角色同步頁），**不新增第四個
          // PLATFORM_* 碼**——會牽動後端 PLATFORM_ONLY_CODES parity 與角色 seed。
          key: 'platformGovData', title: '政府資料同步', routePath: '/platform/gov-data',
          views: [],
          sharedViews: ['PLATFORM_TENANTS_MANAGE'],
          menu: { icon: icon('Coin') },
        },
      ],
    },

    {
      // 純 picker 群組：教師 Portal 端能力（管理端無頁面，但角色授權需要編輯）。
      // portal 專用碼不進 standalonePermissions 豁免表：它們必須可在 picker 授權
      //（教師角色要勾），所以在 manifest 內有 owned 位置。
      key: 'teacherPortal', title: '教師端功能', icon: icon('User'), pickerOnly: true, pages: [
        {
          key: 'classAlbums', title: '班級相簿（教師端）', routePath: null,
          views: [{ code: 'CLASS_ALBUMS_READ' }],
          actions: [{ code: 'CLASS_ALBUMS_WRITE' }],
        },
        {
          // 已定案：PARENT_MESSAGES_WRITE 掛此群組（教師 Portal 家園溝通收發），不掛學生管理頁。
          key: 'parentMessages', title: '家園溝通（教師端）', routePath: null,
          views: [],
          actions: [{ code: 'PARENT_MESSAGES_WRITE', label: '家園溝通發送' }],
        },
      ],
    },
  ],

  standalonePermissions: [
    {
      // label 與後端 permission_definitions 對齊（migration permlbl01）——後端 label
      // 優先，此處只是 definition 落後時的 fallback，文案不一致會讓兩邊看起來像兩個碼。
      code: 'BUSINESS_ANALYTICS', label: '經營分析（功能已移除）',
      note: '2026-06-03 業主裁定移除經營分析功能，權限碼刻意保留為孤兒（CLAUDE.md 記載），picker 仍需可編輯。',
    },
    {
      code: 'BUS_TRIPS_OPERATE', label: '娃娃車隨車操作（教師端）',
      note: '隨車老師 portal 專用（/portal/bus-trip 發車/到站/回報），管理端無對應頁面，故不主屬任何 manifest 頁。刻意**不**與 BUS_READ 綁在同一角色：隨車端只需 GET /portal/bus/routes 的 id/name 精簡清單，給 BUS_READ 等於把全園學生名冊與家庭住址座標一併開給司機。per-user 顯式授權、無 role 預設。',
    },
    // PLATFORM_TENANTS_MANAGE / PLATFORM_REPORTS_VIEW / PLATFORM_AUDIT_VIEW 已於 2026-08-04
    // （4e hq 前端）改主屬「總部管理」群組各頁，不再是 standalone 孤兒。
  ],
} satisfies NavigationManifest
