<script setup lang="ts">
import { ref } from 'vue'
import { Search, Settings, Sun, Moon } from 'lucide-vue-next'

defineProps<{
  groups: string[]
  selectedGroup: string
  searchQuery: string
}>()

const emit = defineEmits<{
  'update:selectedGroup': [value: string]
  'update:searchQuery': [value: string]
}>()

const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('appearance', isDark.value ? 'dark' : 'light')
}

function handleSearchInput(event: Event) {
  emit('update:searchQuery', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
    <!-- 搜索框 -->
    <label class="relative block w-full lg:max-w-xs">
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        :value="searchQuery"
        type="text"
        placeholder="搜索节点、分组或标签..."
        class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        @input="handleSearchInput"
      />
    </label>

    <!-- 分组 tabs -->
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap gap-1 rounded-md bg-muted p-1">
        <button
          type="button"
          class="rounded-sm px-3 py-1.5 text-sm font-medium transition-colors"
          :class="selectedGroup === '' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="emit('update:selectedGroup', '')"
        >
          全部
        </button>
        <button
          v-for="group in groups"
          :key="group"
          type="button"
          class="rounded-sm px-3 py-1.5 text-sm font-medium transition-colors"
          :class="selectedGroup === group ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="emit('update:selectedGroup', group)"
        >
          {{ group }}
        </button>
      </div>
    </div>

    <!-- 主题 & 设置按钮 -->
    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        @click="toggleTheme"
      >
        <Sun v-if="isDark" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </button>
      <a
        href="/admin"
        class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Settings class="h-4 w-4" />
      </a>
    </div>
  </div>
</template>
