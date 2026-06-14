<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes, formatPercent, formatUptime } from '@/lib/utils'
import type { NodeWithStatus } from '@/types/node'

const props = defineProps<{ data: NodeWithStatus }>()

const summarySections = computed(() => {
  const status = props.data.status
  const node = props.data.node

  if (!status) {
    return [
      { label: '系统', value: `${node.os}${node.arch ? ` [${node.arch}]` : ''}` },
      { label: 'CPU 型号', value: `${node.cpu_name} · ${node.cpu_cores} 核` },
      { label: '内存总量', value: formatBytes(node.mem_total, 2) },
      { label: '磁盘总量', value: formatBytes(node.disk_total, 2) },
      { label: '交换空间', value: formatBytes(node.swap_total, 2) },
      // 中文说明：未拿到实时状态时，流量摘要先回退为占位文案，保持字段结构稳定。
      { label: '流量情况', value: '↑ -- / ↓ --' },
      { label: '虚拟化', value: node.virtualization ? node.virtualization.toUpperCase() : '--' },
    ]
  }

  const diskTotal = status.disk_total ?? node.disk_total
  const ramTotal = status.ram_total ?? node.mem_total
  const swapTotal = status.swap_total ?? node.swap_total
  const diskPct = formatPercent(status.disk, diskTotal)
  const ramPct = formatPercent(status.ram, ramTotal)
  const swapPct = formatPercent(status.swap, swapTotal)

  return [
    { label: '系统', value: `${node.os}${node.arch ? ` [${node.arch}]` : ''}` },
    { label: '内核版本', value: node.kernel_version || '--' },
    { label: 'CPU 型号', value: `${node.cpu_name} · ${node.cpu_cores} 核` },
    { label: 'CPU 使用率', value: `${status.cpu.toFixed(2)}%` },
    { label: 'GPU 使用率', value: `${status.gpu.toFixed(2)}%` },
    { label: '负载均值', value: `${status.load.toFixed(2)} / ${status.load5.toFixed(2)} / ${status.load15.toFixed(2)}` },
    { label: '内存占用', value: `${formatBytes(status.ram, 2)} / ${formatBytes(ramTotal, 2)} (${ramPct.toFixed(2)}%)` },
    { label: '交换占用', value: `${formatBytes(status.swap, 2)} / ${formatBytes(swapTotal, 2)} (${swapPct.toFixed(2)}%)` },
    { label: '磁盘占用', value: `${formatBytes(status.disk, 2)} / ${formatBytes(diskTotal, 2)} (${diskPct.toFixed(2)}%)` },
    { label: '进程数', value: String(status.process) },
    { label: '连接数', value: `TCP ${status.connections} / UDP ${status.connections_udp}` },
    { label: '运行时长', value: status.uptime != null ? formatUptime(status.uptime) : '--' },
    { label: '最近活动', value: new Date(status.time).toLocaleString('zh-CN', { hour12: false }) },
    // 中文说明：节点摘要补充累计上传/下载流量，便于在详情区快速判断长期使用情况。
    { label: '流量情况', value: `↑ ${formatBytes(status.net_total_up, 1)} / ↓ ${formatBytes(status.net_total_down, 1)}` },
    { label: '虚拟化', value: node.virtualization ? node.virtualization.toUpperCase() : '--' },
  ]
})
</script>

<template>
  <!-- 中文说明：节点摘要直接融入详情页主版面，去掉外层卡片和额外内边距，减少层层包裹。 -->
  <div>
    <div class="border-b border-[var(--theme-divider-soft)] pb-3">
      <h3 class="font-body-zh text-subheading text-[var(--theme-text-primary)]">节点摘要</h3>
    </div>

    <div class="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="row in summarySections"
        :key="row.label"
        class="space-y-1 border-b border-[var(--theme-divider-subtle)] pb-3 last:border-b-0"
      >
        <p class="font-body-zh text-caption text-[var(--theme-text-tertiary)]">{{ row.label }}</p>
        <p class="font-ui-mixed text-ui break-words text-[var(--theme-text-primary)]">
          {{ row.value }}
        </p>
      </div>
    </div>
  </div>
</template>
