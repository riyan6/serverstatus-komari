import type { NodeWithStatus } from '@/types/node'
import {
  daysRemaining,
  formatBytes,
  formatPercent,
  formatSpeed,
  formatUptime,
  normalizeRegionCode,
} from '@/lib/utils'

export type DetailItem = {
  label: string
  value: string
}

export function statusLabel(row: NodeWithStatus): string {
  return row.online ? '在线' : '离线'
}

export function priceText(row: NodeWithStatus): string {
  // 中文说明：未设置价格时后端返回 0，这里按免费展示，更符合当前主题的节点语义。
  if (row.node.price <= 0) return 'FREE'

  const cycle = row.node.billing_cycle > 0 ? row.node.billing_cycle : 30
  const unit = cycle >= 365 ? '年' : cycle >= 90 ? '季' : '月'
  return `${row.node.currency || 'USD'} ${row.node.price}/${unit}`
}

export function regionText(row: NodeWithStatus): string {
  const code = normalizeRegionCode(row.node.region)
  return code || row.node.region || '-'
}

export function uptimeText(row: NodeWithStatus): string {
  if (!row.status?.online) return '-'
  return formatUptime(row.status.uptime ?? 0)
}

export function loadText(row: NodeWithStatus): string {
  if (!row.status?.online) return '-'
  return row.status.load.toFixed(2)
}

export function netSpeedText(row: NodeWithStatus): string {
  if (!row.status?.online) return '-'
  return `${formatSpeed(row.status.net_out)} | ${formatSpeed(row.status.net_in)}`
}

export function trafficText(row: NodeWithStatus): string {
  if (!row.status) return '-'

  const uploadText = formatBytes(row.status.net_total_up, 1)
  const downloadText = formatBytes(row.status.net_total_down, 1)
  return `${uploadText} | ${downloadText}`
}

export function cpuPercent(row: NodeWithStatus): number {
  return row.status?.online ? row.status.cpu : 0
}

export function memoryPercent(row: NodeWithStatus): number {
  return row.status ? formatPercent(row.status.ram, row.status.ram_total || row.node.mem_total) : 0
}

export function diskPercent(row: NodeWithStatus): number {
  return row.status ? formatPercent(row.status.disk, row.status.disk_total || row.node.disk_total) : 0
}

export function expiryText(row: NodeWithStatus): string {
  const remaining = daysRemaining(row.node.expired_at)

  // 中文说明：没有到期时间时按永久展示，避免表格里出现难以理解的空白值。
  if (remaining == null) return '永久'
  if (remaining < 0) return '0天'
  return `${remaining}天`
}

function trafficUsedBytes(row: NodeWithStatus): number | null {
  if (!row.status || row.node.traffic_limit <= 0) {
    return null
  }

  if (row.node.traffic_limit_type === 'max') {
    return Math.max(row.status.net_total_up, row.status.net_total_down)
  }

  return row.status.net_total_up + row.status.net_total_down
}

export function trafficLimitPercent(row: NodeWithStatus): number | null {
  const usedBytes = trafficUsedBytes(row)

  if (usedBytes == null || row.node.traffic_limit <= 0) {
    return null
  }

  return (usedBytes / row.node.traffic_limit) * 100
}

export function trafficLimitProgressPercent(row: NodeWithStatus): number {
  const trafficPercent = trafficLimitPercent(row)

  // 中文说明：不限量节点使用满进度展示，避免右侧流量列看起来像“0% 已用”。
  if (trafficPercent == null) {
    return 100
  }

  return trafficPercent
}

export function trafficLimitText(row: NodeWithStatus): string {
  const trafficPercent = trafficLimitPercent(row)

  if (trafficPercent == null) {
    return '∞'
  }

  return `${trafficPercent.toFixed(0)}%`
}

export function trafficLimitClass(row: NodeWithStatus): string {
  const trafficPercent = trafficLimitPercent(row)

  if (trafficPercent == null) return 'is-normal'
  if (trafficPercent >= 90) return 'is-danger'
  if (trafficPercent >= 70) return 'is-warning'
  return 'is-normal'
}

export function resourceClass(value: number): string {
  if (value >= 90) return 'is-danger'
  if (value >= 70) return 'is-warning'
  return 'is-normal'
}

export function progressStyle(value: number) {
  // 中文说明：进度宽度限制在 0-100%，避免异常接口值撑破表格。
  const width = Math.min(Math.max(value, 0), 100)
  return { width: `${width}%` }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function bootTimeText(row: NodeWithStatus): string {
  if (!row.status?.uptime) return '-'
  const baseTime = row.status.time ? new Date(row.status.time).getTime() : Date.now()
  return formatDateTime(new Date(baseTime - row.status.uptime * 1000).toISOString())
}

export function detailItems(row: NodeWithStatus): DetailItem[] {
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

export { normalizeRegionCode } from '@/lib/utils'
