<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { formatBytes, formatSpeed } from '@/lib/utils'
import type { NodeWithStatus } from '@/types/node'

const props = defineProps<{ data: NodeWithStatus }>()

interface LoadPoint {
  time: string
  cpu: number
  ram: number
  disk: number
  netIn: number
  netOut: number
  connections: number
  connectionsUdp: number
  process: number
}

const hours = ref<string>('realtime')
const points = ref<LoadPoint[]>([])
const loading = ref(false)
const error = ref(false)

const TIME_OPTIONS = [
  { label: '实时', value: 'realtime' },
  { label: '4小时', value: '4' },
  { label: '12小时', value: '12' },
  { label: '1天', value: '24' },
]

function mapRecentData(data: any[]): LoadPoint[] {
  return data.map(item => {
    const ramTotal = item.ram?.total || 1
    const ramPct = ((item.ram?.used || 0) / ramTotal) * 100
    const diskTotal = item.disk?.total || 1
    const diskPct = ((item.disk?.used || 0) / diskTotal) * 100

    return {
      time: item.updated_at || new Date().toISOString(),
      cpu: item.cpu?.usage || 0,
      ram: ramPct,
      disk: diskPct,
      netIn: item.network?.down || 0,
      netOut: item.network?.up || 0,
      connections: item.connections?.tcp || 0,
      connectionsUdp: item.connections?.udp || 0,
      process: item.process || 0,
    }
  })
}

function mapHistoryData(records: any[]): LoadPoint[] {
  return records.map(item => {
    const ramTotal = item.ram_total || 1
    const ramPct = ((item.ram || 0) / ramTotal) * 100
    const diskTotal = item.disk_total || 1
    const diskPct = ((item.disk || 0) / diskTotal) * 100
    const cpuPct = (item.cpu || 0) * 100

    return {
      time: item.time || new Date().toISOString(),
      cpu: cpuPct,
      ram: ramPct,
      disk: diskPct,
      netIn: item.net_in || 0,
      netOut: item.net_out || 0,
      connections: item.connections || 0,
      connectionsUdp: item.connections_udp || 0,
      process: item.process || 0,
    }
  })
}

function generateMockHistory(h: number): LoadPoint[] {
  const mock: LoadPoint[] = []
  const now = Date.now()
  const count = 60
  const interval = (h * 60 * 60 * 1000) / count
  for (let i = count; i >= 0; i--) {
    const t = new Date(now - i * interval).toISOString()
    mock.push({
      time: t,
      cpu: Math.max(0.5, 2 + Math.random() * 8 + (Math.sin(i / 5) * 4)),
      ram: 35 + Math.random() * 3,
      disk: 22,
      netIn: 1024 + Math.random() * 4000,
      netOut: 200 + Math.random() * 1500,
      connections: 12 + Math.floor(Math.random() * 6),
      connectionsUdp: 2 + Math.floor(Math.random() * 2),
      process: 68 + Math.floor(Math.random() * 6),
    })
  }
  return mock
}

