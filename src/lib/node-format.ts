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
  // 中文说明：Komari 中 price 为负数或 0 时按免费展示，避免出现没有意义的账单金额。
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
  return `${formatBytes(row.status.net_total_up, 1)} | ${formatBytes(row.status.net_total_down, 1)}`
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

export function remainText(row: NodeWithStatus): string {
  const remaining = daysRemaining(row.node.expired_at)
  if (remaining == null) return '∞'
  if (remaining < 0) return '已过期'
  return `${remaining} 天`
}

export function remainingPercent(row: NodeWithStatus): number {
  const remaining = daysRemaining(row.node.expired_at)
  if (remaining == null) return 100
  if (remaining <= 0) return 100
  return Math.min((remaining / 365) * 100, 100)
}

export function remainingClass(row: NodeWithStatus): string {
  const remaining = daysRemaining(row.node.expired_at)
  if (remaining == null) return 'is-normal'
  if (remaining <= 30) return 'is-danger'
  if (remaining <= 90) return 'is-warning'
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
