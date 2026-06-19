<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, Layers, List, Monitor, Moon, Settings, Sun } from 'lucide-vue-next'
import { useThemeMode, type ThemeMode } from '@/composables/useThemeMode'

defineProps<{
  stats: {
    total: number
    online: number
    upload: string
    download: string
  }
  grouped: boolean
}>()

const emit = defineEmits<{
  (event: 'update:grouped', value: boolean): void
}>()

const { themeMode, setThemeMode } = useThemeMode()
const themeMenuOpen = ref(false)

// 中文说明：工具栏只提供三种明确模式，auto 会跟随系统深浅色偏好。
const themeOptions: Array<{ label: string; value: ThemeMode }> = [
  { label: '自动', value: 'auto' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

const currentThemeLabel = computed(() => {
  return themeOptions.find(option => option.value === themeMode.value)?.label ?? '自动'
})

function selectThemeMode(mode: ThemeMode) {
  // 中文说明：菜单选中后立即收起，避免浮层遮挡后续表格操作。
  setThemeMode(mode)
  themeMenuOpen.value = false
}

function setGroupedView(value: boolean) {
  // 中文说明：分组切换只影响 Card 聚合方式，不改变节点排序和实时状态数据。
  emit('update:grouped', value)
}
</script>

<template>
  <!-- 中文说明：顶部栏内的工具区只负责横向排布，外层 header 统一控制高度和底色。 -->
  <div class="server-toolbar" aria-label="首页工具栏">
    <div class="capsule-toolbar capsule-toolbar--stats" aria-label="节点与流量摘要">
      <div class="toolbar-stat">
        <span>节点</span>
        <strong>{{ stats.total }}</strong>
      </div>
      <div class="toolbar-stat">
        <span>在线</span>
        <strong>{{ stats.online }}</strong>
      </div>
      <div class="toolbar-stat">
        <span>上传</span>
        <strong>{{ stats.upload }}</strong>
      </div>
      <div class="toolbar-stat">
        <span>下载</span>
        <strong>{{ stats.download }}</strong>
      </div>
    </div>

    <div class="capsule-toolbar capsule-toolbar--actions" aria-label="显示与管理操作" @click.stop>
      <div class="group-mode" role="group" aria-label="服务器分组显示方式">
        <button
          type="button"
          class="group-mode__button"
          :class="{ 'group-mode__button--active': grouped }"
          :aria-pressed="grouped"
          aria-label="按服务器分组显示"
          @click="setGroupedView(true)"
        >
          <Layers aria-hidden="true" />
          <span>分组</span>
        </button>
        <button
          type="button"
          class="group-mode__button"
          :class="{ 'group-mode__button--active': !grouped }"
          :aria-pressed="!grouped"
          aria-label="不分组显示全部服务器"
          @click="setGroupedView(false)"
        >
          <List aria-hidden="true" />
          <span>全部</span>
        </button>
      </div>

      <div class="theme-menu">
        <button
          type="button"
          class="glass-action glass-action--theme"
          :aria-expanded="themeMenuOpen"
          aria-haspopup="menu"
          aria-label="切换显示模式"
          @click="themeMenuOpen = !themeMenuOpen"
        >
          <Monitor v-if="themeMode === 'auto'" class="glass-action__icon" aria-hidden="true" />
          <Sun v-else-if="themeMode === 'light'" class="glass-action__icon" aria-hidden="true" />
          <Moon v-else class="glass-action__icon" aria-hidden="true" />
          <span>外观</span>
          <small>{{ currentThemeLabel }}</small>
          <ChevronDown class="theme-trigger__chevron" aria-hidden="true" />
        </button>

        <Transition name="theme-menu-float">
          <div
            v-if="themeMenuOpen"
            class="theme-menu__popover"
            role="menu"
            aria-label="显示模式"
          >
            <button
              v-for="option in themeOptions"
              :key="option.value"
              type="button"
              class="theme-menu__option"
              :class="{ 'theme-menu__option--active': themeMode === option.value }"
              role="menuitemradio"
              :aria-checked="themeMode === option.value"
              @click="selectThemeMode(option.value)"
            >
              <Monitor v-if="option.value === 'auto'" aria-hidden="true" />
              <Sun v-else-if="option.value === 'light'" aria-hidden="true" />
              <Moon v-else aria-hidden="true" />
              <span>{{ option.label }}</span>
              <Check v-if="themeMode === option.value" class="theme-menu__check" aria-hidden="true" />
            </button>
          </div>
        </Transition>
      </div>

      <a class="glass-action glass-action--icon admin-link" href="/admin" aria-label="后台管理" title="后台管理">
        <Settings aria-hidden="true" />
      </a>
    </div>
  </div>
</template>

<style scoped>
.server-toolbar {
  position: relative;
  z-index: 3;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0;
}

.capsule-toolbar {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  overflow: visible;
  border: 1px solid var(--koumei-header-control-border);
  border-radius: 8px;
  background: var(--koumei-header-control-bg);
  box-shadow: none;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.capsule-toolbar::before {
  display: none;
}

.capsule-toolbar:hover {
  border-color: var(--koumei-header-control-border);
  background: var(--koumei-header-control-bg-hover);
}

.capsule-toolbar--stats {
  flex: 0 1 auto;
  gap: 0.02rem;
  overflow-x: auto;
  padding: 0.14rem 0.36rem;
  scrollbar-width: none;
}

.capsule-toolbar--stats::-webkit-scrollbar {
  display: none;
}

.capsule-toolbar--actions {
  flex: 0 0 auto;
  gap: 0.34rem;
  padding: 0.2rem;
}

.toolbar-stat {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  padding: 0.25rem 0.68rem;
  color: var(--koumei-header-muted);
  font-size: 11px;
  white-space: nowrap;
}

.toolbar-stat::before {
  position: absolute;
  inset: 0.18rem 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
  content: '';
  opacity: 0;
  transition:
    opacity 180ms ease,
    transform 220ms var(--ease-out-power2);
  transform: scaleX(0.86);
}

.toolbar-stat:hover::before {
  opacity: 1;
  transform: scaleX(1);
}

.toolbar-stat + .toolbar-stat::after {
  position: absolute;
  top: 50%;
  left: 0;
  width: 1px;
  height: 42%;
  background: rgba(255, 255, 255, 0.11);
  content: '';
  transform: translateY(-50%);
}

.toolbar-stat strong {
  position: relative;
  color: #fff;
  font-size: 13px;
  font-weight: 680;
}

.toolbar-stat span {
  position: relative;
}

.theme-menu {
  position: relative;
}

.group-mode {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--koumei-header-control-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  padding: 2px;
}

.group-mode__button {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  gap: 0.34rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--koumei-header-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 680;
  line-height: 1;
  padding: 0 0.52rem;
  white-space: nowrap;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.group-mode__button:hover,
.group-mode__button--active {
  background: var(--koumei-header-control-bg-hover);
  color: var(--koumei-header-text);
}

.group-mode__button svg {
  width: 14px;
  height: 14px;
  stroke-width: 1.9;
}

.glass-action {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background: var(--koumei-header-control-bg);
  box-shadow: none;
  color: var(--koumei-header-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 680;
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color 180ms ease,
    color 160ms ease,
    box-shadow 220ms ease;
}

.glass-action::before {
  display: none;
}

.glass-action:hover,
.glass-action[aria-expanded='true'] {
  background: var(--koumei-header-control-bg-hover);
  box-shadow: none;
  color: var(--koumei-header-text);
}

.glass-action__icon,
.glass-action svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.8;
}

.glass-action--theme {
  gap: 0.42rem;
  padding: 0 0.58rem 0 0.54rem;
}

.glass-action--theme small {
  margin-left: -0.18rem;
  border-left: 1px solid var(--koumei-header-control-border);
  padding-left: 0.42rem;
  color: var(--koumei-header-muted);
  font-size: 11px;
  font-weight: 620;
}

.theme-trigger__chevron {
  width: 13px;
  height: 13px;
  color: var(--koumei-header-muted);
  transition: transform 220ms var(--ease-out-power2);
}

.glass-action[aria-expanded='true'] .theme-trigger__chevron {
  transform: rotate(180deg);
}

.glass-action--icon {
  width: 30px;
  padding: 0;
}

.admin-link {
  text-decoration: none;
}

.theme-menu__popover {
  position: absolute;
  top: calc(100% + 0.58rem);
  right: 0;
  z-index: 30;
  min-width: 10rem;
  overflow: hidden;
  border: 1px solid var(--koumei-menu-border);
  border-radius: 8px;
  background: var(--koumei-menu-bg);
  box-shadow:
    0 16px 42px rgba(0, 0, 0, 0.22),
    0 2px 10px rgba(0, 0, 0, 0.12);
  padding: 0.42rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.theme-menu__option {
  display: grid;
  width: 100%;
  min-height: 36px;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--koumei-menu-text);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  padding: 0.42rem 0.58rem;
  text-align: left;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 180ms var(--ease-out-power2);
}

.theme-menu__option:hover,
.theme-menu__option--active {
  background: var(--koumei-menu-option-hover);
  color: var(--koumei-menu-text-active);
}

.theme-menu__option:hover {
  transform: translateX(1px);
}

.theme-menu__option svg {
  width: 15px;
  height: 15px;
  stroke-width: 1.9;
}

.theme-menu__check {
  color: var(--koumei-menu-check);
}

.theme-menu-float-enter-active,
.theme-menu-float-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms var(--ease-out-power2),
    filter 220ms ease;
}

.theme-menu-float-enter-from,
.theme-menu-float-leave-to {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(-0.35rem) scale(0.96);
}

@media (max-width: 768px) {
  .server-toolbar {
    align-items: center;
    flex-direction: row;
    overflow-x: auto;
    padding: 0;
    scrollbar-width: none;
  }

  .server-toolbar::-webkit-scrollbar {
    display: none;
  }

  .capsule-toolbar--stats {
    max-width: none;
    justify-content: flex-start;
  }

  .toolbar-stat {
    justify-content: center;
    padding-inline: 0.58rem;
  }

  .capsule-toolbar--actions {
    justify-content: flex-start;
  }

  .theme-menu__popover {
    right: 0;
    left: auto;
    width: min(15rem, calc(100vw - 1.6rem));
  }
}

</style>
