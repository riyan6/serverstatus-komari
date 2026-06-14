<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Check, ChevronDown, Monitor, Moon, Settings, Sun } from 'lucide-vue-next'
import { useNodes } from '@/composables/useNodes'
import { useThemeMode, type ThemeMode } from '@/composables/useThemeMode'
import type { NodeWithStatus } from '@/types/node'
import {
  cleanNodeName,
  daysRemaining,
  formatBytes,
  formatOsName,
  formatPercent,
  formatSpeed,
  formatUptime,
  getFlagUrl,
  normalizeRegionCode,
} from '@/lib/utils'

type PingTask = {
  id: number
  name: string
  interval: number
  loss: number
  type?: string
  protocol?: string
}

type PingRecord = {
  task_id: number
  time: string
  value: number
}

type PingCacheItem = {
  tasks: PingTask[]
  records: PingRecord[]
}

type DetailItem = {
  label: string
  value: string
}

type ServerGroupState = 'loading' | 'empty' | 'ready'

type ServerGroup = {
  key: string
  name: string
  rows: NodeWithStatus[]
  online: number
  state: ServerGroupState
}

type PingTooltip = {
  left: number
  svgX: number
  flip: boolean
  timeLabel: string
  items: Array<{
    color: string
    name: string
    value: number
    y: number
  }>
}

// 中文说明：页面当前只消费首屏数据快照，后续 WebSocket 仍连接但不驱动表格重新渲染。
const { nodesWithStatus, initializeData, disposeRealtime } = useNodes()
const { themeMode, setThemeMode } = useThemeMode()
const serverRows = ref<NodeWithStatus[]>([])
const hasLoaded = ref(false)
const expandedUuid = ref<string | null>(null)
const themeMenuOpen = ref(false)
const pingTasks = ref<PingTask[]>([])
const pingRecords = ref<PingRecord[]>([])
const pingLoading = ref(false)
const pingError = ref(false)
const pingCache = ref<Record<string, PingCacheItem>>({})
const pingVisibility = ref<Record<number, boolean>>({})
const pingTooltip = ref<PingTooltip | null>(null)
let pingRequestToken = 0

const CHART_W = 1200
const CHART_H = 280
const CHART_PAD_L = 44
const CHART_PAD_R = 16
const CHART_PAD_T = 16
const CHART_PAD_B = 34
const CHART_INNER_W = CHART_W - CHART_PAD_L - CHART_PAD_R
const CHART_INNER_H = CHART_H - CHART_PAD_T - CHART_PAD_B
const PING_COLORS = ['#5c75d6', '#58a66d', '#f3c343', '#e3655b', '#7dbde0', '#98c95f', '#ef8244', '#8a6fd1']

