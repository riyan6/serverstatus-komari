<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useNodes } from '@/composables/useNodes'
import { useThemeMode } from '@/composables/useThemeMode'
import type { NodeWithStatus, ServerGroup } from '@/types/node'
import { formatBytes } from '@/lib/utils'
import HomeToolbar from '@/components/home/HomeToolbar.vue'
import ServerGroupCard from '@/components/home/ServerGroupCard.vue'

// 中文说明：直接消费实时 computed —— WebSocket 每 2s 轮询更新 statuses，分组与统计随之刷新。
const { nodesWithStatus, initializeData, disposeRealtime } = useNodes()
// useThemeMode 负责主题持久化与 html[data-theme] 同步，这里仅激活监听。
useThemeMode()

const hasLoaded = ref(false)
const expandedUuid = ref<string | null>(null)

// 中文说明：后端可能返回空分组，界面统一归到默认分组，避免出现空标题 Card。
function resolveGroupName(row: NodeWithStatus): string {
  return row.node.group.trim() || '默认分组'
}

const groupedServerRows = computed<ServerGroup[]>(() => {
  const groupMap = new Map<string, ServerGroup>()

  for (const row of nodesWithStatus.value) {
    const name = resolveGroupName(row)
    const key = `group:${name}`
    const group = groupMap.get(key)

    if (group) {
      group.rows.push(row)
      if (row.online) group.online += 1
      continue
    }

    groupMap.set(key, {
      key,
      name,
      rows: [row],
      online: row.online ? 1 : 0,
      state: 'ready',
    })
  }

  return Array.from(groupMap.values())
})

const displayServerGroups = computed<ServerGroup[]>(() => {
  if (!hasLoaded.value) {
    return [{
      key: 'state:loading',
      name: '服务器',
      rows: [],
      online: 0,
      state: 'loading',
    }]
  }

  if (nodesWithStatus.value.length === 0) {
    return [{
      key: 'state:empty',
      name: '服务器',
      rows: [],
      online: 0,
      state: 'empty',
    }]
  }

  return groupedServerRows.value
})

const toolbarStats = computed(() => {
  // 中文说明：首页顶部摘要直接基于实时数据计算，与表格展示保持同一份数据口径。
  const online = nodesWithStatus.value.filter(row => row.online).length
  const traffic = nodesWithStatus.value.reduce(
    (total, row) => {
      total.up += row.status?.net_total_up ?? 0
      total.down += row.status?.net_total_down ?? 0
      return total
    },
    { up: 0, down: 0 },
  )

  return {
    total: nodesWithStatus.value.length,
    online,
    upload: formatBytes(traffic.up, 1),
    download: formatBytes(traffic.down, 1),
  }
})

function toggleRow(row: NodeWithStatus) {
  const uuid = row.node.uuid
  expandedUuid.value = expandedUuid.value === uuid ? null : uuid
}

onMounted(async () => {
  // 中文说明：沿用现有真实接口初始化流程，接口失败时 useNodes 内部会降级到 mock 数据。
  await initializeData()
  hasLoaded.value = true
})

onUnmounted(() => {
  // 中文说明：页面卸载时清理 WebSocket、心跳和轮询定时器，避免开发热更新后重复连接。
  disposeRealtime()
})
</script>

<template>
  <!-- 中文说明：背景视觉已经确认，后续页面布局都放在内容层上方。 -->
  <main class="koumei-home min-h-screen text-[#1f2a1f]">
    <section class="relative z-10 mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-6">
      <HomeToolbar :stats="toolbarStats" />

      <!-- 中文说明：服务器按 Komari 分组拆成多个独立 Card，同组节点共享一个高密度网格。 -->
      <ServerGroupCard
        v-for="group in displayServerGroups"
        :key="group.key"
        :group="group"
        :expanded-uuid="expandedUuid"
        @toggle="toggleRow"
      />
    </section>
  </main>
</template>

<style scoped>
.koumei-home {
  position: relative;
  overflow: hidden;
  color: var(--theme-text-primary);
  /* 中文说明：背景色参考 Telegram 网页版聊天页，左侧压深、右侧提亮，底部保留一层柔和黄绿色。 */
  background:
    radial-gradient(ellipse 54rem 34rem at 100% 0%, rgba(239, 236, 166, 0.92) 0%, rgba(235, 233, 150, 0.64) 34%, transparent 72%),
    radial-gradient(ellipse 58rem 38rem at 0% 100%, rgba(220, 224, 88, 0.82) 0%, rgba(211, 222, 96, 0.62) 34%, transparent 72%),
    radial-gradient(circle at 4% 8%, rgba(83, 148, 106, 0.9) 0, transparent 32rem),
    radial-gradient(circle at 68% 42%, rgba(112, 174, 124, 0.58) 0, transparent 44rem),
    linear-gradient(103deg, #74aa7a 0%, #9fc982 43%, #e8e9bf 100%);
}

.koumei-home::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  /* 中文说明：public 下的线稿涂鸦作为背景纹理重复铺开，只承担氛围，不影响后续内容层级。 */
  background-image: url('/pattern.svg');
  background-repeat: repeat;
  background-size: 26rem auto;
  opacity: 0.115;
  mix-blend-mode: multiply;
}

:global([data-theme='dark']) .koumei-home {
  /* 中文说明：深色模式保留原有绿色氛围，但整体压暗，避免表格文字和背景对比不足。 */
  background:
    radial-gradient(ellipse 54rem 34rem at 100% 0%, rgba(82, 92, 48, 0.42) 0%, rgba(59, 71, 41, 0.32) 34%, transparent 72%),
    radial-gradient(ellipse 58rem 38rem at 0% 100%, rgba(74, 99, 45, 0.5) 0%, rgba(51, 72, 41, 0.38) 34%, transparent 72%),
    radial-gradient(circle at 4% 8%, rgba(38, 83, 55, 0.72) 0, transparent 32rem),
    radial-gradient(circle at 68% 42%, rgba(42, 92, 58, 0.42) 0, transparent 44rem),
    linear-gradient(103deg, #172218 0%, #23301f 44%, #343520 100%);
}

:global([data-theme='dark']) .koumei-home::before {
  opacity: 0.08;
  mix-blend-mode: screen;
  filter: invert(1) saturate(0.45);
}
</style>
