<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { Info } from 'lucide-vue-next'

interface PingTask {
  id: number
  name: string
  interval: number
  loss: number
  type?: string
  protocol?: string
}
interface PingRecord { task_id: number; time: string; value: number }

const props = defineProps<{ uuid: string }>()

const CLAUDE_CHART_COLORS = [
  '#C07A45',
  '#3A82A8',
  '#4A9E6A',
  '#9B6BB5',
  '#C4883A',
  '#C45A5A',
  '#4A8E96',
  '#7A8C5E',
]
const HOUR_OPTIONS = [
  { label: '1小时', value: 1 },
  { label: '6小时', value: 6 },
  { label: '12小时', value: 12 },
  { label: '1天', value: 24 },
]

const hours = ref(24)
const pingTasks = ref<PingTask[]>([])
const pingRecords = ref<PingRecord[]>([])
const loading = ref(false)
const error = ref(false)
const visibility = ref<Record<number, boolean>>({})
const smoothEnabled = ref(false)
const EWMA_ALPHA = 0.15  // smoothing factor: lower = smoother

// EWMA smoothing
function ewma(values: number[]): number[] {
  if (!values.length) return []
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(EWMA_ALPHA * values[i] + (1 - EWMA_ALPHA) * out[i - 1])
  }
  return out
}

async function load() {
  loading.value = true
  error.value = false
  try {
    const res = await fetch(`/api/records/ping?uuid=${props.uuid}&hours=${hours.value}`)
    if (!res.ok) throw new Error()
    const json = await res.json()
    const tasks: PingTask[] = json.data?.tasks ?? []
    pingTasks.value = tasks
    pingRecords.value = json.data?.records ?? []
    for (const t of tasks) {
      if (visibility.value[t.id] === undefined) visibility.value[t.id] = true
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

watch(() => props.uuid, () => { visibility.value = {}; load() }, { immediate: true })
watch(hours, load)

function toggleTask(id: number) {
  visibility.value[id] = !visibility.value[id]
}

const isAllHidden = computed(() => {
  return pingTasks.value.every(t => visibility.value[t.id] === false)
})

function toggleAllTasks() {
  const nextVal = isAllHidden.value
  for (const t of pingTasks.value) {
    visibility.value[t.id] = nextVal
  }
}

// ── Chart geometry ──────────────────────────────────────────
const SVG_DISPLAY_HEIGHT = 480
const CHART_H = 340
// 中文说明：绘图区直接顶到左右两侧，只给坐标文本保留极小安全距离。
const PAD_L = 0
const PAD_B = 32
const PAD_T = 16
const PAD_R = 0
const H = CHART_H - PAD_T - PAD_B

interface PointData { x: number; y: number; time: string; value: number; taskId: number }

interface TaskSeries {
  task: PingTask
  color: string
  visible: boolean
  avg: number
  min: number
  max: number
  latest: number
  p50: number
  p99: number
  volatility: number
  loss: number
  sampleCount: number
  protocolLabel: string
  polyline: string
  points: PointData[]
}

// 中文说明：百分位数统一走线性插值，保证样本量较小时也能得到稳定结果。
function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0

  const sortedValues = [...values].sort((a, b) => a - b)
  const index = (sortedValues.length - 1) * ratio
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex]
  }

  const weight = index - lowerIndex
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
}

// 中文说明：官方的“波动”不是标准差，而是基于 P99-P50 的尾部抖动比值。
function tailJitterRatio(p50: number, p99: number): number {
  if (p50 <= 0 || p99 < p50) return 0

  const jitterMs = p99 - p50
  const adjustedBase = Math.max(Math.min(p50, 50), 10)

  return jitterMs / adjustedBase
}

const vMax = computed(() => {
  const all = pingRecords.value.filter(r => r.value > 0)
  return all.length ? Math.max(...all.map(r => r.value)) * 1.1 : 100
})