// 中文说明：工具栏只提供三种明确模式，auto 会跟随系统深浅色偏好。
const themeOptions: Array<{ label: string; value: ThemeMode }> = [
  { label: '自动', value: 'auto' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

function cloneNodeRows(rows: NodeWithStatus[]): NodeWithStatus[] {
  // 中文说明：复制节点与状态对象，切断后续 WebSocket 状态替换对当前首版布局的影响。
  return rows.map(item => ({
    node: { ...item.node },
    status: item.status ? { ...item.status } : null,
    online: item.online,
  }))
}

const toolbarStats = computed(() => {
  // 中文说明：首页顶部摘要基于当前首屏快照计算，和表格展示保持同一份数据口径。
  const online = serverRows.value.filter(row => row.online).length
  const traffic = serverRows.value.reduce(
    (total, row) => {
      total.up += row.status?.net_total_up ?? 0
      total.down += row.status?.net_total_down ?? 0
      return total
    },
    { up: 0, down: 0 },
  )

  return {
    total: serverRows.value.length,
    online,
    upload: formatBytes(traffic.up, 1),
    download: formatBytes(traffic.down, 1),
  }
})

function resolveGroupName(row: NodeWithStatus): string {
  // 中文说明：后端可能返回空分组，界面统一归到默认分组，避免出现空标题 Card。
  return row.node.group.trim() || '默认分组'
}

const groupedServerRows = computed<ServerGroup[]>(() => {
  const groupMap = new Map<string, ServerGroup>()

  for (const row of serverRows.value) {
    const name = resolveGroupName(row)
    const key = `group:${name}`
    const group = groupMap.get(key)

    if (group) {
      group.rows.push(row)
      if (row.online) group.online += 1
      continue
    }

    groupMap.set(key, {
      key,
      name,
      rows: [row],
      online: row.online ? 1 : 0,
      state: 'ready',
    })
  }

  return Array.from(groupMap.values())
})

const displayServerGroups = computed<ServerGroup[]>(() => {
  if (!hasLoaded.value) {
    return [{
      key: 'state:loading',
      name: '服务器',
      rows: [],
      online: 0,
      state: 'loading',
    }]
  }

  if (serverRows.value.length === 0) {
    return [{
      key: 'state:empty',
      name: '服务器',
      rows: [],
      online: 0,
      state: 'empty',
    }]
  }

  return groupedServerRows.value
})

const currentThemeLabel = computed(() => {
  return themeOptions.find(option => option.value === themeMode.value)?.label ?? '自动'
})

function selectThemeMode(mode: ThemeMode) {
  // 中文说明：菜单选中后立即收起，避免浮层遮挡后续表格操作。
  setThemeMode(mode)
  themeMenuOpen.value = false
}

function statusLabel(row: NodeWithStatus): string {
  return row.online ? '在线' : '离线'
}

function priceText(row: NodeWithStatus): string {
  // 中文说明：Komari 中 price 为负数或 0 时按免费展示，避免出现没有意义的账单金额。
  if (row.node.price <= 0) return 'FREE'

  const cycle = row.node.billing_cycle > 0 ? row.node.billing_cycle : 30
  const unit = cycle >= 365 ? '年' : cycle >= 90 ? '季' : '月'
  return `${row.node.currency || 'USD'} ${row.node.price}/${unit}`
}

function regionText(row: NodeWithStatus): string {
  const code = normalizeRegionCode(row.node.region)
  return code || row.node.region || '-'
}

function uptimeText(row: NodeWithStatus): string {
  if (!row.status?.online) return '-'
  return formatUptime(row.status.uptime ?? 0)
}

function loadText(row: NodeWithStatus): string {
  if (!row.status?.online) return '-'
  return row.status.load.toFixed(2)
}

function netSpeedText(row: NodeWithStatus): string {
  if (!row.status?.online) return '-'
  return `${formatSpeed(row.status.net_out)} | ${formatSpeed(row.status.net_in)}`
}

function trafficText(row: NodeWithStatus): string {
  if (!row.status) return '-'
  return `${formatBytes(row.status.net_total_up, 1)} | ${formatBytes(row.status.net_total_down, 1)}`
}

function cpuPercent(row: NodeWithStatus): number {
  return row.status?.online ? row.status.cpu : 0
}

function memoryPercent(row: NodeWithStatus): number {
  return row.status ? formatPercent(row.status.ram, row.status.ram_total || row.node.mem_total) : 0
}

function diskPercent(row: NodeWithStatus): number {
  return row.status ? formatPercent(row.status.disk, row.status.disk_total || row.node.disk_total) : 0
}

function remainText(row: NodeWithStatus): string {
  const remaining = daysRemaining(row.node.expired_at)
  if (remaining == null) return '∞'
  if (remaining < 0) return '已过期'
  return `${remaining} 天`
}

function remainingPercent(row: NodeWithStatus): number {
  const remaining = daysRemaining(row.node.expired_at)
  if (remaining == null) return 100
  if (remaining <= 0) return 100
  return Math.min((remaining / 365) * 100, 100)
}

function remainingClass(row: NodeWithStatus): string {
  const remaining = daysRemaining(row.node.expired_at)
  if (remaining == null) return 'is-normal'
  if (remaining <= 30) return 'is-danger'
  if (remaining <= 90) return 'is-warning'
  return 'is-normal'
}

function resourceClass(value: number): string {
  if (value >= 90) return 'is-danger'
  if (value >= 70) return 'is-warning'
  return 'is-normal'
}

function progressStyle(value: number) {
  // 中文说明：进度宽度限制在 0-100%，避免异常接口值撑破表格。
  const width = Math.min(Math.max(value, 0), 100)
  return { width: `${width}%` }
}

function ensurePingVisibility(tasks: PingTask[]) {
  const nextVisibility = { ...pingVisibility.value }
  for (const task of tasks) {
    if (nextVisibility[task.id] === undefined) {
      nextVisibility[task.id] = true
    }
  }
  pingVisibility.value = nextVisibility
}

function isPingTaskVisible(taskId: number): boolean {
  return pingVisibility.value[taskId] !== false
}

function togglePingTask(taskId: number) {
  pingVisibility.value = {
    ...pingVisibility.value,
    [taskId]: !isPingTaskVisible(taskId),
  }
  pingTooltip.value = null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function bootTimeText(row: NodeWithStatus): string {
  if (!row.status?.uptime) return '-'
  const baseTime = row.status.time ? new Date(row.status.time).getTime() : Date.now()
  return formatDateTime(new Date(baseTime - row.status.uptime * 1000).toISOString())
}

function detailItems(row: NodeWithStatus): DetailItem[] {
  const status = row.status
  const node = row.node
  const diskTotal = status?.disk_total || node.disk_total
  const ramTotal = status?.ram_total || node.mem_total
  const swapTotal = status?.swap_total || node.swap_total

  return [
    { label: '系统', value: `${node.os || '-'}${node.arch ? ` [${node.arch}]` : ''}` },
    { label: 'CPU', value: `${node.cpu_name || '-'} ${node.cpu_cores} Core (${cpuPercent(row).toFixed(2)}%)` },
    { label: '硬盘', value: `${formatBytes(status?.disk ?? 0, 2)} / ${formatBytes(diskTotal, 2)} (${diskPercent(row).toFixed(2)}%)` },
    { label: '内存', value: `${formatBytes(status?.ram ?? 0, 2)} / ${formatBytes(ramTotal, 2)} (${memoryPercent(row).toFixed(2)}%)` },
    { label: '交换', value: swapTotal > 0 ? `${formatBytes(status?.swap ?? 0, 2)} / ${formatBytes(swapTotal, 2)}` : 'OFF' },
    { label: '流量', value: `IN ${formatBytes(status?.net_total_down ?? 0, 2)} / OUT ${formatBytes(status?.net_total_up ?? 0, 2)}` },
    { label: '负载', value: status ? `${status.load.toFixed(2)} / ${status.load5.toFixed(2)} / ${status.load15.toFixed(2)}` : '-' },
    { label: '进程数', value: String(status?.process ?? '-') },
    { label: '连接数', value: `TCP ${status?.connections ?? 0} / UDP ${status?.connections_udp ?? 0}` },
    { label: '启动', value: bootTimeText(row) },
    { label: '活动', value: formatDateTime(status?.time) },
    { label: '在线', value: uptimeText(row) },
    { label: '虚拟化', value: node.virtualization ? node.virtualization.toUpperCase() : '-' },
  ]
}

async function loadPingData(uuid: string) {
  const cached = pingCache.value[uuid]
  if (cached) {
    pingTasks.value = cached.tasks
    pingRecords.value = cached.records
    ensurePingVisibility(cached.tasks)
    pingError.value = false
    pingTooltip.value = null
    return
  }

  const token = ++pingRequestToken
  pingLoading.value = true
  pingError.value = false

  try {
    const response = await fetch(`/api/records/ping?uuid=${uuid}&hours=24`, { credentials: 'include' })
    if (!response.ok) throw new Error(`Ping records request failed: ${response.status}`)
    const result = await response.json()
    const nextData: PingCacheItem = {
      tasks: result.data?.tasks ?? [],
      records: result.data?.records ?? [],
    }

    // 中文说明：快速切换节点时只接受最后一次请求结果，避免旧响应覆盖当前展开项。
    if (token !== pingRequestToken) return

    pingCache.value = {
      ...pingCache.value,
      [uuid]: nextData,
    }
    pingTasks.value = nextData.tasks
    pingRecords.value = nextData.records
    ensurePingVisibility(nextData.tasks)
    pingTooltip.value = null
  } catch (error) {
    if (token !== pingRequestToken) return
    console.warn('Failed to load ping records:', error)
    pingTasks.value = []
    pingRecords.value = []
    pingError.value = true
  } finally {
    if (token === pingRequestToken) {
      pingLoading.value = false
    }
  }
}

function toggleRow(row: NodeWithStatus) {
  const uuid = row.node.uuid
  if (expandedUuid.value === uuid) {
    expandedUuid.value = null
    return
  }

  expandedUuid.value = uuid
  void loadPingData(uuid)
}

function niceTickStep(maxValue: number): number {
  // 中文说明：根据最大延迟动态选择刻度步长，避免纵向网格过稀导致图表显得臃肿。
  const rawStep = Math.max(maxValue / 8, 1)
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / power

  if (normalized <= 1) return power
  if (normalized <= 2) return 2 * power
  if (normalized <= 5) return 5 * power
  return 10 * power
}

function formatChartTime(value: number): string {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

const pingChart = computed(() => {
  const validRecords = pingRecords.value
    .filter(record => record.value > 0)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  const timestamps = validRecords.map(record => new Date(record.time).getTime())
  const tMin = timestamps.length ? Math.min(...timestamps) : 0
  const tMax = timestamps.length ? Math.max(...timestamps) : 1
  const tRange = tMax - tMin || 1
  const maxValue = validRecords.length ? Math.max(...validRecords.map(record => record.value)) : 100
  const tickStep = niceTickStep(maxValue * 1.08)
  const yMax = Math.max(tickStep, Math.ceil((maxValue * 1.08) / tickStep) * tickStep)

  const series = pingTasks.value.map((task, index) => {
    const records = validRecords.filter(record => record.task_id === task.id)
    const points = records.map(record => {
      const timestamp = new Date(record.time).getTime()
      const x = CHART_PAD_L + ((timestamp - tMin) / tRange) * CHART_INNER_W
      const y = CHART_PAD_T + CHART_INNER_H - (record.value / yMax) * CHART_INNER_H
      return { x, y, record }
    })

    return {
      task,
      color: PING_COLORS[index % PING_COLORS.length],
      visible: isPingTaskVisible(task.id),
      avg: average(records.map(record => record.value)),
      points,
      pointList: points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
    }
  })

  const yLabels = Array.from(
    { length: Math.floor(yMax / tickStep) + 1 },
    (_, index) => {
      const value = index * tickStep
      return {
        label: String(Math.round(value)),
        y: CHART_PAD_T + CHART_INNER_H - (value / yMax) * CHART_INNER_H,
        topPercent: ((CHART_PAD_T + CHART_INNER_H - (value / yMax) * CHART_INNER_H) / CHART_H) * 100,
      }
    },
  )

  const xLabels = Array.from({ length: 7 }, (_, index) => {
    const ratio = index / 6
    const timestamp = tMin + tRange * ratio
    return {
      label: formatChartTime(timestamp),
      x: CHART_PAD_L + ratio * CHART_INNER_W,
      leftPercent: ((CHART_PAD_L + ratio * CHART_INNER_W) / CHART_W) * 100,
      anchor: index === 0 ? 'start' : index === 6 ? 'end' : 'middle',
    }
  })

  return {
    hasData: validRecords.length > 0,
    hasVisibleSeries: series.some(item => item.visible && item.pointList),
    series,
    yLabels,
    xLabels,
    tMin,
    tRange,
  }
})

function onPingChartMouseMove(event: MouseEvent) {
  const svg = event.currentTarget as SVGSVGElement | null
  if (!svg || !pingChart.value.hasData) {
    pingTooltip.value = null
    return
  }

  const rect = svg.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const svgX = (localX / rect.width) * CHART_W

  if (svgX < CHART_PAD_L || svgX > CHART_W - CHART_PAD_R) {
    pingTooltip.value = null
    return
  }

  const ratio = (svgX - CHART_PAD_L) / CHART_INNER_W
  const targetTime = pingChart.value.tMin + pingChart.value.tRange * ratio
  const visibleSeries = pingChart.value.series.filter(series => series.visible && series.points.length > 0)

  if (!visibleSeries.length) {
    pingTooltip.value = null
    return
  }

  const items = visibleSeries.map(series => {
    let nearestPoint = series.points[0]
    let nearestDistance = Math.abs(new Date(nearestPoint.record.time).getTime() - targetTime)

    for (const point of series.points) {
      const distance = Math.abs(new Date(point.record.time).getTime() - targetTime)
      if (distance < nearestDistance) {
        nearestPoint = point
        nearestDistance = distance
      }
    }

    return {
      color: series.color,
      name: series.task.name,
      value: nearestPoint.record.value,
      y: nearestPoint.y,
      time: nearestPoint.record.time,
    }
  })

  const tooltipTime = new Date(items[0].time).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  pingTooltip.value = {
    left: localX,
    svgX,
    flip: localX > rect.width * 0.72,
    timeLabel: tooltipTime,
    items: items.map(item => ({
      color: item.color,
      name: item.name,
      value: item.value,
      y: item.y,
    })),
  }
}

function onPingChartMouseLeave() {
  pingTooltip.value = null
}

onMounted(async () => {
  // 中文说明：沿用现有真实接口初始化流程，接口失败时 useNodes 内部会降级到 mock 数据。
  await initializeData()
  serverRows.value = cloneNodeRows(nodesWithStatus.value)
  hasLoaded.value = true
})

onUnmounted(() => {
  // 中文说明：页面卸载时清理 WebSocket、心跳和轮询定时器，避免开发热更新后重复连接。
  disposeRealtime()
})
</script>

<template>
  <!-- 中文说明：背景视觉已经确认，后续页面布局都放在内容层上方。 -->
  <main class="koumei-home min-h-screen text-[#1f2a1f]" @click="themeMenuOpen = false">
    <section class="relative z-10 mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-6">
      <!-- 中文说明：Card 外部胶囊工具栏独立承载摘要和高频操作，避免和表格容器绑定在一起。 -->
      <div class="server-toolbar" aria-label="首页工具栏">
        <div class="capsule-toolbar capsule-toolbar--stats" aria-label="节点与流量摘要">
          <div class="toolbar-stat">
            <span>节点</span>
            <strong>{{ toolbarStats.total }}</strong>
          </div>
          <div class="toolbar-stat">
            <span>在线</span>
            <strong>{{ toolbarStats.online }}</strong>
          </div>
          <div class="toolbar-stat">
            <span>上传</span>
            <strong>{{ toolbarStats.upload }}</strong>
          </div>
          <div class="toolbar-stat">
            <span>下载</span>
            <strong>{{ toolbarStats.download }}</strong>
          </div>
        </div>

        <div class="capsule-toolbar capsule-toolbar--actions" aria-label="显示与管理操作" @click.stop>
          <div class="theme-menu">
            <button
              type="button"
              class="glass-action glass-action--theme"
              :aria-expanded="themeMenuOpen"
              aria-haspopup="menu"
              aria-label="切换显示模式"
              @click="themeMenuOpen = !themeMenuOpen"
            >
              <Monitor v-if="themeMode === 'auto'" class="glass-action__icon" aria-hidden="true" />
              <Sun v-else-if="themeMode === 'light'" class="glass-action__icon" aria-hidden="true" />
              <Moon v-else class="glass-action__icon" aria-hidden="true" />
              <span>外观</span>
              <small>{{ currentThemeLabel }}</small>
              <ChevronDown class="theme-trigger__chevron" aria-hidden="true" />
            </button>

            <Transition name="theme-menu-float">
              <div
                v-if="themeMenuOpen"
                class="theme-menu__popover"
                role="menu"
                aria-label="显示模式"
              >
                <button
                  v-for="option in themeOptions"
                  :key="option.value"
                  type="button"
                  class="theme-menu__option"
                  :class="{ 'theme-menu__option--active': themeMode === option.value }"
                  role="menuitemradio"
                  :aria-checked="themeMode === option.value"
                  @click="selectThemeMode(option.value)"
                >
                  <Monitor v-if="option.value === 'auto'" aria-hidden="true" />
                  <Sun v-else-if="option.value === 'light'" aria-hidden="true" />
                  <Moon v-else aria-hidden="true" />
                  <span>{{ option.label }}</span>
                  <Check v-if="themeMode === option.value" class="theme-menu__check" aria-hidden="true" />
                </button>
              </div>
            </Transition>
          </div>

          <a class="glass-action glass-action--icon admin-link" href="/admin" aria-label="后台管理" title="后台管理">
            <Settings aria-hidden="true" />
          </a>
        </div>
      </div>

      <!-- 中文说明：服务器按 Komari 分组拆成多个独立 Card，同组节点共享一个高密度网格。 -->
      <div
        v-for="group in displayServerGroups"
        :key="group.key"
        class="server-card"
      >
        <div class="server-card__header">
          <div>
            <p>{{ group.state === 'ready' ? '分组' : '状态' }}</p>
            <h2>{{ group.name }}</h2>
          </div>
          <span class="server-card__meta">
            <template v-if="group.state === 'ready'">
              {{ group.online }}/{{ group.rows.length }} 在线
            </template>
            <template v-else-if="group.state === 'loading'">
              加载中
            </template>
            <template v-else>
              无节点
            </template>
          </span>
        </div>

        <div class="server-grid" role="table" :aria-label="`${group.name}服务器列表`">
          <div class="server-grid__head" role="row">
            <div role="columnheader">状态</div>
            <div role="columnheader">名称</div>
            <div role="columnheader">系统</div>
            <div role="columnheader">位置</div>
            <div role="columnheader">价格</div>
            <div role="columnheader">在线</div>
            <div role="columnheader">负载</div>
            <div role="columnheader">网速 ↑|↓</div>
            <div role="columnheader">流量 ↑|↓</div>
            <div role="columnheader">核心</div>
            <div role="columnheader">内存</div>
            <div role="columnheader">硬盘</div>
            <div role="columnheader">剩余</div>
          </div>

          <div v-if="group.state === 'loading'" class="server-grid__empty">
            正在获取服务器数据...
          </div>

          <div v-else-if="group.state === 'empty'" class="server-grid__empty">
            暂无可显示的服务器
          </div>

          <template v-else>
            <template
              v-for="row in group.rows"
              :key="row.node.uuid"
            >
              <div
                class="server-grid__row"
                :class="{ 'server-grid__row--active': expandedUuid === row.node.uuid }"
                role="row"
                @click="toggleRow(row)"
              >
                <div class="server-grid__status" role="cell">
                  <span
                    class="status-dot"
                    :class="row.online ? 'status-dot--online' : 'status-dot--offline'"
                    :aria-label="statusLabel(row)"
                  />
                </div>

                <div class="server-grid__name server-grid__center" role="cell" :title="row.node.name">
                  {{ cleanNodeName(row.node.name) }}
                </div>

                <div role="cell">
                  {{ formatOsName(row.node.os) }}
                </div>

                <div class="server-grid__region" role="cell">
                  <img
                    v-if="getFlagUrl(row.node.region)"
                    :src="getFlagUrl(row.node.region)"
                    :alt="regionText(row)"
                  >
                  <span>{{ regionText(row) }}</span>
                </div>

                <div role="cell">{{ priceText(row) }}</div>
                <div role="cell">{{ uptimeText(row) }}</div>
                <div role="cell">{{ loadText(row) }}</div>
                <div class="server-grid__center" role="cell">{{ netSpeedText(row) }}</div>
                <div class="server-grid__center" role="cell">{{ trafficText(row) }}</div>

                <div role="cell">
                  <div class="resource-bar" :class="resourceClass(cpuPercent(row))">
                    <span :style="progressStyle(cpuPercent(row))" />
                    <strong>{{ cpuPercent(row).toFixed(0) }}%</strong>
                  </div>
                </div>

                <div role="cell">
                  <div class="resource-bar" :class="resourceClass(memoryPercent(row))">
                    <span :style="progressStyle(memoryPercent(row))" />
                    <strong>{{ memoryPercent(row).toFixed(0) }}%</strong>
                  </div>
                </div>

                <div role="cell">
                  <div class="resource-bar" :class="resourceClass(diskPercent(row))">
                    <span :style="progressStyle(diskPercent(row))" />
                    <strong>{{ diskPercent(row).toFixed(0) }}%</strong>
                  </div>
                </div>

                <div role="cell">
                  <div class="resource-bar" :class="remainingClass(row)">
                    <span :style="progressStyle(remainingPercent(row))" />
                    <strong>{{ remainText(row) }}</strong>
                  </div>
                </div>
              </div>

              <div
                v-if="expandedUuid === row.node.uuid"
                class="server-detail"
              >
                <div class="server-detail__info">
                  <p
                    v-for="item in detailItems(row)"
                    :key="item.label"
                  >
                    <span>{{ item.label }}:</span>
                    {{ item.value }}
                  </p>
                </div>

                <div class="server-detail__chart">
                  <div
                    v-if="pingLoading"
                    class="server-detail__chart-state"
                  >
                    正在加载延迟数据...
                  </div>

                  <div
                    v-else-if="pingError"
                    class="server-detail__chart-state"
                  >
                    延迟数据加载失败
                  </div>

                  <div
                    v-else-if="!pingChart.hasData"
                    class="server-detail__chart-state"
                  >
                    暂无延迟数据
                  </div>

                  <template v-else>
                    <div class="ping-legend">
                      <button
                        v-for="series in pingChart.series"
                        :key="series.task.id"
                        type="button"
                        class="ping-legend__item"
                        :class="{ 'ping-legend__item--muted': !series.visible }"
                        @click="togglePingTask(series.task.id)"
                      >
                        <i :style="{ backgroundColor: series.color }" />
                        {{ series.task.name }} {{ series.task.loss.toFixed(1) }}%
                      </button>
                    </div>

                    <div
                      v-if="!pingChart.hasVisibleSeries"
                      class="server-detail__chart-state"
                    >
                      已隐藏全部监控点，点击上方图例重新显示
                    </div>

                    <div
                      v-else
                      class="ping-chart-wrap"
                    >
                      <svg
                        class="ping-chart"
                        :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                        preserveAspectRatio="none"
                        aria-label="延迟图表"
                        @mousemove="onPingChartMouseMove"
                        @mouseleave="onPingChartMouseLeave"
                      >
                        <g class="ping-chart__grid">
                          <g
                            v-for="label in pingChart.yLabels"
                            :key="label.y"
                          >
                            <line
                              :x1="CHART_PAD_L"
                              :x2="CHART_W - CHART_PAD_R"
                              :y1="label.y"
                              :y2="label.y"
                            />
                          </g>
                        </g>

                        <line
                          v-if="pingTooltip"
                          class="ping-chart__crosshair"
                          :x1="pingTooltip.svgX"
                          :x2="pingTooltip.svgX"
                          :y1="CHART_PAD_T"
                          :y2="CHART_H - CHART_PAD_B"
                        />

                        <g class="ping-chart__series">
                          <polyline
                            v-for="series in pingChart.series"
                            v-show="series.visible"
                            :key="series.task.id"
                            :points="series.pointList"
                            :stroke="series.color"
                          />
                        </g>

                        <g
                          v-if="pingTooltip"
                          class="ping-chart__markers"
                        >
                          <circle
                            v-for="item in pingTooltip.items"
                            :key="item.name"
                            :cx="pingTooltip.svgX"
                            :cy="item.y"
                            r="3.5"
                            :fill="item.color"
                          />
                        </g>
                      </svg>

                      <div class="ping-chart__y-labels" aria-hidden="true">
                        <span
                          v-for="label in pingChart.yLabels"
                          :key="label.y"
                          :style="{ top: `${label.topPercent}%` }"
                        >
                          {{ label.label }}
                        </span>
                      </div>

                      <div class="ping-chart__x-labels" aria-hidden="true">
                        <span
                          v-for="label in pingChart.xLabels"
                          :key="label.x"
                          :class="`ping-chart__x-label--${label.anchor}`"
                          :style="{ left: `${label.leftPercent}%` }"
                        >
                          {{ label.label }}
                        </span>
                      </div>

                      <div
                        v-if="pingTooltip"
                        class="ping-tooltip"
                        :class="{ 'ping-tooltip--flip': pingTooltip.flip }"
                        :style="{ left: `${pingTooltip.left}px` }"
                      >
                        <p>{{ pingTooltip.timeLabel }}</p>
                        <div
                          v-for="item in pingTooltip.items"
                          :key="item.name"
                          class="ping-tooltip__row"
                        >
                          <span :style="{ backgroundColor: item.color }" />
                          <b>{{ item.name }}</b>
                          <strong>{{ item.value.toFixed(1) }} ms</strong>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.koumei-home {
  position: relative;
  overflow: hidden;
  color: var(--theme-text-primary);
  /* 中文说明：背景色参考 Telegram 网页版聊天页，左侧压深、右侧提亮，底部保留一层柔和黄绿色。 */
  background:
    radial-gradient(ellipse 54rem 34rem at 100% 0%, rgba(239, 236, 166, 0.92) 0%, rgba(235, 233, 150, 0.64) 34%, transparent 72%),
    radial-gradient(ellipse 58rem 38rem at 0% 100%, rgba(220, 224, 88, 0.82) 0%, rgba(211, 222, 96, 0.62) 34%, transparent 72%),
    radial-gradient(circle at 4% 8%, rgba(83, 148, 106, 0.9) 0, transparent 32rem),
    radial-gradient(circle at 68% 42%, rgba(112, 174, 124, 0.58) 0, transparent 44rem),
    linear-gradient(103deg, #74aa7a 0%, #9fc982 43%, #e8e9bf 100%);
}

.koumei-home::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  /* 中文说明：public 下的线稿涂鸦作为背景纹理重复铺开，只承担氛围，不影响后续内容层级。 */
  background-image: url('/pattern.svg');
  background-repeat: repeat;
  background-size: 26rem auto;
  opacity: 0.115;
  mix-blend-mode: multiply;
}

.server-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.54), rgba(245, 248, 241, 0.3)),
    rgba(255, 255, 255, 0.2);
  box-shadow:
    0 24px 70px rgba(40, 69, 45, 0.17),
    0 2px 14px rgba(31, 42, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.62),
    inset 0 -1px 0 rgba(38, 49, 38, 0.04);
  /* 中文说明：Card 与工具栏使用同一套玻璃材质，让表格像浮在背景上而不是压在白底里。 */
  backdrop-filter: blur(26px) saturate(1.38);
  -webkit-backdrop-filter: blur(26px) saturate(1.38);
}

.server-card::before {
  position: absolute;
  inset: -12%;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 6%, rgba(255, 255, 255, 0.54), transparent 24%),
    radial-gradient(circle at 84% 16%, rgba(169, 216, 130, 0.22), transparent 30%),
    radial-gradient(circle at 48% 102%, rgba(255, 255, 255, 0.26), transparent 34%);
  content: '';
  filter: blur(18px);
  opacity: 0.84;
}