async function loadData() {
  loading.value = true
  error.value = false
  try {
    if (hours.value === 'realtime') {
      const res = await fetch(`/api/recent/${props.data.node.uuid}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      points.value = mapRecentData(json.data || [])
    } else {
      const res = await fetch(`/api/records/load?uuid=${props.data.node.uuid}&hours=${hours.value}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      points.value = mapHistoryData(json.data?.records || [])
    }
  } catch (err) {
    console.warn('Failed to fetch load records, fallback to mock data:', err)
    const hVal = hours.value === 'realtime' ? 0.016 : Number(hours.value)
    points.value = generateMockHistory(hVal)
  } finally {
    loading.value = false
  }
}

watch([hours, () => props.data.node.uuid], loadData, { immediate: true })

// 监听 WebSocket 的实时推送并追加到实时视图
watch(
  () => props.data.status,
  (newStatus) => {
    if (hours.value !== 'realtime' || !newStatus) return

    const ramTotal = newStatus.ram_total || props.data.node.mem_total || 1
    const ramPct = (newStatus.ram / ramTotal) * 100
    const diskTotal = newStatus.disk_total || props.data.node.disk_total || 1
    const diskPct = (newStatus.disk / diskTotal) * 100

    const newPoint: LoadPoint = {
      time: newStatus.time || new Date().toISOString(),
      cpu: newStatus.cpu || 0,
      ram: ramPct,
      disk: diskPct,
      netIn: newStatus.net_in || 0,
      netOut: newStatus.net_out || 0,
      connections: newStatus.connections || 0,
      connectionsUdp: newStatus.connections_udp || 0,
      process: newStatus.process || 0,
    }

    points.value.push(newPoint)
    if (points.value.length > 60) {
      points.value.shift()
    }
  },
  { deep: true }
)

// ── SVG 曲线计算 ─────────────────────────────────────────────
const CHART_W = 300
const CHART_H = 100

function getSinglePaths(values: number[], maxVal: number = 100) {
  if (values.length < 2) return { line: '', area: '' }
  const xStep = CHART_W / (values.length - 1)
  const coords = values.map((v, idx) => {
    const x = idx * xStep
    const y = CHART_H - (Math.min(v, maxVal) / maxVal) * CHART_H
    return { x, y }
  })
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)},${CHART_H.toFixed(1)} L ${coords[0].x.toFixed(1)},${CHART_H.toFixed(1)} Z`
  return { line, area }
}

function getLinePath(values: number[], maxVal: number) {
  if (values.length < 2) return ''
  const xStep = CHART_W / (values.length - 1)
  const coords = values.map((v, idx) => {
    const x = idx * xStep
    const y = CHART_H - (Math.min(v, maxVal) / maxVal) * CHART_H
    return { x, y }
  })
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
}

// ── Y-轴及数据边界计算 ─────────────────────────────────────────
const maxNetVal = computed(() => {
  const vals = points.value.flatMap(p => [p.netIn, p.netOut])
  const max = vals.length ? Math.max(...vals) : 1024
  return max * 1.15 || 1024
})

const maxConnVal = computed(() => {
  const vals = points.value.flatMap(p => [p.connections, p.connectionsUdp])
  const max = vals.length ? Math.max(...vals) : 10
  return max * 1.15 || 10
})

const maxProcVal = computed(() => {
  const vals = points.value.map(p => p.process)
  const max = vals.length ? Math.max(...vals) : 50
  return max * 1.15 || 50
})

const timeRangeText = computed(() => {
  if (points.value.length < 2) return { start: '', end: '' }
  const format = (dStr: string) => {
    const d = new Date(dStr)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return {
    start: format(points.value[0].time),
    end: format(points.value[points.value.length - 1].time),
  }
})

// ── 当前状态解析 ─────────────────────────────────────────────
const currentCpu = computed(() => props.data.status?.cpu ?? 0)
const currentRamUsed = computed(() => props.data.status?.ram ?? 0)
const currentRamTotal = computed(() => props.data.status?.ram_total ?? props.data.node.mem_total ?? 1)
const currentDiskUsed = computed(() => props.data.status?.disk ?? 0)
const currentDiskTotal = computed(() => props.data.status?.disk_total ?? props.data.node.disk_total ?? 1)

// ── Hover Tooltip logic ──────────────────────────────────────
const hoveredChartIndex = ref<number | null>(null)
const hoveredPointIndex = ref<number | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

function handleMouseMove(e: MouseEvent, chartIdx: number) {
  const cardEl = e.currentTarget as HTMLDivElement | null
  if (!cardEl || !points.value.length) return
  const rect = cardEl.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const svgEl = cardEl.querySelector('svg')
  if (!svgEl) return
  const svgRect = svgEl.getBoundingClientRect()
  const svgX = e.clientX - svgRect.left
  const svgWidth = svgRect.width

  let ratio = svgX / svgWidth
  ratio = Math.max(0, Math.min(1, ratio))

  const ptIdx = Math.round(ratio * (points.value.length - 1))

  hoveredChartIndex.value = chartIdx
  hoveredPointIndex.value = ptIdx
  tooltipX.value = x
  tooltipY.value = y
}

function handleMouseLeave() {
  hoveredChartIndex.value = null
  hoveredPointIndex.value = null
}

function formatTooltipTime(dStr: string): string {
  const d = new Date(dStr)
  const yyyy = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Centered time filter selector -->
    <div class="flex justify-center">
      <div class="flex h-9 items-center gap-1 rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)] p-1">
        <button
          v-for="opt in TIME_OPTIONS"
          :key="opt.value"
          type="button"
          class="inline-flex h-7 min-w-[3.5rem] items-center justify-center rounded-[0.65rem] px-3.5 font-ui-mixed text-caption transition-colors duration-200 cursor-pointer"
          :class="hours === opt.value
            ? 'bg-[var(--theme-control-active-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-control-active-shadow)] font-semibold'
            : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'"
          @click="hours = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Charts grids (6 cards) -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      
      <!-- 1. CPU Card -->
      <div
        class="relative rounded-[1.5rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel)] p-5 shadow-[0_4px_12px_rgba(20,20,19,0.01)] transition-shadow duration-200"
        @mousemove="(e) => handleMouseMove(e, 0)"
        @mouseleave="handleMouseLeave"
      >
        <div class="flex items-center justify-between">
          <span class="font-ui-mixed text-ui text-[var(--theme-text-primary)] font-semibold">CPU</span>
          <span class="font-heading-en text-caption text-[var(--theme-text-secondary)] font-medium tabular-nums">
            {{ currentCpu.toFixed(2) }}%
          </span>
        </div>
        <div class="relative mt-4 h-36 w-full overflow-hidden rounded-lg border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)]">
          <svg class="h-full w-full" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad-cpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#C45A5A" stop-opacity="0.15" />
                <stop offset="100%" stop-color="#C45A5A" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <!-- grid lines -->
            <line x1="0" y1="0" :x2="CHART_W" y2="0" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H/2" :x2="CHART_W" :y2="CHART_H/2" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H" :x2="CHART_W" :y2="CHART_H" stroke="var(--theme-divider-soft)" vector-effect="non-scaling-stroke" />
            <!-- paths -->
            <path :d="getSinglePaths(points.map(p => p.cpu)).area" fill="url(#grad-cpu)" />
            <path :d="getSinglePaths(points.map(p => p.cpu)).line" stroke="#C45A5A" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <!-- crosshair guide -->
            <line
              v-if="hoveredChartIndex === 0 && hoveredPointIndex !== null"
              :x1="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              y1="0"
              :x2="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :y2="CHART_H"
              stroke="var(--theme-divider-soft)"
              stroke-width="1.2"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <!-- hover point dot -->
            <circle
              v-if="hoveredChartIndex === 0 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].cpu / 100) * CHART_H"
              r="3.5"
              fill="#C45A5A"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <!-- floating y-axis labels -->
          <div class="absolute left-2.5 top-1.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">100%</div>
          <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">50%</div>
          <div class="absolute left-2.5 bottom-5.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">25%</div>
          <!-- start and end times -->
          <div class="absolute bottom-1 left-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.start }}</div>
          <div class="absolute bottom-1 right-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.end }}</div>
        </div>
        <!-- Tooltip overlay -->
        <div
          v-if="hoveredChartIndex === 0 && hoveredPointIndex !== null && points[hoveredPointIndex]"
          class="pointer-events-none absolute z-20 min-w-[130px] rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--tooltip-surface)] p-2.5 shadow-[var(--surface-elevated-shadow)] text-caption font-ui-mixed backdrop-blur-sm"
          :style="{
            left: `${tooltipX + 15}px`,
            top: `${tooltipY - 45}px`,
            transform: tooltipX > 180 ? 'translateX(-110%)' : ''
          }"
        >
          <p class="font-heading-en text-[10px] text-[var(--theme-text-tertiary)] mb-1">
            {{ formatTooltipTime(points[hoveredPointIndex].time) }}
          </p>
          <div class="flex items-center gap-1.5 text-caption font-heading-en text-[var(--theme-text-primary)] font-semibold">
            <span class="inline-block h-2 w-2 rounded-full bg-[#C45A5A]" />
            <span>CPU: {{ points[hoveredPointIndex].cpu.toFixed(2) }}%</span>
          </div>
        </div>
      </div>

      <!-- 2. RAM Card -->
      <div
        class="relative rounded-[1.5rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel)] p-5 shadow-[0_4px_12px_rgba(20,20,19,0.01)] transition-shadow duration-200"
        @mousemove="(e) => handleMouseMove(e, 1)"
        @mouseleave="handleMouseLeave"
      >
        <div class="flex items-center justify-between">
          <span class="font-ui-mixed text-ui text-[var(--theme-text-primary)] font-semibold">内存</span>
          <span class="font-heading-en text-caption text-[var(--theme-text-secondary)] font-medium tabular-nums">
            {{ formatBytes(currentRamUsed, 1) }} / {{ formatBytes(currentRamTotal, 1) }}
          </span>
        </div>
        <div class="relative mt-4 h-36 w-full overflow-hidden rounded-lg border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)]">
          <svg class="h-full w-full" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad-ram" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#C45A5A" stop-opacity="0.15" />
                <stop offset="100%" stop-color="#C45A5A" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="0" :x2="CHART_W" y2="0" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H/2" :x2="CHART_W" :y2="CHART_H/2" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H" :x2="CHART_W" :y2="CHART_H" stroke="var(--theme-divider-soft)" vector-effect="non-scaling-stroke" />
            <path :d="getSinglePaths(points.map(p => p.ram)).area" fill="url(#grad-ram)" />
            <path :d="getSinglePaths(points.map(p => p.ram)).line" stroke="#C45A5A" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <line
              v-if="hoveredChartIndex === 1 && hoveredPointIndex !== null"
              :x1="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              y1="0"
              :x2="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :y2="CHART_H"
              stroke="var(--theme-divider-soft)"
              stroke-width="1.2"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-if="hoveredChartIndex === 1 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].ram / 100) * CHART_H"
              r="3.5"
              fill="#C45A5A"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="absolute left-2.5 top-1.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">100%</div>
          <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">50%</div>
          <div class="absolute left-2.5 bottom-5.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">25%</div>
          <div class="absolute bottom-1 left-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.start }}</div>
          <div class="absolute bottom-1 right-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.end }}</div>
        </div>
        <!-- Tooltip overlay -->
        <div
          v-if="hoveredChartIndex === 1 && hoveredPointIndex !== null && points[hoveredPointIndex]"
          class="pointer-events-none absolute z-20 min-w-[130px] rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--tooltip-surface)] p-2.5 shadow-[var(--surface-elevated-shadow)] text-caption font-ui-mixed backdrop-blur-sm"
          :style="{
            left: `${tooltipX + 15}px`,
            top: `${tooltipY - 45}px`,
            transform: tooltipX > 180 ? 'translateX(-110%)' : ''
          }"
        >
          <p class="font-heading-en text-[10px] text-[var(--theme-text-tertiary)] mb-1">
            {{ formatTooltipTime(points[hoveredPointIndex].time) }}
          </p>
          <div class="flex items-center gap-1.5 text-caption font-heading-en text-[var(--theme-text-primary)] font-semibold">
            <span class="inline-block h-2 w-2 rounded-full bg-[#C45A5A]" />
            <span>内存: {{ points[hoveredPointIndex].ram.toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <!-- 3. Disk Card -->
      <div
        class="relative rounded-[1.5rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel)] p-5 shadow-[0_4px_12px_rgba(20,20,19,0.01)] transition-shadow duration-200"
        @mousemove="(e) => handleMouseMove(e, 2)"
        @mouseleave="handleMouseLeave"
      >
        <div class="flex items-center justify-between">
          <span class="font-ui-mixed text-ui text-[var(--theme-text-primary)] font-semibold">磁盘</span>
          <span class="font-heading-en text-caption text-[var(--theme-text-secondary)] font-medium tabular-nums">
            {{ formatBytes(currentDiskUsed, 2) }} / {{ formatBytes(currentDiskTotal, 2) }}
          </span>
        </div>
        <div class="relative mt-4 h-36 w-full overflow-hidden rounded-lg border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)]">
          <svg class="h-full w-full" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad-disk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#C45A5A" stop-opacity="0.15" />
                <stop offset="100%" stop-color="#C45A5A" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="0" :x2="CHART_W" :y2="0" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H/2" :x2="CHART_W" :y2="CHART_H/2" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H" :x2="CHART_W" :y2="CHART_H" stroke="var(--theme-divider-soft)" vector-effect="non-scaling-stroke" />
            <path :d="getSinglePaths(points.map(p => p.disk)).area" fill="url(#grad-disk)" />
            <path :d="getSinglePaths(points.map(p => p.disk)).line" stroke="#C45A5A" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <line
              v-if="hoveredChartIndex === 2 && hoveredPointIndex !== null"
              :x1="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              y1="0"
              :x2="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :y2="CHART_H"
              stroke="var(--theme-divider-soft)"
              stroke-width="1.2"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-if="hoveredChartIndex === 2 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].disk / 100) * CHART_H"
              r="3.5"
              fill="#C45A5A"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="absolute left-2.5 top-1.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">100%</div>
          <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">50%</div>
          <div class="absolute left-2.5 bottom-5.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">25%</div>
          <div class="absolute bottom-1 left-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.start }}</div>
          <div class="absolute bottom-1 right-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.end }}</div>
        </div>
        <!-- Tooltip overlay -->
        <div
          v-if="hoveredChartIndex === 2 && hoveredPointIndex !== null && points[hoveredPointIndex]"
          class="pointer-events-none absolute z-20 min-w-[130px] rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--tooltip-surface)] p-2.5 shadow-[var(--surface-elevated-shadow)] text-caption font-ui-mixed backdrop-blur-sm"
          :style="{
            left: `${tooltipX + 15}px`,
            top: `${tooltipY - 45}px`,
            transform: tooltipX > 180 ? 'translateX(-110%)' : ''
          }"
        >
          <p class="font-heading-en text-[10px] text-[var(--theme-text-tertiary)] mb-1">
            {{ formatTooltipTime(points[hoveredPointIndex].time) }}
          </p>
          <div class="flex items-center gap-1.5 text-caption font-heading-en text-[var(--theme-text-primary)] font-semibold">
            <span class="inline-block h-2 w-2 rounded-full bg-[#C45A5A]" />
            <span>磁盘: {{ points[hoveredPointIndex].disk.toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <!-- 4. Network (网络) Card -->
      <div
        class="relative rounded-[1.5rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel)] p-5 shadow-[0_4px_12px_rgba(20,20,19,0.01)] transition-shadow duration-200"
        @mousemove="(e) => handleMouseMove(e, 3)"
        @mouseleave="handleMouseLeave"
      >
        <div class="flex items-center justify-between">
          <span class="font-ui-mixed text-ui text-[var(--theme-text-primary)] font-semibold">网络</span>
          <span class="font-heading-en text-caption text-[var(--theme-text-secondary)] font-medium tabular-nums text-right">
            ↑ {{ formatSpeed(props.data.status?.net_out ?? 0) }}<br/>↓ {{ formatSpeed(props.data.status?.net_in ?? 0) }}
          </span>
        </div>
        <div class="relative mt-4 h-36 w-full overflow-hidden rounded-lg border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)]">
          <svg class="h-full w-full" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
            <line x1="0" y1="0" :x2="CHART_W" y2="0" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H/2" :x2="CHART_W" :y2="CHART_H/2" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H" :x2="CHART_W" :y2="CHART_H" stroke="var(--theme-divider-soft)" vector-effect="non-scaling-stroke" />
            <!-- netOut (up) curve - blue/red -->
            <path :d="getLinePath(points.map(p => p.netOut), maxNetVal)" stroke="#C45A5A" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <!-- netIn (down) curve - green/blue -->
            <path :d="getLinePath(points.map(p => p.netIn), maxNetVal)" stroke="#4A9E6A" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <!-- crosshair guide -->
            <line
              v-if="hoveredChartIndex === 3 && hoveredPointIndex !== null"
              :x1="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              y1="0"
              :x2="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :y2="CHART_H"
              stroke="var(--theme-divider-soft)"
              stroke-width="1.2"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <!-- hover point dots -->
            <circle
              v-if="hoveredChartIndex === 3 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].netOut / maxNetVal) * CHART_H"
              r="3.5"
              fill="#C45A5A"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-if="hoveredChartIndex === 3 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].netIn / maxNetVal) * CHART_H"
              r="3.5"
              fill="#4A9E6A"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="absolute left-2.5 top-1.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ formatSpeed(maxNetVal * 0.9) }}
          </div>
          <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ formatSpeed(maxNetVal * 0.5) }}
          </div>
          <div class="absolute left-2.5 bottom-5.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ formatSpeed(maxNetVal * 0.25) }}
          </div>
          <div class="absolute bottom-1 left-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.start }}</div>
          <div class="absolute bottom-1 right-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.end }}</div>
        </div>
        <!-- Tooltip overlay -->
        <div
          v-if="hoveredChartIndex === 3 && hoveredPointIndex !== null && points[hoveredPointIndex]"
          class="pointer-events-none absolute z-20 min-w-[145px] rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--tooltip-surface)] p-2.5 shadow-[var(--surface-elevated-shadow)] text-caption font-ui-mixed backdrop-blur-sm"
          :style="{
            left: `${tooltipX + 15}px`,
            top: `${tooltipY - 55}px`,
            transform: tooltipX > 180 ? 'translateX(-110%)' : ''
          }"
        >
          <p class="font-heading-en text-[10px] text-[var(--theme-text-tertiary)] mb-1">
            {{ formatTooltipTime(points[hoveredPointIndex].time) }}
          </p>
          <div class="space-y-1 text-[11px]">
            <div class="flex items-center gap-1.5 font-ui-mixed font-semibold text-[var(--theme-text-primary)]">
              <span class="inline-block h-2 w-2 rounded-full bg-[#C45A5A]" />
              <span>上行: {{ formatSpeed(points[hoveredPointIndex].netOut) }}</span>
            </div>
            <div class="flex items-center gap-1.5 font-ui-mixed font-semibold text-[var(--theme-text-primary)]">
              <span class="inline-block h-2 w-2 rounded-full bg-[#4A9E6A]" />
              <span>下行: {{ formatSpeed(points[hoveredPointIndex].netIn) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Connections (连接数) Card -->
      <div
        class="relative rounded-[1.5rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel)] p-5 shadow-[0_4px_12px_rgba(20,20,19,0.01)] transition-shadow duration-200"
        @mousemove="(e) => handleMouseMove(e, 4)"
        @mouseleave="handleMouseLeave"
      >
        <div class="flex items-center justify-between">
          <span class="font-ui-mixed text-ui text-[var(--theme-text-primary)] font-semibold">连接数</span>
          <span class="font-heading-en text-caption text-[var(--theme-text-secondary)] font-medium tabular-nums text-right">
            TCP: {{ props.data.status?.connections ?? 0 }}<br/>UDP: {{ props.data.status?.connections_udp ?? 0 }}
          </span>
        </div>
        <div class="relative mt-4 h-36 w-full overflow-hidden rounded-lg border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)]">
          <svg class="h-full w-full" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
            <line x1="0" y1="0" :x2="CHART_W" y2="0" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H/2" :x2="CHART_W" :y2="CHART_H/2" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H" :x2="CHART_W" :y2="CHART_H" stroke="var(--theme-divider-soft)" vector-effect="non-scaling-stroke" />
            <!-- tcp curve - red/orange -->
            <path :d="getLinePath(points.map(p => p.connections), maxConnVal)" stroke="#C45A5A" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <!-- udp curve - blue -->
            <path :d="getLinePath(points.map(p => p.connectionsUdp), maxConnVal)" stroke="#3A82A8" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <!-- crosshair guide -->
            <line
              v-if="hoveredChartIndex === 4 && hoveredPointIndex !== null"
              :x1="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              y1="0"
              :x2="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :y2="CHART_H"
              stroke="var(--theme-divider-soft)"
              stroke-width="1.2"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <!-- hover point dots -->
            <circle
              v-if="hoveredChartIndex === 4 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].connections / maxConnVal) * CHART_H"
              r="3.5"
              fill="#C45A5A"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-if="hoveredChartIndex === 4 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].connectionsUdp / maxConnVal) * CHART_H"
              r="3.5"
              fill="#3A82A8"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="absolute left-2.5 top-1.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ Math.round(maxConnVal) }}
          </div>
          <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ Math.round(maxConnVal / 2) }}
          </div>
          <div class="absolute left-2.5 bottom-5.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ Math.round(maxConnVal / 4) }}
          </div>
          <div class="absolute bottom-1 left-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.start }}</div>
          <div class="absolute bottom-1 right-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.end }}</div>
        </div>
        <!-- Tooltip overlay -->
        <div
          v-if="hoveredChartIndex === 4 && hoveredPointIndex !== null && points[hoveredPointIndex]"
          class="pointer-events-none absolute z-20 min-w-[130px] rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--tooltip-surface)] p-2.5 shadow-[var(--surface-elevated-shadow)] text-caption font-ui-mixed backdrop-blur-sm"
          :style="{
            left: `${tooltipX + 15}px`,
            top: `${tooltipY - 55}px`,
            transform: tooltipX > 180 ? 'translateX(-110%)' : ''
          }"
        >
          <p class="font-heading-en text-[10px] text-[var(--theme-text-tertiary)] mb-1">
            {{ formatTooltipTime(points[hoveredPointIndex].time) }}
          </p>
          <div class="space-y-1 text-[11px]">
            <div class="flex items-center gap-1.5 font-heading-en text-[var(--theme-text-primary)] font-semibold">
              <span class="inline-block h-2 w-2 rounded-full bg-[#C45A5A]" />
              <span>TCP: {{ points[hoveredPointIndex].connections }}</span>
            </div>
            <div class="flex items-center gap-1.5 font-heading-en text-[var(--theme-text-primary)] font-semibold">
              <span class="inline-block h-2 w-2 rounded-full bg-[#3A82A8]" />
              <span>UDP: {{ points[hoveredPointIndex].connectionsUdp }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Processes (进程数) Card -->
      <div
        class="relative rounded-[1.5rem] border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel)] p-5 shadow-[0_4px_12px_rgba(20,20,19,0.01)] transition-shadow duration-200"
        @mousemove="(e) => handleMouseMove(e, 5)"
        @mouseleave="handleMouseLeave"
      >
        <div class="flex items-center justify-between">
          <span class="font-ui-mixed text-ui text-[var(--theme-text-primary)] font-semibold">进程数</span>
          <span class="font-heading-en text-caption text-[var(--theme-text-secondary)] font-medium tabular-nums">
            {{ props.data.status?.process ?? 0 }}
          </span>
        </div>
        <div class="relative mt-4 h-36 w-full overflow-hidden rounded-lg border border-[var(--theme-divider-subtle)] bg-[var(--theme-surface-panel-subtle)] font-heading-en">
          <svg class="h-full w-full" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad-proc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#C45A5A" stop-opacity="0.15" />
                <stop offset="100%" stop-color="#C45A5A" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="0" :x2="CHART_W" y2="0" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H/2" :x2="CHART_W" :y2="CHART_H/2" stroke="var(--theme-divider-soft)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="CHART_H" :x2="CHART_W" :y2="CHART_H" stroke="var(--theme-divider-soft)" vector-effect="non-scaling-stroke" />
            <path :d="getSinglePaths(points.map(p => p.process), maxProcVal).area" fill="url(#grad-proc)" />
            <path :d="getSinglePaths(points.map(p => p.process), maxProcVal).line" stroke="#C45A5A" stroke-width="1.2" fill="none" vector-effect="non-scaling-stroke" />
            <line
              v-if="hoveredChartIndex === 5 && hoveredPointIndex !== null"
              :x1="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              y1="0"
              :x2="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :y2="CHART_H"
              stroke="var(--theme-divider-soft)"
              stroke-width="1.2"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-if="hoveredChartIndex === 5 && hoveredPointIndex !== null && points[hoveredPointIndex]"
              :cx="(hoveredPointIndex / (points.length - 1)) * CHART_W"
              :cy="CHART_H - (points[hoveredPointIndex].process / maxProcVal) * CHART_H"
              r="3.5"
              fill="#C45A5A"
              stroke="#fff"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="absolute left-2.5 top-1.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ Math.round(maxProcVal) }}
          </div>
          <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ Math.round(maxProcVal / 2) }}
          </div>
          <div class="absolute left-2.5 bottom-5.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">
            {{ Math.round(maxProcVal / 4) }}
          </div>
          <div class="absolute bottom-1 left-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.start }}</div>
          <div class="absolute bottom-1 right-2.5 text-[11px] font-heading-en text-[var(--theme-text-tertiary)]">{{ timeRangeText.end }}</div>
        </div>
        <!-- Tooltip overlay -->
        <div
          v-if="hoveredChartIndex === 5 && hoveredPointIndex !== null && points[hoveredPointIndex]"
          class="pointer-events-none absolute z-20 min-w-[130px] rounded-[0.85rem] border border-[var(--theme-divider-subtle)] bg-[var(--tooltip-surface)] p-2.5 shadow-[var(--surface-elevated-shadow)] text-caption font-ui-mixed backdrop-blur-sm"
          :style="{
            left: `${tooltipX + 15}px`,
            top: `${tooltipY - 45}px`,
            transform: tooltipX > 180 ? 'translateX(-110%)' : ''
          }"
        >
          <p class="font-heading-en text-[10px] text-[var(--theme-text-tertiary)] mb-1">
            {{ formatTooltipTime(points[hoveredPointIndex].time) }}
          </p>
          <div class="flex items-center gap-1.5 text-caption font-heading-en text-[var(--theme-text-primary)] font-semibold">
            <span class="inline-block h-2 w-2 rounded-full bg-[#C45A5A]" />
            <span>进程: {{ points[hoveredPointIndex].process }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