const tRange = computed(() => {
  const times = pingRecords.value.map(r => new Date(r.time).getTime())
  if (!times.length) return { tMin: 0, tMax: 1, range: 1 }
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  return { tMin, tMax, range: tMax - tMin || 1 }
})

const series = computed<TaskSeries[]>(() => {
  if (!pingTasks.value.length) return []
  const { tMin, range } = tRange.value
  const vm = vMax.value
  const chartWidth = W.value

  return pingTasks.value.map((task, i) => {
    const recs = pingRecords.value
      .filter(r => r.task_id === task.id)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

    const validRecs = recs.filter(r => r.value > 0)
    const avg = validRecs.length ? validRecs.reduce((s, r) => s + r.value, 0) / validRecs.length : 0

    const rawValues = validRecs.map(r => r.value)
    const displayValues = smoothEnabled.value ? ewma(rawValues) : rawValues
    const min = rawValues.length ? Math.min(...rawValues) : 0
    const max = rawValues.length ? Math.max(...rawValues) : 0
    const latest = validRecs.length ? validRecs[validRecs.length - 1].value : 0
    const p50 = percentile(rawValues, 0.5)
    const p99 = percentile(rawValues, 0.99)
    const volatility = tailJitterRatio(p50, p99)
    const protocolLabel = task.type ?? task.protocol ?? '--'

    const points: PointData[] = validRecs.map((r, idx) => {
      const x = PAD_L + ((new Date(r.time).getTime() - tMin) / range) * chartWidth
      const y = PAD_T + H - (displayValues[idx] / vm) * H
      return { x, y, time: r.time, value: r.value, taskId: task.id }
    })

    return {
      task,
      color: CLAUDE_CHART_COLORS[i % CLAUDE_CHART_COLORS.length],
      visible: visibility.value[task.id] ?? true,
      avg,
      min,
      max,
      latest,
      p50,
      p99,
      volatility,
      loss: task.loss,
      sampleCount: recs.length,
      protocolLabel,
      polyline: points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      points,
    }
  })
})

const yLabels = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: PAD_T + H - f * H,
    label: f === 0 ? '0' : `${Math.round(f * vMax.value)}`,
    topPx: (PAD_T + H - f * H) / CHART_H * SVG_DISPLAY_HEIGHT,
  }))
)

const xLabels = computed(() => {
  const { tMin, range } = tRange.value
  if (!pingRecords.value.length) return []
  const count = 6
  const chartWidth = W.value
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = tMin + (i / count) * range
    const d = new Date(t)
    return {
      x: PAD_L + (i / count) * chartWidth,
      label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      anchor: i === 0 ? 'start' : i === count ? 'end' : 'middle',
    }
  })
})

// ── Tooltip (HTML overlay) ───────────────────────────────────
interface TooltipState {
  // position as % of container width/height for the HTML overlay
  leftPx: number
  items: { color: string; name: string; value: number }[]
  timeLabel: string
  // SVG x for the crosshair line
  svgX: number
  flip: boolean  // show tooltip to the left of cursor
}

const tooltip = ref<TooltipState | null>(null)
const wrapEl = ref<HTMLDivElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const chartViewportWidth = ref(1000)
let chartResizeObserver: ResizeObserver | null = null

function syncChartViewportWidth() {
  if (!wrapEl.value) {
    return
  }

  // 中文说明：SVG 视口宽高比跟随真实容器，避免超宽布局下出现左右留白。
  chartViewportWidth.value = Math.max(320, (wrapEl.value.clientWidth * CHART_H) / SVG_DISPLAY_HEIGHT)
}

const W = computed(() => chartViewportWidth.value - PAD_L - PAD_R)

watch(wrapEl, (element) => {
  chartResizeObserver?.disconnect()
  chartResizeObserver = null

  if (!element) {
    return
  }

  syncChartViewportWidth()
  chartResizeObserver = new ResizeObserver(() => {
    syncChartViewportWidth()
  })
  chartResizeObserver.observe(element)
})