.server-card + .server-card {
  margin-top: 1rem;
}

.server-card__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem 0.1rem;
}

.server-card__header p {
  margin: 0 0 0.18rem;
  color: rgba(31, 42, 31, 0.48);
  font-size: 11px;
  font-weight: 680;
  letter-spacing: 0.12em;
}

.server-card__header h2 {
  margin: 0;
  color: #263126;
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.server-card__meta {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  color: rgba(31, 42, 31, 0.58);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  padding: 0.44rem 0.68rem;
  white-space: nowrap;
}

.server-toolbar {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  margin-bottom: -0.15rem;
  padding: 0 0 0.4rem;
}

.capsule-toolbar {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  overflow: visible;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 999px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(245, 248, 241, 0.28)),
    rgba(255, 255, 255, 0.22);
  box-shadow:
    0 18px 48px rgba(40, 69, 45, 0.18),
    0 2px 10px rgba(31, 42, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    inset 0 -1px 0 rgba(38, 49, 38, 0.04);
  backdrop-filter: blur(28px) saturate(1.45);
  -webkit-backdrop-filter: blur(28px) saturate(1.45);
  transition:
    border-color 180ms ease,
    box-shadow 220ms ease,
    transform 220ms var(--ease-out-power2);
}

.capsule-toolbar::before {
  position: absolute;
  inset: -10px;
  z-index: -1;
  border-radius: inherit;
  background:
    radial-gradient(circle at 22% 50%, rgba(255, 255, 255, 0.46), transparent 34%),
    radial-gradient(circle at 78% 48%, rgba(169, 216, 130, 0.28), transparent 38%);
  content: '';
  filter: blur(18px);
  opacity: 0.55;
  transform: scale(0.96);
  transition:
    opacity 260ms ease,
    transform 260ms var(--ease-out-power2);
}

.capsule-toolbar:hover {
  border-color: rgba(255, 255, 255, 0.62);
  box-shadow:
    0 22px 58px rgba(40, 69, 45, 0.22),
    0 2px 14px rgba(31, 42, 31, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    inset 0 -1px 0 rgba(38, 49, 38, 0.05);
  transform: translateY(-1px);
}

.capsule-toolbar:hover::before {
  opacity: 0.92;
  transform: scale(1.02);
}

.capsule-toolbar--stats {
  gap: 0.02rem;
  padding: 0.4rem 0.48rem;
}

.capsule-toolbar--actions {
  gap: 0.34rem;
  padding: 0.34rem;
}

.toolbar-stat {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  padding: 0.33rem 0.78rem;
  color: rgba(31, 42, 31, 0.56);
  font-size: 11px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.toolbar-stat::before {
  position: absolute;
  inset: 0.18rem 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  content: '';
  opacity: 0;
  transition:
    opacity 180ms ease,
    transform 220ms var(--ease-out-power2);
  transform: scaleX(0.86);
}

.toolbar-stat:hover::before {
  opacity: 1;
  transform: scaleX(1);
}

.toolbar-stat + .toolbar-stat::after {
  position: absolute;
  top: 50%;
  left: 0;
  width: 1px;
  height: 42%;
  background: linear-gradient(180deg, transparent, rgba(38, 49, 38, 0.12), transparent);
  content: '';
  transform: translateY(-50%);
}

.toolbar-stat strong {
  position: relative;
  color: #263126;
  font-size: 13px;
  font-weight: 680;
  letter-spacing: -0.01em;
}

.toolbar-stat span {
  position: relative;
}

.theme-menu {
  position: relative;
}

.glass-action {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.52),
    inset 0 -1px 0 rgba(38, 49, 38, 0.06);
  color: rgba(31, 42, 31, 0.76);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 680;
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color 180ms ease,
    color 160ms ease,
    box-shadow 220ms ease,
    transform 220ms var(--ease-out-power2);
}

.glass-action::before {
  position: absolute;
  inset: -35%;
  z-index: -1;
  background:
    radial-gradient(circle at 50% 115%, rgba(255, 255, 255, 0.74), transparent 34%),
    radial-gradient(circle at 50% 30%, rgba(169, 216, 130, 0.28), transparent 46%);
  content: '';
  filter: blur(12px);
  opacity: 0;
  transform: scale(0.72);
  transition:
    opacity 260ms ease,
    transform 280ms var(--ease-out-power2);
}

.glass-action:hover,
.glass-action[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    0 8px 22px rgba(40, 69, 45, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    inset 0 -1px 0 rgba(38, 49, 38, 0.05);
  color: #1f2a1f;
  transform: translateY(-1px) scale(1.012);
}

.glass-action:hover::before,
.glass-action[aria-expanded='true']::before {
  opacity: 1;
  transform: scale(1);
}

.glass-action__icon,
.glass-action svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.8;
}

.glass-action--theme {
  gap: 0.42rem;
  padding: 0 0.68rem 0 0.62rem;
}

.glass-action--theme small {
  margin-left: -0.18rem;
  border-left: 1px solid rgba(38, 49, 38, 0.1);
  padding-left: 0.42rem;
  color: rgba(31, 42, 31, 0.48);
  font-size: 11px;
  font-weight: 620;
}

.theme-trigger__chevron {
  width: 13px;
  height: 13px;
  color: rgba(31, 42, 31, 0.42);
  transition: transform 220ms var(--ease-out-power2);
}

.glass-action[aria-expanded='true'] .theme-trigger__chevron {
  transform: rotate(180deg);
}

.glass-action--icon {
  width: 36px;
  padding: 0;
}

.admin-link {
  text-decoration: none;
}

.theme-menu__popover {
  position: absolute;
  top: calc(100% + 0.58rem);
  right: 0;
  z-index: 30;
  min-width: 10rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.44);
  border-radius: 1.2rem;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.64), rgba(245, 248, 241, 0.34)),
    rgba(255, 255, 255, 0.22);
  box-shadow:
    0 24px 58px rgba(40, 69, 45, 0.2),
    0 4px 16px rgba(31, 42, 31, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.68);
  padding: 0.42rem;
  backdrop-filter: blur(30px) saturate(1.5);
  -webkit-backdrop-filter: blur(30px) saturate(1.5);
}

