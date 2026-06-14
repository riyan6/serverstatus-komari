import { onMounted, onUnmounted, ref } from 'vue'

const INSTANCE_ROUTE_PATTERN = /^\/instance\/([^/]+)\/?$/

// 中文说明：从当前 pathname 中提取实例 UUID，只有 `/instance/:uuid` 形态才视为详情路由。
function resolveInstanceUuid(pathname: string): string | null {
  const matchedRoute = pathname.match(INSTANCE_ROUTE_PATTERN)
  if (!matchedRoute) {
    return null
  }

  return decodeURIComponent(matchedRoute[1])
}

export function useInstanceRoute() {
  const activeNodeUuid = ref<string | null>(null)

  // 中文说明：地址变化时同步详情节点 UUID，这样刷新、前进后退都能回到对应节点。
  function syncRouteState(): void {
    if (typeof window === 'undefined') {
      activeNodeUuid.value = null
      return
    }

    activeNodeUuid.value = resolveInstanceUuid(window.location.pathname)
  }

  // 中文说明：点击节点后直接推入详情地址，保持和 Komari 官方主题的访问路径一致。
  function goToNode(uuid: string): void {
    if (typeof window === 'undefined') {
      return
    }

    const nextPath = `/instance/${encodeURIComponent(uuid)}`
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ nodeUuid: uuid }, '', nextPath)
    }

    activeNodeUuid.value = uuid
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // 中文说明：关闭详情时返回首页列表地址，避免刷新后还停留在旧详情页。
  function goToHome(): void {
    if (typeof window === 'undefined') {
      return
    }

    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/')
    }

    activeNodeUuid.value = null
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  onMounted(() => {
    syncRouteState()
    window.addEventListener('popstate', syncRouteState)
  })

  onUnmounted(() => {
    window.removeEventListener('popstate', syncRouteState)
  })

  return {
    activeNodeUuid,
    goToHome,
    goToNode,
    syncRouteState,
  }
}
