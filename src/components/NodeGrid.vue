<script setup lang="ts">
import { computed, ref } from 'vue'
import { Minimize2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import NodeDetail from '@/components/NodeDetail.vue'
import PingChart from '@/components/PingChart.vue'
import ResourceMonitor from '@/components/ResourceMonitor.vue'
import { cleanNodeName, formatBytes, formatPercent, formatSpeed, getFlagUrl } from '@/lib/utils'
import type { NodeWithStatus } from '@/types/node'

const props = defineProps<{
  nodes: NodeWithStatus[]
  activeNodeUuid?: string | null
}>()

const emit = defineEmits<{
  (event: 'close-node'): void
  (event: 'open-node', uuid: string): void
}>()

// 中文说明：控制详情页显示的部分，'monitor' 表示资源监控和节点摘要，'network' 表示网络延迟
type DetailSection = 'monitor' | 'network'
const activeSection = ref<DetailSection>('monitor')


// 中文说明：当前展开节点完全交给地址状态控制，这样刷新后也能直接恢复详情页。
const expandedNode = computed<NodeWithStatus | null>(() => {
  if (!props.activeNodeUuid) {
    return null
  }

  return props.nodes.find(item => item.node.uuid === props.activeNodeUuid) ?? null
})

// 中文说明：统一限制进度条百分比范围，避免接口异常时撑破布局。
function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100)
}

// 中文说明：CPU 接口本身已返回百分比，这里仅做容错裁剪。
function cpuPercent(item: NodeWithStatus): number {
  return clampPercent(item.status?.cpu ?? 0)
}

// 中文说明：内存占用需要基于已用和总量换算成百分比。
function memoryPercent(item: NodeWithStatus): number {
  return clampPercent(formatPercent(item.status?.ram ?? 0, item.status?.ram_total ?? item.node.mem_total))
}

// 中文说明：磁盘占用同样根据已用和总量计算百分比。
function diskPercent(item: NodeWithStatus): number {
  return clampPercent(formatPercent(item.status?.disk ?? 0, item.status?.disk_total ?? item.node.disk_total))
}

// 中文说明：月流量进度按上下行累计总和相加后，对比节点的套餐流量限制。
function trafficPercent(item: NodeWithStatus): number {
  const totalUsed = (item.status?.net_total_up ?? 0) + (item.status?.net_total_down ?? 0)
  if (!item.node.traffic_limit || item.node.traffic_limit <= 0) {
    return 0
  }
  return clampPercent(formatPercent(totalUsed, item.node.traffic_limit))
}



// 中文说明：标签字段以分号分隔，转换成数组后便于循环渲染 Badge。
function nodeTags(item: NodeWithStatus): string[] {
  return item.node.tags
    .split(';')
    .map(tag => tag.trim())
    .filter(Boolean)
}

// 中文说明：在线状态文案和样式集中管理，避免模板里散落判断逻辑。
function statusMeta(item: NodeWithStatus) {
  return item.online
    ? {
        className: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(34,197,94,0.12)]',
        label: '在线',
        textClassName: 'text-emerald-700',
        pillClassName: 'bg-emerald-50 text-emerald-700',
      }
    : {
        className: 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]',
        label: '离线',
        textClassName: 'text-rose-700',
        pillClassName: 'bg-rose-50 text-rose-700',
      }
}

// 中文说明：统一生成进度条颜色，负载高时给出更明显提示。
function progressClass(value: number): string {
  if (value >= 90) return '[&_[data-slot=progress-indicator]]:bg-rose-500'
  if (value >= 70) return '[&_[data-slot=progress-indicator]]:bg-amber-500'
  return '[&_[data-slot=progress-indicator]]:bg-emerald-500'
}

// 中文说明：点击卡片时切换到单卡详情模式，让首页像展开了一个二级页面。
function expandNode(uuid: string): void {
  emit('open-node', uuid)
}

// 中文说明：点击缩小按钮后恢复原来的网格布局。
function collapseNode(): void {
  emit('close-node')
}

// 中文说明：列表卡片按顺序添加入场延迟，形成更有层次的逐个弹入效果。
function cardAnimationStyle(index: number): { animationDelay: string } {
  return {
    animationDelay: `${index * 80}ms`,
  }
}

// 中文说明：将标签数据做成可复用的计算结果，减少模板内重复执行函数。
const tagsMap = computed(() =>
  Object.fromEntries(props.nodes.map(item => [item.node.uuid, nodeTags(item)])),
)

