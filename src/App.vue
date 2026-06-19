<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useNodes } from '@/composables/useNodes'
import { useThemeMode } from '@/composables/useThemeMode'
import type { NodeWithStatus, ServerGroup } from '@/types/node'
import { formatBytes } from '@/lib/utils'
import { resolveManagedThemeSettings } from '@/lib/theme-settings'
import HomeToolbar from '@/components/home/HomeToolbar.vue'
import ServerGroupCard from '@/components/home/ServerGroupCard.vue'

// 中文说明：直接消费实时 computed —— WebSocket 每 2s 轮询更新 statuses，分组与统计随之刷新。
const { nodesWithStatus, publicInfo, initializeData, disposeRealtime } = useNodes()
// useThemeMode 负责主题持久化与 html[data-theme] 同步，这里同时读取解析后的主题用于本组件局部样式。
const { resolvedTheme, initializeThemeMode } = useThemeMode()

const hasLoaded = ref(false)
const expandedUuid = ref<string | null>(null)
const GROUP_VIEW_STORAGE_KEY = 'koumei-group-view'
const groupedSelection = useStorage<'grouped' | 'all' | ''>(GROUP_VIEW_STORAGE_KEY, '')
const isGroupedView = ref(true)

const managedThemeSettings = computed(() => {
  return resolveManagedThemeSettings(publicInfo.value?.theme_settings)
})

const patternStyleVars = computed<Record<string, string>>(() => {
  return {
    '--koumei-pattern-color-light': managedThemeSettings.value.patternColorLight,
    '--koumei-pattern-color-dark': managedThemeSettings.value.patternColorDark,
  }
})

watch(
  managedThemeSettings,
  (settings) => {
    initializeThemeMode(settings.defaultAppearance)

    // 中文说明：分组视图同样只在本地没有历史选择时采用服务端默认值，避免管理员配置覆盖访客自己的习惯。
    if (!groupedSelection.value) {
      groupedSelection.value = settings.defaultGroupView
    }
  },
  { immediate: true },
)

watch(
  groupedSelection,
  (value) => {
    isGroupedView.value = value !== 'all'
  },
  { immediate: true },
)

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

