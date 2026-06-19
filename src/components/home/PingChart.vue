<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PingRecord, PingTask } from '@/types/node'

const props = defineProps<{
  uuid: string
}>()

type PingRangeOption = {
  label: string
  hours: number
}

// 中文说明：模块级缓存：同一节点重展开时直接复用上次结果，避免重复请求。
type PingCacheItem = {
  tasks: PingTask[]
  records: PingRecord[]
}
const pingCache = new Map<string, PingCacheItem>()
const pingRangeOptions: PingRangeOption[] = [
  { label: '1小时', hours: 1 },
  { label: '6小时', hours: 6 },
  { label: '12小时', hours: 12 },
  { label: '1天', hours: 24 },
]

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

const pingTasks = ref<PingTask[]>([])
const pingRecords = ref<PingRecord[]>([])
const pingLoading = ref(false)
const pingError = ref(false)
const pingVisibility = ref<Record<number, boolean>>({})
const pingTooltip = ref<PingTooltip | null>(null)
const selectedPingRangeHours = ref(24)
let pingRequestToken = 0

const CHART_W = 1200
const CHART_H = 280
const CHART_PAD_L = 44
const CHART_PAD_R = 16
const CHART_PAD_T = 16
const CHART_PAD_B = 34
const CHART_INNER_W = CHART_W - CHART_PAD_L - CHART_PAD_R
const CHART_INNER_H = CHART_H - CHART_PAD_T - CHART_PAD_B
// 中文说明：延迟图表统一使用新的品牌配色，保证多条线路同时展示时更清晰也更贴合当前主题。
const PING_COLORS = ['#5B8AF0', '#34C78A', '#F5A623', '#F06B6B', '#A78BFA', '#38BDF8', '#FB7185']

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

async function loadPingData(uuid: string) {
  const cacheKey = `${uuid}:${selectedPingRangeHours.value}`
  const cached = pingCache.get(cacheKey)
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
    const response = await fetch(
      `/api/records/ping?uuid=${uuid}&hours=${selectedPingRangeHours.value}`,
      { credentials: 'include' },
    )
    if (!response.ok) throw new Error(`Ping records request failed: ${response.status}`)
    const result = await response.json()
    const nextData: PingCacheItem = {
      tasks: result.data?.tasks ?? [],
      records: result.data?.records ?? [],
    }

    // 中文说明：快速切换节点时只接受最后一次请求结果，避免旧响应覆盖当前展开项。
    if (token !== pingRequestToken) return

    pingCache.set(cacheKey, nextData)
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

function setPingRange(hours: number) {
  if (selectedPingRangeHours.value === hours) {
    return
  }

  // 中文说明：切换时间范围后立即刷新当前节点图表，并清理悬浮提示，避免旧范围残留。
  selectedPingRangeHours.value = hours
  pingTooltip.value = null
}

// 中文说明：节点切换或时间范围切换时都重新拉取当前图表数据；相同条件下优先命中缓存。
watch(
  [() => props.uuid, selectedPingRangeHours],
  ([uuid]) => {
    if (uuid) void loadPingData(uuid)
  },
  { immediate: true },
)

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
</script>

<template>
  <div class="server-detail__chart">
    <div class="ping-chart-toolbar">
      <p class="ping-chart-toolbar__title">延迟趋势</p>

      <div class="ping-range-switch" role="group" aria-label="延迟图表时间范围">
        <button
          v-for="option in pingRangeOptions"
          :key="option.hours"
          type="button"
          class="ping-range-switch__button"
          :class="{ 'ping-range-switch__button--active': selectedPingRangeHours === option.hours }"
          :aria-pressed="selectedPingRangeHours === option.hours"
          @click="setPingRange(option.hours)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

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
</template>

<style scoped>
.ping-chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.7rem;
}

.ping-chart-toolbar__title {
  margin: 0;
  color: var(--koumei-chart-text);
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.ping-range-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--koumei-detail-border);
  border-radius: 8px;
  background: var(--koumei-card-chip-bg);
  padding: 2px;
}

.ping-range-switch__button {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--koumei-card-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  padding: 0 0.6rem;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.ping-range-switch__button:hover,
.ping-range-switch__button--active {
  /* 中文说明：时间范围切换不再复用表格行的高亮蓝色，避免和展开行状态混淆。 */
  background: var(--koumei-menu-option-hover);
  color: var(--koumei-card-title);
}

.server-detail__chart-state {
  display: flex;
  height: 220px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--koumei-chart-state-bg);
  color: var(--koumei-chart-muted);
  font-size: 14px;
}

.ping-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 18px;
  margin-bottom: 8px;
  color: var(--koumei-chart-text);
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
  border-radius: 8px;
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
  stroke: var(--koumei-chart-grid);
  stroke-width: 1;
}

.ping-chart__y-labels,
.ping-chart__x-labels {
  position: absolute;
  inset: 0;
  color: var(--koumei-chart-text);
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
  stroke: var(--koumei-chart-crosshair);
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
  border: 1px solid var(--koumei-tooltip-border);
  border-radius: 8px;
  background: var(--koumei-tooltip-bg);
  box-shadow: var(--koumei-tooltip-shadow);
  color: var(--koumei-chart-text);
  pointer-events: none;
  transform: translateX(12px);
}

.ping-tooltip--flip {
  transform: translateX(calc(-100% - 12px));
}

.ping-tooltip p {
  margin: 0;
  border-bottom: 1px solid var(--koumei-tooltip-border);
  padding: 7px 10px 6px;
  color: var(--koumei-chart-muted);
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
  border-radius: 8px;
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

@media (max-width: 768px) {
  .ping-chart-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .ping-range-switch {
    flex-wrap: wrap;
  }
}

</style>