.theme-menu__option {
  display: grid;
  width: 100%;
  min-height: 36px;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  border-radius: 0.86rem;
  background: transparent;
  color: rgba(31, 42, 31, 0.7);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  padding: 0.42rem 0.58rem;
  text-align: left;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 180ms var(--ease-out-power2);
}

.theme-menu__option:hover,
.theme-menu__option--active {
  background: rgba(255, 255, 255, 0.38);
  color: #1f2a1f;
}

.theme-menu__option:hover {
  transform: translateX(1px);
}

.theme-menu__option svg {
  width: 15px;
  height: 15px;
  stroke-width: 1.9;
}

.theme-menu__check {
  color: #5e944f;
}

.theme-menu-float-enter-active,
.theme-menu-float-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms var(--ease-out-power2),
    filter 220ms ease;
}

.theme-menu-float-enter-from,
.theme-menu-float-leave-to {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(-0.35rem) scale(0.96);
}

.server-grid {
  position: relative;
  z-index: 1;
  overflow-x: auto;
  padding: 0.65rem 1rem 1rem;
}

.server-grid__head,
.server-grid__row {
  display: grid;
  grid-template-columns: 4rem minmax(8.5rem, 0.85fr) 5.8rem 4.5rem 5.5rem 4.8rem 4.4rem minmax(10.5rem, 1fr) minmax(10rem, 1fr) 5.8rem 6rem 6rem 6.6rem;
  min-width: 84rem;
  align-items: center;
}

