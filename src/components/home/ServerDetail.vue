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
  border-top: 1px solid rgba(48, 65, 48, 0.06);
  border-bottom: 1px solid rgba(48, 65, 48, 0.08);
  background:
    radial-gradient(circle at 24% 0%, rgba(255, 255, 255, 0.26), transparent 32%),
    rgba(255, 255, 255, 0.16);
  padding: 14px 18px 18px;
}

.server-detail__info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 24px;
  color: #202a20;
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

:global([data-theme='dark']) .server-detail {
  border-color: rgba(245, 244, 237, 0.09);
  color: rgba(245, 244, 237, 0.58);
  background: rgba(31, 30, 29, 0.72);
}

:global([data-theme='dark']) .server-detail__info {
  color: #f0eee7;
}
</style>