// 中文说明：旗帜地址预先计算，模板里只负责渲染，避免重复拼接 URL。
const flagUrlMap = computed(() =>
  Object.fromEntries(props.nodes.map(item => [item.node.uuid, getFlagUrl(item.node.region)])),
)
</script>

<template>
  <div
    v-if="nodes.length === 0"
    class="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground"
  >
    没有找到匹配的节点，试着切换分组或搜索关键词。
  </div>

  <Transition
    v-else
    name="node-detail-switch"
    mode="out-in"
  >
    <article
      v-if="expandedNode"
      :key="expandedNode.node.uuid"
      class="overflow-hidden rounded-[2rem] border border-[var(--theme-divider)] bg-[var(--theme-surface-panel)] shadow-[var(--surface-elevated-shadow)]"
    >
      <!-- Header with original style Minimize2 button and UUID display -->
      <div class="border-b border-[var(--theme-divider-soft)] px-5 py-5 md:px-7 md:py-6">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex shrink-0 items-center justify-center self-center">
              <img
                v-if="flagUrlMap[expandedNode.node.uuid]"
                :src="flagUrlMap[expandedNode.node.uuid]"
                :alt="`${expandedNode.node.region} flag`"
                class="h-6 w-8 rounded-[4px] object-cover"
                loading="lazy"
              >
              <span
                v-else
                class="font-heading-en text-subheading text-[var(--theme-text-primary)]"
              >
                {{ expandedNode.node.region || '--' }}
              </span>
            </div>

            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="font-heading-en text-h2 text-[var(--theme-text-primary)]">
                  {{ cleanNodeName(expandedNode.node.name) }}
                </h2>
                <span
                  class="inline-flex items-center rounded-full px-3 py-1 text-[0.75rem] font-medium"
                  :class="statusMeta(expandedNode).pillClassName"
                >
                  {{ statusMeta(expandedNode).label }}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--theme-divider)] bg-[var(--theme-surface-panel-subtle)] text-[var(--theme-text-secondary)] transition-all duration-200 hover:-translate-y-0.5 hover:text-[var(--theme-text-primary)]"
            aria-label="缩小服务器详情"
            @click="collapseNode"
          >
            <Minimize2 class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Original dynamic list NodeDetail (节点摘要) -->
      <div class="border-b border-[var(--theme-divider-soft)] p-5 md:p-6">
        <NodeDetail :data="expandedNode" />
      </div>

      <!-- Centered tab switcher for Load/Latency -->
      <div class="flex justify-center pt-8 pb-3">
        <div class="inline-flex items-center gap-1 rounded-[0.9rem] bg-[var(--theme-control-surface)] p-1 border border-[var(--theme-divider-subtle)]">
          <button
            type="button"
            :class="[
              'font-body-zh text-caption rounded-[0.7rem] px-6 py-1.5 text-center whitespace-nowrap transition-all duration-200 cursor-pointer',
              activeSection === 'monitor'
                ? 'bg-[var(--theme-control-active-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-control-active-shadow)] font-semibold'
                : 'bg-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            ]"
            @click="activeSection = 'monitor'"
          >
            负载
          </button>
          <button
            type="button"
            :class="[
              'font-body-zh text-caption rounded-[0.7rem] px-6 py-1.5 text-center whitespace-nowrap transition-all duration-200 cursor-pointer',
              activeSection === 'network'
                ? 'bg-[var(--theme-control-active-surface)] text-[var(--theme-text-primary)] shadow-[var(--theme-control-active-shadow)] font-semibold'
                : 'bg-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            ]"
            @click="activeSection = 'network'"
          >
            延迟
          </button>
        </div>
      </div>

      <!-- Tab content for ResourceMonitor (curves) or PingChart -->
      <div class="p-5 md:p-6">
        <div class="grid grid-cols-1 gap-5">
          <div v-show="activeSection === 'monitor'">
            <ResourceMonitor :data="expandedNode" />
          </div>
          <div v-show="activeSection === 'network'">
            <PingChart :uuid="expandedNode.node.uuid" />
          </div>
        </div>
      </div>
    </article>

    <div
      v-else
      key="grid"
      class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
    >
      <article
        v-for="(item, index) in nodes"
        :key="item.node.uuid"
        class="node-grid-card flex min-h-[18.5rem] cursor-pointer flex-col rounded-[var(--br-24)] bg-[var(--theme-surface-panel)] p-5 text-[var(--theme-text-primary)] transition-all duration-300 ease-out border border-[var(--theme-divider-subtle)] hover:-translate-y-1 hover:border-[var(--theme-accent-clay-primary)] hover:shadow-[0_12px_30px_rgba(20,20,19,0.06)] dark:hover:shadow-[0_12px_36px_rgba(0,0,0,0.3)]"
        :class="[!item.online ? 'opacity-65 grayscale-[15%]' : '']"
        :style="cardAnimationStyle(index)"
        @click="expandNode(item.node.uuid)"
      >
        <!-- Card Header -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-2.5">
            <img
              v-if="flagUrlMap[item.node.uuid]"
              :src="flagUrlMap[item.node.uuid]"
              :alt="`${item.node.region} flag`"
              class="h-4 w-5.5 shrink-0 rounded-[3px] object-cover shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
              loading="lazy"
            >
            <h2 class="font-heading-en text-subheading line-clamp-1 text-[var(--theme-text-primary)] font-semibold">
              {{ cleanNodeName(item.node.name) }}
            </h2>
          </div>
          <!-- Glowing online status dot -->
          <span class="relative flex h-2 w-2 shrink-0">
            <span
              v-if="item.online"
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
            />
            <span
              class="relative inline-flex h-2 w-2 rounded-full"
              :class="statusMeta(item).className"
            />
          </span>
        </div>

        <!-- System Stats Grid -->
        <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
          <!-- CPU -->
          <div class="space-y-1">
            <div class="font-body-zh text-caption flex items-center justify-between gap-2">
              <span class="font-medium text-[var(--theme-text-secondary)]">CPU</span>
              <span class="tabular-nums font-normal text-[var(--theme-text-primary)]">{{ cpuPercent(item).toFixed(1) }}%</span>
            </div>
            <Progress
              :model-value="cpuPercent(item)"
              class="h-1 bg-[var(--theme-progress-track)] rounded-full overflow-hidden"
              :class="progressClass(cpuPercent(item))"
            />
            <div class="font-ui-mixed text-xs text-[var(--theme-text-secondary)] font-normal leading-none pt-0.5">
              {{ item.status ? `${item.status.load.toFixed(2)}, ${item.status.load5.toFixed(2)}, ${item.status.load15.toFixed(2)}` : '0.00, 0.00, 0.00' }}
            </div>
          </div>

          <!-- 内存 -->
          <div class="space-y-1">
            <div class="font-body-zh text-caption flex items-center justify-between gap-2">
              <span class="font-medium text-[var(--theme-text-secondary)]">内存</span>
              <span class="tabular-nums font-normal text-[var(--theme-text-primary)]">{{ memoryPercent(item).toFixed(1) }}%</span>
            </div>
            <Progress
              :model-value="memoryPercent(item)"
              class="h-1 bg-[var(--theme-progress-track)] rounded-full overflow-hidden"
              :class="progressClass(memoryPercent(item))"
            />
            <div class="font-ui-mixed text-xs text-[var(--theme-text-secondary)] font-normal leading-none pt-0.5">
              {{ formatBytes(item.status?.ram ?? 0, 1) }} / {{ formatBytes(item.status?.ram_total ?? item.node.mem_total, 1) }}
            </div>
          </div>

          <!-- 硬盘 -->
          <div class="space-y-1">
            <div class="font-body-zh text-caption flex items-center justify-between gap-2">
              <span class="font-medium text-[var(--theme-text-secondary)]">硬盘</span>
              <span class="tabular-nums font-normal text-[var(--theme-text-primary)]">{{ diskPercent(item).toFixed(1) }}%</span>
            </div>
            <Progress
              :model-value="diskPercent(item)"
              class="h-1 bg-[var(--theme-progress-track)] rounded-full overflow-hidden"
              :class="progressClass(diskPercent(item))"
            />
            <div class="font-ui-mixed text-xs text-[var(--theme-text-secondary)] font-normal leading-none pt-0.5">
              {{ formatBytes(item.status?.disk ?? 0, 1) }} / {{ formatBytes(item.status?.disk_total ?? item.node.disk_total, 1) }}
            </div>
          </div>

          <!-- 流量 -->
          <div class="space-y-1">
            <div class="font-body-zh text-caption flex items-center justify-between gap-2">
              <span class="font-medium text-[var(--theme-text-secondary)]">流量</span>
              <span class="tabular-nums font-normal text-[var(--theme-text-primary)]">
                {{ item.node.traffic_limit && item.node.traffic_limit > 0 ? `${trafficPercent(item).toFixed(1)}%` : '∞' }}
              </span>
            </div>
            <Progress
              :model-value="trafficPercent(item)"
              class="h-1 bg-[var(--theme-progress-track)] rounded-full overflow-hidden"
              :class="progressClass(trafficPercent(item))"
            />
            <div class="font-ui-mixed text-xs text-[var(--theme-text-secondary)] font-normal leading-none pt-0.5 flex items-center">
              <span class="text-[var(--theme-accent-clay-primary)] mr-0.5 font-bold">↑</span>{{ formatBytes(item.status?.net_total_up ?? 0, 1) }}
              <span class="text-[var(--theme-accent-clay-primary)] ml-2.5 mr-0.5 font-bold">↓</span>{{ formatBytes(item.status?.net_total_down ?? 0, 1) }}
            </div>
          </div>
        </div>

        <!-- Combined Performance Metrics Grid -->
        <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[var(--theme-divider-soft)] pt-3">
          <div class="flex items-center justify-between">
            <span class="font-body-zh text-xs text-[var(--theme-text-tertiary)]">实时上传</span>
            <span class="font-ui-mixed text-caption text-[var(--theme-text-primary)] tabular-nums">{{ formatSpeed(item.status?.net_out ?? 0) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-body-zh text-xs text-[var(--theme-text-tertiary)]">实时下载</span>
            <span class="font-ui-mixed text-caption text-[var(--theme-text-primary)] tabular-nums">{{ formatSpeed(item.status?.net_in ?? 0) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-body-zh text-xs text-[var(--theme-text-tertiary)]">流量上传</span>
            <span class="font-ui-mixed text-caption text-[var(--theme-text-primary)] tabular-nums">{{ formatBytes(item.status?.net_total_up ?? 0, 1) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-body-zh text-xs text-[var(--theme-text-tertiary)]">流量下载</span>
            <span class="font-ui-mixed text-caption text-[var(--theme-text-primary)] tabular-nums">{{ formatBytes(item.status?.net_total_down ?? 0, 1) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-body-zh text-xs text-[var(--theme-text-tertiary)]">连接数</span>
            <span class="font-ui-mixed text-caption text-[var(--theme-text-primary)] tabular-nums">TCP {{ item.status?.connections ?? 0 }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-body-zh text-xs text-[var(--theme-text-tertiary)]">进程数</span>
            <span class="font-ui-mixed text-caption text-[var(--theme-text-primary)] tabular-nums">{{ item.status?.process ?? 0 }}</span>
          </div>
        </div>

        <!-- Tags Badge Footer -->
        <div class="mt-auto border-t border-[var(--theme-divider-soft)] pt-4">
          <div
            v-if="tagsMap[item.node.uuid]?.length > 0"
            class="flex flex-wrap gap-1.5"
          >
            <Badge
              v-for="tag in tagsMap[item.node.uuid]"
              :key="tag"
              variant="outline"
              class="font-body-zh text-xs rounded-full border-[var(--theme-divider-subtle)] bg-[color-mix(in_srgb,var(--theme-text-secondary)_6%,transparent)] px-2.5 py-0.5 text-[var(--theme-text-secondary)] font-normal transition-colors"
            >
              {{ tag }}
            </Badge>
          </div>
          <span
            v-else
            class="font-body-zh text-xs text-[var(--theme-text-tertiary)]"
          >
            无标签
          </span>
        </div>
      </article>
    </div>
  </Transition>
</template>

<style scoped>
.node-detail-switch-enter-active,
.node-detail-switch-leave-active {
  transition: opacity 260ms var(--ease-out-power2), transform 320ms var(--ease-out-power2);
}

.node-detail-switch-enter-from,
.node-detail-switch-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.985);
}

.node-detail-switch-enter-to,
.node-detail-switch-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.node-grid-card {
  animation-name: node-grid-card-bite;
  animation-duration: 250ms;
  animation-timing-function: cubic-bezier(.22, 1, .36, 1);
  animation-fill-mode: both;
}

@keyframes node-grid-card-bite {
  0% {
    opacity: 0;
    transform: translateY(26px) scale(0.985);
  }

  62% {
    opacity: 1;
    transform: translateY(-8px) scale(1);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .node-grid-card {
    animation: none;
  }
}
</style>
