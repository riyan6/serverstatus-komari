<script setup lang="ts">
import type { NodeWithStatus } from '@/types/node'
import { detailItems } from '@/lib/node-format'
import PingChart from '@/components/home/PingChart.vue'

defineProps<{
  row: NodeWithStatus
}>()
</script>

<template>
  <div class="server-detail">
    <div class="server-detail__info">
      <p
        v-for="item in detailItems(row)"
        :key="item.label"
      >
        <span>{{ item.label }}:</span>
        {{ item.value }}
      </p>
    </div>

    <PingChart :uuid="row.node.uuid" />
  </div>
</template>

<style scoped>
.server-detail {
  min-width: 84rem;
  border-top: 1px solid var(--koumei-detail-border);
  border-bottom: 1px solid var(--koumei-detail-border);
  /* 中文说明：详情面板跟随首页主题变量，避免 scoped/global dark 选择器泄漏到根节点。 */
  background: var(--koumei-detail-bg);
  padding: 14px 18px 18px;
}

.server-detail__info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 24px;
  color: var(--koumei-chart-text);
  font-size: 14px;
  line-height: 1.55;
}

.server-detail__info p {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.server-detail__info span {
  font-weight: 600;
}

.server-detail :deep(.server-detail__chart) {
  margin-top: 14px;
}

@media (max-width: 768px) {
  .server-detail {
    min-width: 0;
  }

  .server-detail__info {
    grid-template-columns: 1fr;
  }
}

</style>
