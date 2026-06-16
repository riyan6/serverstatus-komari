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
  remainText,
  remainingClass,
  remainingPercent,
  resourceClass,
  statusLabel,
  trafficText,
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
        <div role="columnheader">网速 ↑|↓</div>
        <div role="columnheader">流量 ↑|↓</div>
        <div role="columnheader">核心</div>
        <div role="columnheader">内存</div>
        <div role="columnheader">硬盘</div>
        <div role="columnheader">剩余</div>
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
              <div class="resource-bar" :class="remainingClass(row)">
                <span :style="progressStyle(remainingPercent(row))" />
                <strong>{{ remainText(row) }}</strong>
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
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.54), rgba(245, 248, 241, 0.3)),
    rgba(255, 255, 255, 0.2);
  box-shadow:
    0 24px 70px rgba(40, 69, 45, 0.17),
    0 2px 14px rgba(31, 42, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.62),
    inset 0 -1px 0 rgba(38, 49, 38, 0.04);
  /* 中文说明：Card 与工具栏使用同一套玻璃材质，让表格像浮在背景上而不是压在白底里。 */
  backdrop-filter: blur(26px) saturate(1.38);
  -webkit-backdrop-filter: blur(26px) saturate(1.38);
}

.server-card::before {
  position: absolute;
  inset: -12%;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 6%, rgba(255, 255, 255, 0.54), transparent 24%),
    radial-gradient(circle at 84% 16%, rgba(169, 216, 130, 0.22), transparent 30%),
    radial-gradient(circle at 48% 102%, rgba(255, 255, 255, 0.26), transparent 34%);
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
  color: rgba(31, 42, 31, 0.48);
  font-size: 11px;
  font-weight: 680;
  letter-spacing: 0.12em;
}

.server-card__header h2 {
  margin: 0;
  color: #263126;
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.server-card__meta {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  color: rgba(31, 42, 31, 0.58);
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
  grid-template-columns: 4rem minmax(8.5rem, 0.85fr) 5.8rem 4.5rem 5.5rem 4.8rem 4.4rem minmax(10.5rem, 1fr) minmax(10rem, 1fr) 5.8rem 6rem 6rem 6.6rem;
  min-width: 84rem;
  align-items: center;
}

.server-grid__head {
  min-height: 30px;
  color: #263126;
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
  border-top: 1px solid rgba(48, 65, 48, 0.055);
  color: #2b352b;
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
  background: rgba(255, 255, 255, 0.11);
}

.server-grid__row:hover {
  background:
    radial-gradient(circle at 18% 50%, rgba(255, 255, 255, 0.32), transparent 34%),
    radial-gradient(circle at 72% 50%, rgba(169, 216, 130, 0.13), transparent 38%),
    rgba(255, 255, 255, 0.16);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    inset 0 -1px 0 rgba(38, 49, 38, 0.035);
}

.server-grid__row--active {
  background:
    radial-gradient(circle at 22% 50%, rgba(255, 255, 255, 0.34), transparent 36%),
    radial-gradient(circle at 76% 52%, rgba(169, 216, 130, 0.16), transparent 40%),
    rgba(255, 255, 255, 0.2);
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
.server-grid__head > div:nth-child(8),
.server-grid__head > div:nth-child(9),
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
  min-width: 84rem;
  border-top: 1px solid rgba(48, 65, 48, 0.055);
  padding: 2.8rem 1rem;
  color: rgba(31, 42, 31, 0.58);
  font-size: 0.9rem;
  text-align: center;
}

.status-dot {
  display: inline-block;
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 999px;
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
  background: rgba(31, 42, 31, 0.08);
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
  color: #263126;
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

:global([data-theme='dark']) .server-card {
  border-color: rgba(245, 244, 237, 0.1);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.095), rgba(245, 244, 237, 0.04)),
    rgba(20, 20, 19, 0.64);
  box-shadow:
    0 22px 68px rgba(0, 0, 0, 0.36),
    0 2px 8px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
}

:global([data-theme='dark']) .server-card::before {
  background:
    radial-gradient(circle at 18% 6%, rgba(255, 255, 255, 0.1), transparent 24%),
    radial-gradient(circle at 84% 16%, rgba(217, 119, 87, 0.13), transparent 30%),
    radial-gradient(circle at 48% 102%, rgba(120, 140, 93, 0.1), transparent 34%);
  opacity: 0.9;
}

:global([data-theme='dark']) .server-card__header p {
  color: rgba(245, 244, 237, 0.44);
}

:global([data-theme='dark']) .server-card__header h2 {
  color: #f5f4ed;
}

:global([data-theme='dark']) .server-card__meta {
  border-color: rgba(245, 244, 237, 0.1);
  background: rgba(255, 255, 255, 0.055);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  color: rgba(245, 244, 237, 0.56);
}

:global([data-theme='dark']) .server-grid__head,
:global([data-theme='dark']) .resource-bar strong {
  color: #f5f4ed;
}

:global([data-theme='dark']) .server-grid__row {
  border-top-color: rgba(245, 244, 237, 0.08);
  color: #dedcd1;
}

:global([data-theme='dark']) .server-grid__row:nth-child(even) {
  background: rgba(255, 255, 255, 0.025);
}

:global([data-theme='dark']) .server-grid__row:hover,
:global([data-theme='dark']) .server-grid__row--active {
  background: rgba(120, 140, 93, 0.18);
}

:global([data-theme='dark']) .server-grid__empty {
  border-color: rgba(245, 244, 237, 0.09);
  color: rgba(245, 244, 237, 0.58);
}

:global([data-theme='dark']) .resource-bar {
  background: rgba(245, 244, 237, 0.08);
}
</style>