const ungroupedServerRows = computed<ServerGroup[]>(() => {
  const rows = nodesWithStatus.value

  // 中文说明：不分组模式保留同一份节点排序和状态，只把所有节点收进一个统一 Card。
  return [{
    key: 'group:all',
    name: '全部',
    rows,
    online: rows.filter(row => row.online).length,
    state: 'ready',
  }]
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

  return isGroupedView.value ? groupedServerRows.value : ungroupedServerRows.value
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

function handleGroupedChange(value: boolean) {
  isGroupedView.value = value
  groupedSelection.value = value ? 'grouped' : 'all'
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
  <main
    class="koumei-home min-h-screen"
    :class="{ 'koumei-home--dark': resolvedTheme === 'dark' }"
    :style="patternStyleVars"
  >
    <!-- 中文说明：顶部栏固定 48px 高度，统一承载首页统计和高频操作入口。 -->
    <header class="koumei-header">
      <div class="koumei-header__inner">
        <HomeToolbar
          :stats="toolbarStats"
          :grouped="isGroupedView"
          @update:grouped="handleGroupedChange"
        />
      </div>
    </header>

    <section class="koumei-content relative z-10 mx-auto w-full max-w-[112rem] px-3 py-6 sm:px-5 lg:px-6">
      <!-- 中文说明：服务器按 Komari 分组拆成多个独立 Card，同组节点共享一个高密度网格。 -->
      <ServerGroupCard
        v-for="group in displayServerGroups"
        :key="group.key"
        :group="group"
        :expanded-uuid="expandedUuid"
        @toggle="toggleRow"
      />
    </section>

    <!-- 中文说明：主题页底部保留 Komari 官方来源信息，方便用户识别项目归属。 -->
    <footer class="koumei-footer">
      Powered by
      <a
        href="https://github.com/komari-monitor/komari"
        target="_blank"
        rel="noopener noreferrer"
      >
        Komari Monitor
      </a>
    </footer>
  </main>
</template>

<style scoped>
.koumei-home {
  --koumei-page-bg: #fbfbfb;
  --koumei-page-text: #1f2a1f;
  --koumei-pattern-color-light: #3d3b4d;
  --koumei-pattern-color-dark: #fbfbfb;
  --koumei-pattern-color: var(--koumei-pattern-color-light);
  --koumei-header-bg: #3d3b4f;
  --koumei-header-control-bg: rgba(255, 255, 255, 0.055);
  --koumei-header-control-bg-hover: rgba(255, 255, 255, 0.105);
  --koumei-header-control-border: rgba(255, 255, 255, 0.1);
  --koumei-header-text: #fff;
  --koumei-header-muted: rgba(255, 255, 255, 0.66);
  --koumei-menu-bg: rgba(255, 255, 255, 0.96);
  --koumei-menu-border: rgba(115, 136, 115, 0.18);
  --koumei-menu-text: rgba(31, 42, 31, 0.74);
  --koumei-menu-text-active: #1f2a1f;
  --koumei-menu-option-hover: rgba(31, 42, 31, 0.06);
  --koumei-menu-check: #5e944f;
  --koumei-card-bg: rgba(255, 255, 255, 0.88);
  --koumei-card-border: rgba(115, 136, 115, 0.18);
  --koumei-card-shadow: 0 18px 48px rgba(40, 69, 45, 0.1);
  --koumei-card-highlight: rgba(255, 255, 255, 0.55);
  --koumei-card-title: #263126;
  --koumei-card-text: #2b352b;
  --koumei-card-muted: rgba(31, 42, 31, 0.56);
  --koumei-card-chip-bg: rgba(255, 255, 255, 0.34);
  --koumei-row-border: rgba(48, 65, 48, 0.08);
  --koumei-row-even: rgba(31, 42, 31, 0.025);
  /* 中文说明：表格行 hover 与展开态统一改成中性灰高亮，避免出现突兀的浅蓝旧风格。 */
  --koumei-row-hover: rgba(31, 42, 31, 0.055);
  --koumei-progress-track: rgba(31, 42, 31, 0.08);
  --koumei-progress-text: #263126;
  --koumei-detail-bg: rgba(255, 255, 255, 0.16);
  --koumei-detail-border: rgba(48, 65, 48, 0.08);
  /* 中文说明：图表占位态改成中性灰底，避免浅色模式出现偏绿色的旧主题残留。 */
  --koumei-chart-state-bg: rgba(32, 42, 32, 0.05);
  --koumei-chart-muted: #536153;
  --koumei-chart-text: #202a20;
  --koumei-chart-grid: #dce3ec;
  --koumei-chart-crosshair: #7b897b;
  --koumei-tooltip-bg: rgba(255, 255, 255, 0.96);
  --koumei-tooltip-border: rgba(38, 49, 38, 0.16);
  --koumei-tooltip-shadow: 0 12px 28px rgba(31, 42, 31, 0.16);
  position: relative;
  overflow: hidden;
  color: var(--koumei-page-text);
  /* 中文说明：浅色模式统一使用纯色背景，让青色涂鸦纹理更干净。 */
  background: var(--koumei-page-bg);
}

.koumei-header {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  width: 100%;
  height: 48px;
  background: var(--koumei-header-bg);
}

.koumei-content {
  /* 中文说明：固定顶栏脱离文档流后，这里补回 48px 空间，避免内容被顶栏遮住。 */
  padding-top: calc(48px + 1.5rem);
}

.koumei-header__inner {
  display: flex;
  width: 100%;
  max-width: 112rem;
  height: 100%;
  align-items: center;
  margin: 0 auto;
  padding: 0 0.75rem;
}

.koumei-footer {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.5rem 1rem 1.1rem;
  color: var(--koumei-card-muted);
  font-size: 12px;
}

.koumei-footer a {
  color: var(--koumei-card-title);
  font-weight: 650;
  text-decoration: none;
}

.koumei-footer a:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.koumei-home::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  /* 中文说明：SVG 只负责提供涂鸦形状，实际颜色由 --koumei-pattern-color 统一控制，方便后续调试主题色。 */
  background-color: var(--koumei-pattern-color);
  mask-image: url('/pattern.svg?v=koumei-mask-20260619');
  mask-repeat: repeat;
  mask-size: 26rem auto;
  -webkit-mask-image: url('/pattern.svg?v=koumei-mask-20260619');
  -webkit-mask-repeat: repeat;
  -webkit-mask-size: 26rem auto;
  opacity: 0.36;
  mix-blend-mode: normal;
}

.koumei-home--dark {
  --koumei-page-bg: #171620;
  --koumei-page-text: #f8f7ff;
  --koumei-pattern-color: var(--koumei-pattern-color-dark);
  --koumei-header-bg: #3d3b4f;
  --koumei-header-control-bg: rgba(255, 255, 255, 0.055);
  --koumei-header-control-bg-hover: rgba(255, 255, 255, 0.115);
  --koumei-header-control-border: rgba(255, 255, 255, 0.11);
  --koumei-header-text: #fff;
  --koumei-header-muted: rgba(255, 255, 255, 0.68);
  --koumei-menu-bg: #2c2a3a;
  --koumei-menu-border: rgba(112, 243, 255, 0.18);
  --koumei-menu-text: rgba(237, 235, 248, 0.78);
  --koumei-menu-text-active: #f8f7ff;
  --koumei-menu-option-hover: rgba(112, 243, 255, 0.1);
  --koumei-menu-check: #3d3b4d;
  --koumei-card-bg: #232231;
  --koumei-card-border: rgba(41, 46, 46, 0.2);
  --koumei-card-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
  --koumei-card-highlight: transparent;
  --koumei-card-title: #f8f7ff;
  --koumei-card-text: rgba(237, 235, 248, 0.86);
  --koumei-card-muted: rgba(224, 222, 238, 0.66);
  --koumei-card-chip-bg: rgba(255, 255, 255, 0.08);
  --koumei-row-border: rgba(224, 222, 238, 0.11);
  --koumei-row-even: rgba(255, 255, 255, 0.035);
  /* 中文说明：深色模式下同样使用偏灰的亮面高亮，而不是带青色倾向的旧变量。 */
  --koumei-row-hover: rgba(248, 247, 255, 0.08);
  --koumei-progress-track: rgba(255, 255, 255, 0.1);
  --koumei-progress-text: #f8f7ff;
  --koumei-detail-bg: rgba(255, 255, 255, 0.05);
  --koumei-detail-border: rgba(224, 222, 238, 0.1);
  /* 中文说明：深色模式下同步使用更中性的灰紫底色，和当前卡片体系保持一致。 */
  --koumei-chart-state-bg: rgba(248, 247, 255, 0.06);
  --koumei-chart-muted: rgba(224, 222, 238, 0.66);
  --koumei-chart-text: #f8f7ff;
  --koumei-chart-grid: rgba(224, 222, 238, 0.14);
  --koumei-chart-crosshair: rgba(112, 243, 255, 0.48);
  --koumei-tooltip-bg: #2c2a3a;
  --koumei-tooltip-border: rgba(112, 243, 255, 0.18);
  --koumei-tooltip-shadow: 0 14px 32px rgba(0, 0, 0, 0.36);
  /* 中文说明：深色模式只切变量，避免多个组件重复覆盖导致黑底黑字。 */
  background: var(--koumei-page-bg);
  color: var(--koumei-page-text);
}

.koumei-home--dark::before {
  opacity: 0.1;
  mix-blend-mode: normal;
  filter: none;
}
</style>
