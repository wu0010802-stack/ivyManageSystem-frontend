# 教師端 Portal 大 polish — Phase 6 設計（簡化版）

## 背景

`PortalStudentAttendanceView.vue` 662 行，承載學生點名功能：日 / 月雙 tab、班級切換、日點名表（含快速「全部出席」按鈕）、月統計（總覽卡 + Chart.js Bar + 連續缺席 alerts）、離線佇列（既有 `useOnlineStatus` + `enqueueOp` 機制）。

## 範圍

### 必做

**PortalStudentAttendanceView 拆解**：662 → ~220 行 + 4 子元件 + OfflineQueueBadge 套用。

**子元件**（放 `src/views/portal/components/studentAttendance/`）：

| 元件 | 預估行數 | 職責 |
|---|---|---|
| `StudentAttendanceTabs.vue` | ~60 | 日 / 月 tab 容器（外層 layout + classroom select） |
| `StudentRollcallTable.vue` | ~180 | 日點名表（學生 list + status select + 備註 input + 快速按鈕） |
| `StudentMonthlyStats.vue` | ~220 | 月統計卡 + Chart.js Bar + alerts 列表 |
| `StudentOfflinePanel.vue` | ~80 | 離線提示橫條 + 套 OfflineQueueBadge + 同步按鈕 |

**OfflineQueueBadge 套用**：Phase 1 已建（`src/components/portal/OfflineQueueBadge.vue`），首次套用實戰。從 `pendingCount` ref 注入。

主檔 `PortalStudentAttendanceView` 預估 ~220 行：state（dailyData / monthlyData / classrooms / monthPicker / activeTab）+ offline queue orchestration（enqueueOp / syncQueue 觸發）+ fetchers。

**vitest 覆蓋**：4 子元件各 4-7 條（render / props / emit），預期新增 ~22 條。

### YAGNI 砍掉

- ❌ el-table-v2 虛擬列表（30-50 學生表格 / Bar chart 沒實測卡頓）
- ❌ 離線「需人工確認」重試 UI 大改（既有 enqueue/sync 機制夠用，僅補 OfflineQueueBadge）
- ❌ Tab 切換重複 fetch 修補（先 verify 是否真有問題；無則不改）

### 風險與緩解

| 風險 | 緩解 |
|---|---|
| Chart.js 在子元件內 mount 時 ref/canvas 失效 | StudentMonthlyStats 使用 `Bar` 元件 + `<canvas>` 標準綁定；vitest stub Chart.js |
| OfflineQueueBadge 與既有 `<el-tag>離線模式</el-tag>` 視覺重疊 | StudentOfflinePanel 統一管離線視覺，主檔不再放 tag |
| offline enqueue 寫入後 UI 失敗無 feedback | OfflinePanel 顯示 pendingCount + sync 按鈕；同步失敗 ElMessage.error |

---

## Branch / PR

`feat/teacher-acd-v1-6-student-attendance` from `feat/teacher-acd-v1-5-schedule`（純前端）。

## 驗收

- [ ] PortalStudentAttendanceView 主檔 < 280 行
- [ ] 4 子元件建立 + vitest
- [ ] OfflineQueueBadge 套用（Phase 1 元件首次實戰）
- [ ] 既有 offline queue 機制保留（enqueueOp / syncQueue / useOnlineStatus 不動）
- [ ] 既有 955 vitest 全綠 + 新 ~22 條
- [ ] dev mode 手動驗證：日點名 / 月統計 / 離線提示

## 預估工作量

~6-8 小時。