onUnmounted(() => {
  chartResizeObserver?.disconnect()
})

function onMouseMove(e: MouseEvent) {
  if (!svgEl.value || !wrapEl.value || !series.value.length) return

  // Use SVG's own coordinate transform to handle any aspect ratio mode correctly
  const pt = svgEl.value.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = svgEl.value.getScreenCTM()
  if (!ctm) return
  const svgPt = pt.matrixTransform(ctm.inverse())
  const mx = svgPt.x
  const chartWidth = W.value

  if (mx < PAD_L || mx > PAD_L + chartWidth) { tooltip.value = null; return }

  const { tMin, range } = tRange.value
  const ratio = (mx - PAD_L) / chartWidth
  const targetT = tMin + ratio * range

  const items: { color: string; name: string; value: number; pt: PointData }[] = []
  for (const s of series.value) {
    if (!s.visible || !s.points.length) continue
    let best = s.points[0]
    let bestDist = Math.abs(new Date(best.time).getTime() - targetT)
    for (const p of s.points) {
      const d = Math.abs(new Date(p.time).getTime() - targetT)
      if (d < bestDist) { bestDist = d; best = p }
    }
    items.push({ color: s.color, name: s.task.name, value: best.value, pt: best })
  }

  if (!items.length) { tooltip.value = null; return }

  const refTime = items[0].pt.time
  const timeLabel = new Date(refTime).toLocaleString('zh-CN', {
    hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const wrapRect = wrapEl.value.getBoundingClientRect()
  const leftPx = e.clientX - wrapRect.left
  const flip = leftPx > wrapRect.width * 0.65

  tooltip.value = {
    leftPx,
    svgX: mx,
    items: items.map(i => ({ color: i.color, name: i.name, value: i.value })),
    timeLabel,
    flip,
  }
}

function onMouseLeave() {
  tooltip.value = null
}

function getAreaPath(s: TaskSeries): string {
  if (!s.points || !s.points.length) return ''
  const first = s.points[0]
  const last = s.points[s.points.length - 1]
  const bottomY = PAD_T + H
  const pointsStr = s.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')
  return `M ${first.x.toFixed(1)},${bottomY.toFixed(1)} L ${pointsStr} L ${last.x.toFixed(1)},${bottomY.toFixed(1)} Z`
}
</script><template>
  <div>
    <div class="flex flex-col gap-5">
      <!-- Centered time selector -->
      <div class="flex justify-center">
        <div class="flex h-9 items-center gap-1 rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)] p-1">
          <button
            v-for="opt in HOUR_OPTIONS"
            :key="opt.value"
            type="button"
            class="inline-flex h-7 min-w-[3.5rem] items-center justify-center rounded-[0.65rem] px-3.5 font-body-zh text-caption transition-colors duration-200"
            :class="hours === opt.value
              ? 'bg-[var(--theme-control-active-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-control-active-shadow)] font-semibold'
              : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'"
            @click="hours = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Ping task cards (legends) in a wrapping flex container -->
      <div class="flex flex-wrap gap-3">
        <div
          v-for="s in series"
          :key="s.task.id"
          class="group/info relative min-w-0 w-full sm:w-[265px]"
        >
          <button
            type="button"
            class="flex w-full min-w-0 flex-col rounded-[1rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)] p-3 text-left transition-all duration-200 hover:border-[var(--theme-divider-soft)] hover:shadow-[0_4px_12px_rgba(20,20,19,0.02)]"
            :class="[
              s.visible ? 'opacity-100' : 'opacity-45'
            ]"
            @click="toggleTask(s.task.id)"
          >
            <!-- Top row: vertical color pill, name, info icon -->
            <div class="flex w-full items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <span class="inline-block h-3.5 w-1 shrink-0 rounded-full" :style="{ backgroundColor: s.color }" />
                <span
                  class="font-ui-mixed min-w-0 truncate text-ui text-[var(--theme-text-primary)] font-semibold"
                  :class="!s.visible ? 'line-through opacity-50' : ''"
                >
                  {{ s.task.name }}
                </span>
              </div>
              <span
                class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--theme-text-tertiary)] transition-colors duration-200 hover:text-[var(--theme-text-primary)]"
                :aria-label="`查看 ${s.task.name} 统计信息`"
              >
                <Info class="h-4 w-4" />
              </span>
            </div>

            <!-- Bottom row: stats indented to align under name -->
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 pl-3 font-ui-mixed text-caption text-[var(--theme-text-secondary)]">
              <span class="font-heading-en text-[var(--theme-text-primary)] font-semibold">{{ s.avg.toFixed(1) }} ms</span>
              <span>丢包 {{ s.loss.toFixed(1) }}%</span>
              <span>波动 {{ s.volatility.toFixed(2) }}</span>
            </div>
          </button>

          <div
            class="pointer-events-none absolute top-full right-0 z-20 mt-2 w-[18rem] rounded-[1.25rem] border border-[var(--theme-divider-subtle)] bg-[var(--tooltip-surface)] p-4 opacity-0 shadow-[var(--surface-elevated-shadow)] transition-opacity duration-200 group-hover/info:opacity-100"
          >
            <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">最小值</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.min.toFixed(1) }} ms</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">最大值</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.max.toFixed(1) }} ms</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">平均值</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.avg.toFixed(1) }} ms</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">最新</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.latest.toFixed(1) }} ms</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">波动</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.volatility.toFixed(2) }}</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">p50</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.p50.toFixed(1) }} ms</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">p99</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.p99.toFixed(1) }} ms</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">丢包</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.loss.toFixed(1) }}%</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">检测间隔</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.task.interval }}s</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">类型</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.protocolLabel }}</span>

              <span class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">样本数量</span>
              <span class="font-heading-en text-caption text-[var(--theme-text-primary)]">{{ s.sampleCount }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 加载 / 错误 / 无数据 -->
      <div
        v-if="loading || error || !series.length"
        class="flex h-[336px] items-center justify-center rounded-[1rem] bg-[var(--theme-surface-panel-subtle)] text-sm text-[var(--theme-text-tertiary)]"
      >
        <span v-if="loading">加载中…</span>
        <span v-else-if="error">延迟数据加载失败</span>
        <span v-else>暂无延迟数据</span>
      </div>

      <!-- 图表 -->
      <div
        v-else
        ref="wrapEl"
        class="relative w-full overflow-hidden rounded-[1rem] bg-[var(--chart-surface)]"
      >
        <svg
          ref="svgEl"
          :viewBox="`0 0 ${chartViewportWidth} ${CHART_H}`"
          preserveAspectRatio="xMidYMid meet"
          class="block h-[480px] w-full cursor-crosshair"
          @mousemove="onMouseMove"
          @mouseleave="onMouseLeave"
        >
          <!-- Defs for Gradient Fills -->
          <defs>
            <linearGradient
              v-for="s in series"
              :key="`grad-${s.task.id}`"
              :id="`grad-${s.task.id}`"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" :stop-color="s.color" stop-opacity="0.18" />
              <stop offset="100%" :stop-color="s.color" stop-opacity="0.0" />
            </linearGradient>
          </defs>

          <!-- 参考线 + Y 标签 -->
          <g v-for="lbl in yLabels" :key="lbl.y">
            <line
              :x1="PAD_L" :y1="lbl.y" :x2="chartViewportWidth - PAD_R" :y2="lbl.y"
              :stroke="'var(--chart-grid)'"
              stroke-opacity="0.75"
              stroke-width="1"
            />
          </g>

          <!-- X 轴标签 -->
          <text
            v-for="lbl in xLabels" :key="lbl.x"
            :x="lbl.x" :y="CHART_H - 6"
            :text-anchor="lbl.anchor" font-size="11" :fill="'var(--chart-axis)'"
            class="font-heading-en"
          >{{ lbl.label }}</text>

          <!-- 填充面积图 -->
          <path
            v-for="s in series"
            :key="`area-${s.task.id}`"
            v-show="s.visible"
            :d="getAreaPath(s)"
            :fill="`url(#grad-${s.task.id})`"
            class="transition-opacity duration-200"
          />

          <!-- 折线 -->
          <polyline
            v-for="s in series" :key="s.task.id"
            :points="s.polyline"
            :stroke="s.color"
            :stroke-width="s.visible ? 1.5 : 0"
            fill="none"
            stroke-linejoin="round"
            stroke-linecap="round"
            class="transition-all duration-200"
          />

          <!-- 竖线 crosshair -->
          <line
            v-if="tooltip"
            :x1="tooltip.svgX" y1="0"
            :x2="tooltip.svgX" :y2="CHART_H - PAD_B"
            :stroke="'var(--chart-crosshair)'"
            stroke-opacity="0.65"
            stroke-width="1"
            stroke-dasharray="4 3"
          />
        </svg>

        <!-- Y 轴标签 -->
        <div class="pointer-events-none absolute inset-y-0 left-0 z-10 w-14">
          <div
            v-for="lbl in yLabels"
            :key="`axis-${lbl.y}`"
            class="absolute left-0 rounded-sm bg-[color-mix(in_srgb,var(--theme-surface-page)_92%,transparent)] px-2 py-0.5 font-heading-en text-[13px] leading-none text-[var(--chart-axis)]"
            :style="{ top: `${lbl.topPx - 8}px` }"
          >
            {{ lbl.label }}
          </div>
        </div>

        <!-- HTML tooltip overlay -->
        <div
          v-if="tooltip"
          class="pointer-events-none absolute top-2 z-20 min-w-[160px] rounded-[1rem] border border-[var(--theme-divider)] bg-[var(--tooltip-surface)] px-3 py-2 shadow-[var(--surface-elevated-shadow)]"
          :style="tooltip.flip
            ? { right: `calc(100% - ${tooltip.leftPx}px + 8px)` }
            : { left: `${tooltip.leftPx + 8}px` }"
        >
          <p class="mb-1 font-body-zh text-caption text-[var(--theme-text-tertiary)]">{{ tooltip.timeLabel }}</p>
          <div v-for="item in tooltip.items" :key="item.name" class="flex items-center gap-1.5 text-sm">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: item.color }" />
            <span class="font-ui-mixed text-caption text-[var(--theme-text-secondary)]">{{ item.name }}</span>
            <span class="ml-auto pl-3 font-heading-en text-caption tabular-nums text-[var(--theme-text-primary)] font-semibold">{{ item.value.toFixed(1) }} ms</span>
          </div>
        </div>
      </div>

      <!-- Bottom Controls (Smooth switch and hide all) -->
      <div class="flex items-center justify-between bg-[var(--theme-surface-panel-subtle)] p-3 rounded-xl border border-[var(--theme-divider-subtle)] text-[12px] font-body-zh text-[var(--theme-text-secondary)]">
        <!-- Smooth Switch -->
        <button
          type="button"
          class="inline-flex items-center gap-2 transition-colors duration-200 hover:text-[var(--theme-text-primary)]"
          @click="smoothEnabled = !smoothEnabled"
        >
          <span class="relative h-4.5 w-8 rounded-[999px] transition-colors" :class="smoothEnabled ? 'bg-emerald-500' : 'bg-[var(--theme-divider-soft)]'">
            <span class="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" :class="smoothEnabled ? 'translate-x-3.5' : 'translate-x-0'" />
          </span>
          <span>平滑</span>
        </button>

        <!-- Hide all -->
        <button
          type="button"
          class="inline-flex items-center gap-1.5 transition-colors duration-200 hover:text-[var(--theme-text-primary)] font-medium"
          @click="toggleAllTasks"
        >
          <span>{{ isAllHidden ? '显示全部' : '隐藏全部' }}</span>
        </button>
      </div>

    </div>
  </div>
</template>
