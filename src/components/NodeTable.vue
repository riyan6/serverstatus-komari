<script setup lang="ts">
import { ref } from 'vue'
import { cleanNodeName, formatBytes, formatSpeed, formatUptime, formatPercent, formatOsName } from '@/lib/utils'
import NodeDetail from '@/components/NodeDetail.vue'
import type { NodeWithStatus } from '@/types/node'

defineProps<{
  nodes: NodeWithStatus[]
}>()

const expanded = ref<Record<string, boolean>>({})

function toggle(uuid: string) {
  expanded.value[uuid] = !expanded.value[uuid]
}

function cpuPercent(n: NodeWithStatus) {
  return n.status?.cpu ?? 0
}

function memPercent(n: NodeWithStatus) {
  return formatPercent(n.status?.ram ?? 0, n.status?.ram_total ?? n.node.mem_total)
}

function diskPercent(n: NodeWithStatus) {
  return formatPercent(n.status?.disk ?? 0, n.status?.disk_total ?? n.node.disk_total)
}

function progressColor(value: number): string {
  if (value >= 90) return 'bg-red-500'
  if (value >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function progressWidth(value: number): string {
  return `${Math.min(Math.max(value, 0), 100)}%`
}

function netSpeed(n: NodeWithStatus) {
  return { up: formatSpeed(n.status?.net_out ?? 0), down: formatSpeed(n.status?.net_in ?? 0) }
}

function netTotal(n: NodeWithStatus) {
  return { up: formatBytes(n.status?.net_total_up ?? 0, 1), down: formatBytes(n.status?.net_total_down ?? 0, 1) }
}

function uptimeText(n: NodeWithStatus) {
  if (!n.status) return '—'
  return formatUptime(n.status.uptime ?? 0)
}

function loadText(n: NodeWithStatus) {
  if (!n.status) return '—'
  return n.status.load.toFixed(2)
}
</script>

<template>
  <div class="w-full overflow-x-auto rounded-lg border border-border">
    <table class="w-full text-base">
      <thead>
        <tr class="border-b border-border bg-muted/50">
          <th class="py-3 pl-4 pr-3 text-left font-medium text-muted-foreground whitespace-nowrap">节点</th>
          <th class="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">地区</th>
          <th class="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">系统</th>
          <th class="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">在线</th>
          <th class="px-3 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">负载</th>
          <th class="px-3 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">网络 ↑↓</th>
          <th class="px-3 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">总流量 ↑↓</th>
          <th class="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap w-40">CPU</th>
          <th class="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap w-40">内存</th>
          <th class="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap w-40">硬盘</th>
        </tr>
      </thead>
      <tbody>
        <template
          v-for="n in nodes"
          :key="n.node.uuid"
        >
          <!-- 主行 -->
          <tr
            class="border-b border-border transition-colors hover:bg-muted/40 cursor-pointer"
            :class="[!n.online ? 'opacity-50' : '', expanded[n.node.uuid] ? 'bg-muted/20' : '']"
            @click="toggle(n.node.uuid)"
          >
          <!-- 节点名 + 状态 -->
          <td class="py-3 pl-4 pr-3 whitespace-nowrap">
            <div class="flex items-center gap-2">
              <span
                class="inline-block h-3 w-3 shrink-0 rounded-full"
                :class="n.online ? 'bg-emerald-500' : 'bg-rose-400'"
              />
              <span class="font-medium text-foreground">{{ cleanNodeName(n.node.name) }}</span>
            </div>
          </td>

          <!-- 地区 -->
          <td class="px-3 py-3 whitespace-nowrap text-lg leading-none">
            {{ n.node.region }}
          </td>

          <!-- 系统 -->
          <td class="px-3 py-3 whitespace-nowrap text-muted-foreground">
            {{ formatOsName(n.node.os) }}
          </td>

          <!-- 在线时长 -->
          <td class="px-3 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
            {{ uptimeText(n) }}
          </td>

          <!-- 负载 -->
          <td class="px-3 py-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">
            {{ loadText(n) }}
          </td>

          <!-- 网速 -->
          <td class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-muted-foreground">
            <span class="text-[var(--theme-accent-clay-primary)] font-bold">↑</span> {{ netSpeed(n).up }} <span class="text-[var(--theme-accent-clay-primary)] font-bold">↓</span> {{ netSpeed(n).down }}
          </td>

          <!-- 总流量 -->
          <td class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-muted-foreground">
            <span class="text-[var(--theme-accent-clay-primary)] font-bold">↑</span> {{ netTotal(n).up }} <span class="text-[var(--theme-accent-clay-primary)] font-bold">↓</span> {{ netTotal(n).down }}
          </td>

          <!-- CPU -->
          <td class="px-3 py-3 w-40">
            <div class="flex items-center gap-2">
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="progressColor(cpuPercent(n))"
                  :style="{ width: progressWidth(cpuPercent(n)) }"
                />
              </div>
              <span class="w-12 shrink-0 text-right tabular-nums text-sm text-muted-foreground">
                {{ cpuPercent(n).toFixed(1) }}%
              </span>
            </div>
          </td>

          <!-- 内存 -->
          <td class="px-3 py-3 w-40">
            <div class="flex items-center gap-2">
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="progressColor(memPercent(n))"
                  :style="{ width: progressWidth(memPercent(n)) }"
                />
              </div>
              <span class="w-12 shrink-0 text-right tabular-nums text-sm text-muted-foreground">
                {{ memPercent(n).toFixed(1) }}%
              </span>
            </div>
          </td>

          <!-- 硬盘 -->
          <td class="px-3 py-3 w-40">
            <div class="flex items-center gap-2">
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="progressColor(diskPercent(n))"
                  :style="{ width: progressWidth(diskPercent(n)) }"
                />
              </div>
              <span class="w-12 shrink-0 text-right tabular-nums text-sm text-muted-foreground">
                {{ diskPercent(n).toFixed(1) }}%
              </span>
            </div>
          </td>
          </tr>

          <!-- 展开行 -->
          <tr
            v-if="expanded[n.node.uuid]"
            class="border-b border-border bg-muted/10"
          >
            <td colspan="10" class="p-0">
              <NodeDetail :data="n" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
