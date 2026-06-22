<script setup lang="ts">
import type { ServerGroup } from '@/types/node'
import type { NodeWithStatus } from '@/types/node'
import {
  cleanNodeName,
  formatOsName,
  getFlagUrl,
} from '@/lib/utils'
import {
  cpuPercent,
  diskPercent,
  loadText,
  memoryPercent,
  netSpeedText,
  priceText,
  progressStyle,
  regionText,
  resourceClass,
  statusLabel,
  trafficText,
  trafficLimitClass,
  trafficLimitProgressPercent,
  trafficLimitText,
  expiryText,
  uptimeText,
} from '@/lib/node-format'
import ServerDetail from '@/components/home/ServerDetail.vue'

const props = defineProps<{
  group: ServerGroup
  expandedUuid: string | null
}>()

const emit = defineEmits<{
  (event: 'toggle', row: NodeWithStatus): void
}>()

function regionFlagUrl(row: NodeWithStatus): string {
  return getFlagUrl(row.node.region)
}

function onRowClick(row: NodeWithStatus) {
  emit('toggle', row)
}
</script>

<template>
  <div class="server-card">
    <div class="server-card__header">
      <div>
        <p>{{ group.state === 'ready' ? '分组' : '状态' }}</p>
        <h2>{{ group.name }}</h2>
      </div>
      <span class="server-card__meta">
        <template v-if="group.state === 'ready'">
          {{ group.online }}/{{ group.rows.length }} 在线
        </template>
        <template v-else-if="group.state === 'loading'">
          加载中
        </template>
        <template v-else>
          无节点
        </template>
      </span>
    </div>

    <div class="server-grid" role="table" :aria-label="`${group.name}服务器列表`">
      <div class="server-grid__head" role="row">
        <div role="columnheader">状态</div>
        <div role="columnheader">名称</div>
        <div role="columnheader">系统</div>
        <div role="columnheader">位置</div>
        <div role="columnheader">价格</div>
        <div role="columnheader">在线</div>
        <div role="columnheader">负载</div>
        <div role="columnheader">到期</div>
        <div role="columnheader">网速 ↑ | ↓</div>
        <div role="columnheader">流量 ↑ | ↓</div>
        <div role="columnheader">核心</div>
        <div role="columnheader">内存</div>
        <div role="columnheader">硬盘</div>
        <div role="columnheader">流量</div>
      </div>

      <div v-if="group.state === 'loading'" class="server-grid__empty">
        正在获取服务器数据...
      </div>

      <div v-else-if="group.state === 'empty'" class="server-grid__empty">
        暂无可显示的服务器
      </div>

      <template v-else>
        <template
          v-for="row in group.rows"
          :key="row.node.uuid"
        >
          <div
            class="server-grid__row"
            :class="{ 'server-grid__row--active': expandedUuid === row.node.uuid }"
            role="row"
            @click="onRowClick(row)"
          >
            <div class="server-grid__status" role="cell">
              <span
                class="status-dot"
                :class="row.online ? 'status-dot--online' : 'status-dot--offline'"
                :aria-label="statusLabel(row)"
              />
            </div>

            <div class="server-grid__name server-grid__center" role="cell" :title="row.node.name">
              {{ cleanNodeName(row.node.name) }}
            </div>

            <div role="cell">
              {{ formatOsName(row.node.os) }}
            </div>

            <div class="server-grid__region" role="cell">
              <img
                v-if="regionFlagUrl(row)"
                :src="regionFlagUrl(row)"
                :alt="regionText(row)"
              >
              <span>{{ regionText(row) }}</span>
            </div>

            <div role="cell">{{ priceText(row) }}</div>
            <div role="cell">{{ uptimeText(row) }}</div>
            <div role="cell">{{ loadText(row) }}</div>
            <div role="cell">{{ expiryText(row) }}</div>
            <div class="server-grid__center" role="cell">{{ netSpeedText(row) }}</div>
            <div class="server-grid__center" role="cell">{{ trafficText(row) }}</div>

            <div role="cell">
              <div class="resource-bar" :class="resourceClass(cpuPercent(row))">
                <span :style="progressStyle(cpuPercent(row))" />
                <strong>{{ cpuPercent(row).toFixed(0) }}%</strong>
              </div>
            </div>

            <div role="cell">
              <div class="resource-bar" :class="resourceClass(memoryPercent(row))">
                <span :style="progressStyle(memoryPercent(row))" />
                <strong>{{ memoryPercent(row).toFixed(0) }}%</strong>
              </div>
            </div>

            <div role="cell">
              <div class="resource-bar" :class="resourceClass(diskPercent(row))">
                <span :style="progressStyle(diskPercent(row))" />
                <strong>{{ diskPercent(row).toFixed(0) }}%</strong>
              </div>
            </div>

            <div role="cell">
              <div class="resource-bar" :class="trafficLimitClass(row)">
                <span :style="progressStyle(trafficLimitProgressPercent(row))" />
                <strong>{{ trafficLimitText(row) }}</strong>
              </div>
            </div>
          </div>

          <ServerDetail
            v-if="expandedUuid === row.node.uuid"
            :row="row"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.server-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid var(--koumei-card-border);
  border-radius: 8px;
  background: var(--koumei-card-bg);
  box-shadow: var(--koumei-card-shadow);
  /* 中文说明：Card 与工具栏使用同一套玻璃材质，让表格像浮在背景上而不是压在白底里。 */
  backdrop-filter: blur(26px) saturate(1.38);
  -webkit-backdrop-filter: blur(26px) saturate(1.38);
}