.server-grid__head {
  min-height: 30px;
  color: #263126;
  font-size: 14px;
  font-weight: 600;
}

.server-grid__head > div,
.server-grid__row > div {
  min-width: 0;
  padding: 0 6px;
}

.server-grid__row {
  min-height: 30px;
  border-top: 1px solid rgba(48, 65, 48, 0.055);
  color: #2b352b;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    box-shadow 200ms ease,
    color 160ms ease,
    transform 200ms var(--ease-out-power2);
}

.server-grid__row:nth-child(even) {
  background: rgba(255, 255, 255, 0.11);
}

.server-grid__row:hover {
  background:
    radial-gradient(circle at 18% 50%, rgba(255, 255, 255, 0.32), transparent 34%),
    radial-gradient(circle at 72% 50%, rgba(169, 216, 130, 0.13), transparent 38%),
    rgba(255, 255, 255, 0.16);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    inset 0 -1px 0 rgba(38, 49, 38, 0.035);
}

.server-grid__row--active {
  background:
    radial-gradient(circle at 22% 50%, rgba(255, 255, 255, 0.34), transparent 36%),
    radial-gradient(circle at 76% 52%, rgba(169, 216, 130, 0.16), transparent 40%),
    rgba(255, 255, 255, 0.2);
}

.server-grid__row > div:not(:has(.resource-bar)) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-grid__status {
  display: flex;
  justify-content: center;
}

