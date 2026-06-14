/** Node static info from GET /api/nodes */
export interface Node {
  uuid: string
  name: string
  cpu_name: string
  virtualization: string
  arch: string
  cpu_cores: number
  os: string
  kernel_version: string
  gpu_name: string
  region: string
  mem_total: number
  swap_total: number
  disk_total: number
  weight: number
  price: number
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  expired_at: string | null
  group: string
  tags: string
  // 中文说明：真实 `/api/nodes` 返回里该字段可能缺失，因此这里改成可选以兼容线上数据。
  public_remark?: string
  hidden: boolean
  traffic_limit: number
  traffic_limit_type: string
  created_at: string
  updated_at: string
}

/** Real-time node status from WebSocket /api/clients */
export interface NodeRealtimeStatus {
  cpu: { usage: number }
  ram: { total: number; used: number }
  swap: { total: number; used: number }
  load: { load1: number; load5: number; load15: number }
  disk: { total: number; used: number }
  network: { up: number; down: number; totalUp: number; totalDown: number }
  connections: { tcp: number; udp: number }
  uptime: number
  process: number
  message: string
  updated_at: string
}

/** Flat node status from RPC common:getNodesLatestStatus */
export interface NodeStatus {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  disk_total: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  uptime?: number
  online: boolean
}

/** Public site info from GET /api/public */
export interface PublicInfo {
  allow_cors: boolean
  custom_body: string
  custom_head: string
  description: string
  disable_password_login: boolean
  oauth_enable: boolean
  oauth_provider: string | null
  ping_record_preserve_time: number
  private_site: boolean
  record_enabled: boolean
  record_preserve_time: number
  sitename: string
  theme: string
  theme_settings: Record<string, unknown> | null
}

/** WebSocket response structure */
export interface WsClientsResponse {
  status: string
  data: {
    online: string[]
    data: Record<string, NodeRealtimeStatus>
  }
}

/** Merged node with status for display */
export interface NodeWithStatus {
  node: Node
  status: NodeStatus | null
  online: boolean
}