.server-card::before {
  position: absolute;
  inset: -12%;
  z-index: 0;
  pointer-events: none;
  /* 中文说明：移除右侧绿色氛围块，Card 背景只保留轻微白色提亮。 */
  background:
    radial-gradient(circle at 18% 6%, var(--koumei-card-highlight), transparent 24%),
    radial-gradient(circle at 48% 102%, var(--koumei-card-highlight), transparent 34%);
  content: '';
  filter: blur(18px);
  opacity: 0.84;
}

.server-card + .server-card {
  margin-top: 1rem;
}

.server-card__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem 0.1rem;
}

.server-card__header p {
  margin: 0 0 0.18rem;
  color: var(--koumei-card-muted);
  font-size: 11px;
  font-weight: 680;
  letter-spacing: 0.12em;
}

.server-card__header h2 {
  margin: 0;
  color: var(--koumei-card-title);
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.server-card__meta {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--koumei-card-border);
  border-radius: 8px;
  background: var(--koumei-card-chip-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: var(--koumei-card-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  padding: 0.44rem 0.68rem;
  white-space: nowrap;
}

.server-grid {
  position: relative;
  z-index: 1;
  overflow-x: auto;
  padding: 0.65rem 1rem 1rem;
}

.server-grid__head,
.server-grid__row {
  display: grid;
  grid-template-columns: 4rem minmax(8.5rem, 0.85fr) 5.8rem 4.5rem 5.5rem 4.8rem 4.4rem 5.2rem minmax(10.5rem, 1fr) minmax(13rem, 1.2fr) 5.8rem 6rem 6rem 6.6rem;
  min-width: 92rem;
  align-items: center;
}

.server-grid__head {
  min-height: 30px;
  color: var(--koumei-card-title);
  font-size: 14px;
  font-weight: 600;
}

.server-grid__head > div,
.server-grid__row > div {
  min-width: 0;
  padding: 0 6px;
}

.server-grid__row {
  min-height: 30px;
  border-top: 1px solid var(--koumei-row-border);
  color: var(--koumei-card-text);
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    box-shadow 200ms ease,
    color 160ms ease,
    transform 200ms var(--ease-out-power2);
}

.server-grid__row:nth-child(even) {
  background: var(--koumei-row-even);
}

.server-grid__row:hover {
  background: var(--koumei-row-hover);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.server-grid__row--active {
  background: var(--koumei-row-hover);
}

.server-grid__row > div:not(:has(.resource-bar)) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-grid__status {
  display: flex;
  justify-content: center;
}

.server-grid__head > div:nth-child(2),
.server-grid__head > div:nth-child(9),
.server-grid__head > div:nth-child(10),
.server-grid__center {
  text-align: center;
}

.server-grid__name {
  overflow: hidden;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-grid__region {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.server-grid__region img {
  width: 1.05rem;
  height: 0.78rem;
  border-radius: 2px;
  object-fit: cover;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}

.server-grid__empty {
  min-width: 92rem;
  border-top: 1px solid var(--koumei-row-border);
  padding: 2.8rem 1rem;
  color: var(--koumei-card-muted);
  font-size: 0.9rem;
  text-align: center;
}

.status-dot {
  display: inline-block;
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 8px;
  box-shadow: 0 0 0 3px rgba(96, 160, 74, 0.12);
}

.status-dot--online {
  background: #5faa43;
}

.status-dot--offline {
  background: #c75245;
  box-shadow: 0 0 0 3px rgba(199, 82, 69, 0.13);
}

.resource-bar {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 16px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--koumei-progress-track);
}

.resource-bar span {
  position: absolute;
  inset-block: 0;
  left: 0;
  border-radius: inherit;
}

.resource-bar strong {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 0 0.28rem;
  color: var(--koumei-progress-text);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  text-align: right;
}

.resource-bar.is-normal span {
  background: linear-gradient(90deg, #6ab44e, #a5ce75);
}

.resource-bar.is-warning span {
  background: linear-gradient(90deg, #d5ab45, #e5cf73);
}

.resource-bar.is-danger span {
  background: linear-gradient(90deg, #bd4c3f, #d96a5d);
}

.server-card :deep(.server-detail) {
  /* 中文说明：详情面板由子组件自带样式，这里仅保留间距承接。 */
}

@media (max-width: 768px) {
  .server-card {
    border-radius: 16px;
  }

  .server-card__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.85rem 0.8rem 0.05rem;
  }

  .server-card__meta {
    align-self: flex-start;
  }
}

</style>