.server-grid__head > div:nth-child(2),
.server-grid__head > div:nth-child(8),
.server-grid__head > div:nth-child(9),
.server-grid__center {
  text-align: center;
}

.server-grid__name {
  overflow: hidden;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-grid__region {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.server-grid__region img {
  width: 1.05rem;
  height: 0.78rem;
  border-radius: 2px;
  object-fit: cover;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.server-grid__empty {
  min-width: 84rem;
  border-top: 1px solid rgba(48, 65, 48, 0.055);
  padding: 2.8rem 1rem;
  color: rgba(31, 42, 31, 0.58);
  font-size: 0.9rem;
  text-align: center;
}

.status-dot {
  display: inline-block;
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 999px;
  box-shadow: 0 0 0 3px rgba(96, 160, 74, 0.12);
}

.status-dot--online {
  background: #5faa43;
}

.status-dot--offline {
  background: #c75245;
  box-shadow: 0 0 0 3px rgba(199, 82, 69, 0.13);
}

.resource-bar {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 16px;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(31, 42, 31, 0.08);
}

.resource-bar span {
  position: absolute;
  inset-block: 0;
  left: 0;
  border-radius: inherit;
}

.resource-bar strong {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 0 0.28rem;
  color: #263126;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  text-align: right;
}

.resource-bar.is-normal span {
  background: linear-gradient(90deg, #6ab44e, #a5ce75);
}

.resource-bar.is-warning span {
  background: linear-gradient(90deg, #d5ab45, #e5cf73);
}

.resource-bar.is-danger span {
  background: linear-gradient(90deg, #bd4c3f, #d96a5d);
}

.server-detail {
  min-width: 84rem;
  border-top: 1px solid rgba(48, 65, 48, 0.06);
  border-bottom: 1px solid rgba(48, 65, 48, 0.08);
  background:
    radial-gradient(circle at 24% 0%, rgba(255, 255, 255, 0.26), transparent 32%),
    rgba(255, 255, 255, 0.16);
  padding: 14px 18px 18px;
}

.server-detail__info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 24px;
  color: #202a20;
  font-size: 14px;
  line-height: 1.55;
}

.server-detail__info p {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.server-detail__info span {
  font-weight: 600;
}

.server-detail__chart {
  margin-top: 14px;
}

.server-detail__chart-state {
  display: flex;
  height: 220px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(244, 248, 241, 0.72);
  color: #536153;
  font-size: 14px;
}

.ping-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 18px;
  margin-bottom: 8px;
  color: #243024;
  font-size: 14px;
}

.ping-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 2px 4px;
  white-space: nowrap;
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.ping-legend__item:hover {
  transform: translateY(-1px);
}

.ping-legend__item--muted {
  opacity: 0.38;
  text-decoration: line-through;
}

.ping-legend__item i {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.ping-chart-wrap {
  position: relative;
}

.ping-chart {
  display: block;
  width: 100%;
  height: 300px;
  overflow: visible;
  cursor: crosshair;
}

.ping-chart__grid line {
  stroke: #dce3ec;
  stroke-width: 1;
}

.ping-chart__y-labels,
.ping-chart__x-labels {
  position: absolute;
  inset: 0;
  color: #202a20;
  font-size: 13px;
  pointer-events: none;
  user-select: none;
}

.ping-chart__y-labels span {
  position: absolute;
  left: 0;
  width: 34px;
  text-align: right;
  transform: translateY(-50%);
}

.ping-chart__x-labels span {
  position: absolute;
  bottom: 2px;
  transform: translateX(-50%);
  white-space: nowrap;
}

.ping-chart__x-label--start {
  transform: translateX(0);
}

.ping-chart__x-label--end {
  transform: translateX(-100%);
}

.ping-chart__series polyline {
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ping-chart__crosshair {
  stroke: #7b897b;
  stroke-dasharray: 4 4;
  stroke-width: 1;
}

.ping-chart__markers circle {
  stroke: #fff;
  stroke-width: 1.6;
}

.ping-tooltip {
  position: absolute;
  top: 8px;
  z-index: 5;
  min-width: 190px;
  max-width: 280px;
  border: 1px solid rgba(38, 49, 38, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 28px rgba(31, 42, 31, 0.16);
  color: #263126;
  pointer-events: none;
  transform: translateX(12px);
}

.ping-tooltip--flip {
  transform: translateX(calc(-100% - 12px));
}

.ping-tooltip p {
  margin: 0;
  border-bottom: 1px solid rgba(38, 49, 38, 0.1);
  padding: 7px 10px 6px;
  color: #5f6d5f;
  font-size: 12px;
}

.ping-tooltip__row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  font-size: 12px;
}

.ping-tooltip__row span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.ping-tooltip__row b {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ping-tooltip__row strong {
  font-weight: 600;
  white-space: nowrap;
}

:global([data-theme='dark']) .koumei-home {
  /* 中文说明：深色模式保留原有绿色氛围，但整体压暗，避免表格文字和背景对比不足。 */
  background:
    radial-gradient(ellipse 54rem 34rem at 100% 0%, rgba(82, 92, 48, 0.42) 0%, rgba(59, 71, 41, 0.32) 34%, transparent 72%),
    radial-gradient(ellipse 58rem 38rem at 0% 100%, rgba(74, 99, 45, 0.5) 0%, rgba(51, 72, 41, 0.38) 34%, transparent 72%),
    radial-gradient(circle at 4% 8%, rgba(38, 83, 55, 0.72) 0, transparent 32rem),
    radial-gradient(circle at 68% 42%, rgba(42, 92, 58, 0.42) 0, transparent 44rem),
    linear-gradient(103deg, #172218 0%, #23301f 44%, #343520 100%);
}

:global([data-theme='dark']) .koumei-home::before {
  opacity: 0.08;
  mix-blend-mode: screen;
  filter: invert(1) saturate(0.45);
}

:global([data-theme='dark']) .server-card {
  border-color: rgba(245, 244, 237, 0.1);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.095), rgba(245, 244, 237, 0.04)),
    rgba(20, 20, 19, 0.64);
  box-shadow:
    0 22px 68px rgba(0, 0, 0, 0.36),
    0 2px 8px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
}

:global([data-theme='dark']) .server-card::before {
  background:
    radial-gradient(circle at 18% 6%, rgba(255, 255, 255, 0.1), transparent 24%),
    radial-gradient(circle at 84% 16%, rgba(217, 119, 87, 0.13), transparent 30%),
    radial-gradient(circle at 48% 102%, rgba(120, 140, 93, 0.1), transparent 34%);
  opacity: 0.9;
}

:global([data-theme='dark']) .server-card__header p {
  color: rgba(245, 244, 237, 0.44);
}

:global([data-theme='dark']) .server-card__header h2 {
  color: #f5f4ed;
}

:global([data-theme='dark']) .server-card__meta {
  border-color: rgba(245, 244, 237, 0.1);
  background: rgba(255, 255, 255, 0.055);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  color: rgba(245, 244, 237, 0.56);
}

:global([data-theme='dark']) .capsule-toolbar {
  border-color: rgba(245, 244, 237, 0.12);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.11), rgba(245, 244, 237, 0.045)),
    rgba(20, 20, 19, 0.44);
  box-shadow:
    0 18px 52px rgba(0, 0, 0, 0.32),
    0 2px 12px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
}

:global([data-theme='dark']) .capsule-toolbar::before {
  background:
    radial-gradient(circle at 22% 50%, rgba(255, 255, 255, 0.13), transparent 34%),
    radial-gradient(circle at 78% 48%, rgba(217, 119, 87, 0.18), transparent 40%);
  opacity: 0.72;
}

:global([data-theme='dark']) .capsule-toolbar:hover {
  border-color: rgba(245, 244, 237, 0.18);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.4),
    0 2px 14px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}

:global([data-theme='dark']) .toolbar-stat {
  color: rgba(245, 244, 237, 0.58);
}

:global([data-theme='dark']) .toolbar-stat::before {
  background: rgba(255, 255, 255, 0.06);
}

:global([data-theme='dark']) .toolbar-stat + .toolbar-stat::after {
  background: linear-gradient(180deg, transparent, rgba(245, 244, 237, 0.1), transparent);
}

:global([data-theme='dark']) .toolbar-stat strong,
:global([data-theme='dark']) .server-grid__head,
:global([data-theme='dark']) .resource-bar strong {
  color: #f5f4ed;
}

:global([data-theme='dark']) .glass-action {
  background: rgba(255, 255, 255, 0.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
  color: rgba(245, 244, 237, 0.72);
}

:global([data-theme='dark']) .glass-action::before {
  background:
    radial-gradient(circle at 50% 115%, rgba(255, 255, 255, 0.16), transparent 34%),
    radial-gradient(circle at 50% 30%, rgba(217, 119, 87, 0.16), transparent 46%);
}

:global([data-theme='dark']) .glass-action:hover,
:global([data-theme='dark']) .glass-action[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.11);
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
  color: #f5f4ed;
}

:global([data-theme='dark']) .glass-action--theme small {
  border-left-color: rgba(245, 244, 237, 0.12);
  color: rgba(245, 244, 237, 0.48);
}

:global([data-theme='dark']) .theme-trigger__chevron {
  color: rgba(245, 244, 237, 0.42);
}

:global([data-theme='dark']) .theme-menu__popover {
  border-color: rgba(245, 244, 237, 0.13);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(245, 244, 237, 0.055)),
    rgba(20, 20, 19, 0.72);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.42),
    0 4px 18px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

:global([data-theme='dark']) .theme-menu__option {
  color: rgba(245, 244, 237, 0.68);
}

:global([data-theme='dark']) .theme-menu__option:hover,
:global([data-theme='dark']) .theme-menu__option--active {
  background: rgba(255, 255, 255, 0.09);
  color: #f5f4ed;
}

:global([data-theme='dark']) .theme-menu__check {
  color: #d97757;
}

:global([data-theme='dark']) .server-grid__row {
  border-top-color: rgba(245, 244, 237, 0.08);
  color: #dedcd1;
}

:global([data-theme='dark']) .server-grid__row:nth-child(even) {
  background: rgba(255, 255, 255, 0.025);
}

:global([data-theme='dark']) .server-grid__row:hover,
:global([data-theme='dark']) .server-grid__row--active {
  background: rgba(120, 140, 93, 0.18);
}

:global([data-theme='dark']) .server-grid__empty,
:global([data-theme='dark']) .server-detail {
  border-color: rgba(245, 244, 237, 0.09);
  color: rgba(245, 244, 237, 0.58);
}

:global([data-theme='dark']) .server-detail {
  background: rgba(31, 30, 29, 0.72);
}

:global([data-theme='dark']) .server-detail__info,
:global([data-theme='dark']) .ping-legend,
:global([data-theme='dark']) .ping-chart__y-labels,
:global([data-theme='dark']) .ping-chart__x-labels {
  color: #f0eee7;
}

:global([data-theme='dark']) .resource-bar {
  background: rgba(245, 244, 237, 0.08);
}

:global([data-theme='dark']) .server-detail__chart-state {
  background: rgba(38, 38, 36, 0.86);
  color: rgba(245, 244, 237, 0.62);
}

:global([data-theme='dark']) .ping-chart__grid line {
  stroke: rgba(245, 244, 237, 0.1);
}

:global([data-theme='dark']) .ping-chart__crosshair {
  stroke: rgba(245, 244, 237, 0.48);
}

:global([data-theme='dark']) .ping-tooltip {
  border-color: rgba(245, 244, 237, 0.12);
  background: rgba(31, 30, 29, 0.96);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.36);
  color: #f5f4ed;
}

:global([data-theme='dark']) .ping-tooltip p {
  border-bottom-color: rgba(245, 244, 237, 0.1);
  color: rgba(245, 244, 237, 0.62);
}

@media (max-width: 768px) {
  .server-card {
    border-radius: 16px;
  }

  .server-card__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.85rem 0.8rem 0.05rem;
  }

  .server-card__meta {
    align-self: flex-start;
  }

  .server-toolbar {
    align-items: stretch;
    flex-direction: column;
    padding: 0 0 0.75rem;
  }

  .capsule-toolbar {
    width: 100%;
    justify-content: center;
  }

  .capsule-toolbar--stats {
    justify-content: space-between;
  }

  .toolbar-stat {
    flex: 1;
    justify-content: center;
    padding-inline: 0.5rem;
  }

  .capsule-toolbar--actions {
    justify-content: space-between;
  }

  .theme-menu {
    flex: 1;
  }

  .glass-action--theme {
    width: 100%;
  }

  .theme-menu__popover {
    right: auto;
    left: 0;
    width: min(15rem, calc(100vw - 1.6rem));
  }

  .server-detail__info {
    grid-template-columns: 1fr;
  }
}
</style>
