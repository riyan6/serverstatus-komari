import { ref, computed } from 'vue'
import type { Node, NodeStatus, NodeWithStatus, PublicInfo } from '@/types/node'
import { mockNodes, mockNodeStatuses, mockPublicInfo } from '@/mock/data'

const nodes = ref<Node[]>([])
const statuses = ref<Record<string, NodeStatus>>({})
const publicInfo = ref<PublicInfo | null>(null)
const isLoading = ref(true)

type ApiResponse<T> = {
  status: string
  message: string
  data: T
}

type RpcResponse<T> = {
  jsonrpc: string
  id: number | string | null
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

declare const __KOMARI_PROXY_TARGET__: string

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let wsPollTimer: ReturnType<typeof setInterval> | null = null
let httpStatusPollTimer: ReturnType<typeof setInterval> | null = null
let isHttpStatusPolling = false
let isExplicitlyClosed = false
let wsReconnectAttempts = 0

const MAX_WS_RECONNECT_ATTEMPTS = 1

export function useNodes() {
  function loadMockData() {
    nodes.value = mockNodes
    statuses.value = mockNodeStatuses
    publicInfo.value = mockPublicInfo
  }

  // 中文说明：获取当前登录用户信息，GET /api/me 不需要统一包装解析。
  async function fetchMe(): Promise<unknown> {
    const response = await fetch('/api/me', { credentials: 'include' })
    if (!response.ok) {
      throw new Error(`GET /api/me failed: ${response.status}`)
    }
    return await response.json()
  }

  // 中文说明：Komari 的公开接口有统一包裹结构，这里做一层轻量解析，避免业务层重复判断。
  async function fetchApiData<T>(url: string): Promise<T> {
    const response = await fetch(url, { credentials: 'include' })

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }

    const result = await response.json() as ApiResponse<T>

    if (result.status !== 'success') {
      throw new Error(result.message || 'Request failed')
    }

    return result.data
  }

  // 中文说明：RPC2 接口统一封装 JSON-RPC 请求，通过固定 ID 进行首屏获取。
  async function fetchRpcWithId<T>(id: number | string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch('/api/rpc2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }),
    })

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`)
    }

    const result = await response.json() as RpcResponse<T>

    if (result.error) {
      throw new Error(result.error.message || 'RPC request failed')
    }

    if (result.result === undefined) {
      throw new Error('RPC response missing result')
    }

    return result.result
  }

  function cleanupWebSocketTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (wsPollTimer) {
      clearInterval(wsPollTimer)
      wsPollTimer = null
    }
    if (httpStatusPollTimer) {
      clearInterval(httpStatusPollTimer)
      httpStatusPollTimer = null
    }
  }

  function cleanupWebSocket() {
    isExplicitlyClosed = true
    cleanupWebSocketTimers()
    if (socket) {
      try {
        socket.close()
      } catch (e) {
        console.warn('[WebSocket] Error closing socket:', e)
      }
      socket = null
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'rpc.ping',
          id: 'ping-' + Date.now()
        }))
      }
    }, 15000)
  }

  function reconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)

    if (wsReconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) {
      // 中文说明：部分部署环境不支持 WebSocket，失败后切到 HTTP 轮询，避免控制台持续刷错影响页面使用。
      startHttpStatusPolling()
      return
    }

    wsReconnectAttempts += 1
    reconnectTimer = setTimeout(() => {
      connectWebSocket()
    }, 3000)
  }

  function applyLatestStatuses(latestStatuses: Record<string, NodeStatus>) {
    const nextStatuses: Record<string, NodeStatus> = { ...latestStatuses }

    // 中文说明：若某些节点暂时没有最新状态，则补一个离线占位，避免界面空指针或排序异常。
    for (const node of nodes.value) {
      if (!nextStatuses[node.uuid]) {
        nextStatuses[node.uuid] = {
          client: node.uuid,
          time: new Date().toISOString(),
          cpu: 0,
          gpu: 0,
          ram: 0,
          ram_total: node.mem_total,
          swap: 0,
          swap_total: node.swap_total,
          load: 0,
          load5: 0,
          load15: 0,
          temp: 0,
          disk: 0,
          disk_total: node.disk_total,
          net_in: 0,
          net_out: 0,
          net_total_up: 0,
          net_total_down: 0,
          process: 0,
          connections: 0,
          connections_udp: 0,
          uptime: 0,
          online: false,
        }
      }
    }

    statuses.value = nextStatuses
  }

  function startWsPolling() {
    if (wsPollTimer) clearInterval(wsPollTimer)
    wsPollTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'common:getNodesLatestStatus',
          id: 'ws-poll-' + Date.now()
        }))
      }
    }, 2000)
  }

  function startHttpStatusPolling() {
    if (httpStatusPollTimer) clearInterval(httpStatusPollTimer)
    isHttpStatusPolling = false

    httpStatusPollTimer = setInterval(async () => {
      if (isHttpStatusPolling) return

      isHttpStatusPolling = true
      try {
        const latestStatuses = await fetchRpcWithId<Record<string, NodeStatus>>(
          `http-poll-${Date.now()}`,
          'common:getNodesLatestStatus',
        )
        applyLatestStatuses(latestStatuses)
      } catch (error) {
        console.warn('[Realtime] HTTP status polling failed:', error)
      } finally {
        isHttpStatusPolling = false
      }
    }, 3000)
  }

  function connectWebSocket() {
    cleanupWebSocketTimers()
    isExplicitlyClosed = false

    let wsUrl = ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    if (import.meta.env.DEV && typeof __KOMARI_PROXY_TARGET__ !== 'undefined' && __KOMARI_PROXY_TARGET__) {
      const target = __KOMARI_PROXY_TARGET__
      const wsProtocol = target.startsWith('https:') ? 'wss:' : 'ws:'
      const host = target.replace(/^https?:\/\//, '')
      wsUrl = `${wsProtocol}//${host}/api/rpc2`
    } else {
      wsUrl = `${protocol}//${window.location.host}/api/rpc2`
    }

    console.log('[WebSocket] Connecting to:', wsUrl)
    const ws = new WebSocket(wsUrl)
    socket = ws

    ws.onopen = () => {
      wsReconnectAttempts = 0
      startHeartbeat()
      startWsPolling()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // 过滤心跳包 pong 响应，避免数据被重置为 0
        if (data.id && typeof data.id === 'string' && data.id.startsWith('ping-')) {
          return
        }

        if (data.result && typeof data.result === 'object') {
          applyLatestStatuses(data.result)
        } else if (data.method === 'common:getNodesLatestStatus' && data.params) {
          applyLatestStatuses(data.params)
        }
      } catch (error) {
        console.warn('[WebSocket] Failed to parse message:', error)
      }
    }

    ws.onclose = () => {
      cleanupWebSocketTimers()
      if (!isExplicitlyClosed) {
        reconnect()
      }
    }

    ws.onerror = () => {
      // 中文说明：浏览器会自行输出连接失败详情，这里不重复 error 日志，避免失败兜底时刷屏。
    }
  }

  async function initializeData() {
    isLoading.value = true
    try {
      // 中文说明：依次执行以下 5 个首屏 HTTP 请求：
      // 1. GET /api/me (非阻塞)
      await fetchMe().catch((err) => console.warn('Failed to fetch /api/me:', err))

      // 2. POST /api/rpc2 with method: common:getVersion, id: 1 (非阻塞)
      await fetchRpcWithId<unknown>(1, 'common:getVersion').catch((err) =>
        console.warn('Failed to fetch common:getVersion:', err),
      )

      // 3. POST /api/rpc2 with method: common:getNodes, id: 2
      const nodesDict = await fetchRpcWithId<Record<string, Node>>(2, 'common:getNodes')
      const nodeData = Object.values(nodesDict)

      // 4. POST /api/rpc2 with method: common:getNodesLatestStatus, id: 3
      const latestStatuses = await fetchRpcWithId<Record<string, NodeStatus>>(
        3,
        'common:getNodesLatestStatus',
      )

      // 5. GET /api/public
      const publicData = await fetchApiData<PublicInfo>('/api/public')

      publicInfo.value = publicData
      nodes.value = nodeData
      applyLatestStatuses(latestStatuses)
    } catch (error) {
      console.warn('Failed to load Komari APIs, fallback to mock data:', error)
      cleanupWebSocket()
      loadMockData()
      isLoading.value = false
      return
    }

    // 中文说明：数据初次获取完成后，优先尝试 WebSocket；若部署不支持，则自动降级到 HTTP 轮询。
    wsReconnectAttempts = 0
    connectWebSocket()
    isLoading.value = false
  }

  function disposeRealtime() {
    cleanupWebSocket()
  }

  // 中文说明：按 weight 排序并过滤隐藏节点；statuses 由 WebSocket 持续更新，故该结果随时间实时刷新。
  const nodesWithStatus = computed<NodeWithStatus[]>(() => {
    return nodes.value
      .filter((n) => !n.hidden)
      .map((node) => ({
        node,
        status: statuses.value[node.uuid] ?? null,
        online: statuses.value[node.uuid]?.online ?? false,
      }))
      .sort((a, b) => b.node.weight - a.node.weight)
  })

  return {
    nodesWithStatus,
    isLoading,
    publicInfo,
    initializeData,
    disposeRealtime,
  }
}
