# 教師端 Portal 大 polish — Phase 7 設計（簡化版）

## 背景

`PortalActivityView.vue` 468 行，承載教師端才藝活動：報名 tab（summary + classroom sub-tabs + registration table）、點名 tab（sessions 列表 + 篩選 + 抽屜）。既有 `useActivityAttendanceDrawer` composable 保留。

## 範圍

**拆 3 子元件**（放 `src/views/portal/components/activity/`）：

| 元件 | 預估行數 | 職責 |
|---|---|---|
| `ActivityRegistrationPanel.vue` | ~150 | 報名 tab 內容（summary + classroom sub-tabs + registration table） |
| `ActivitySessionList.vue` | ~100 | 點名 tab 內容（course filter + sessions 列表） |
| `ActivityRollcallDrawer.vue` | ~150 | 點名抽屜（包裝 useActivityAttendanceDrawer） |

主檔 PortalActivityView 預估 ~150 行（state + main-tab 切換 + orchestration）。

**vitest 覆蓋**：3 子元件各 4-6 條，預期新增 ~15 條。

**YAGNI 砍掉**：
- ❌ 虛擬列表（30-50 報名項目沒實測卡頓）
- ❌ 多班篩選擴充（既有 classroom sub-tabs 已是多班過濾）

## Branch

`feat/teacher-acd-v1-7-activity` from `feat/teacher-acd-v1-6-student-attendance`（純前端）。

## 驗收

- [ ] 主檔 < 200 行
- [ ] 3 子元件 + vitest
- [ ] useActivityAttendanceDrawer composable 保留不動
- [ ] 全 vitest ~999 綠
