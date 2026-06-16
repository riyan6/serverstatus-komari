<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, Monitor, Moon, Settings, Sun } from 'lucide-vue-next'
import { useThemeMode, type ThemeMode } from '@/composables/useThemeMode'

defineProps<{
  stats: {
    total: number
    online: number
    upload: string
    download: string
  }
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
</script>

<template>
  <!-- 中文说明：Card 外部胶囊工具栏独立承载摘要和高频操作，避免和表格容器绑定在一起。 -->
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
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  margin-bottom: -0.15rem;
  padding: 0 0 0.4rem;
}

.capsule-toolbar {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  overflow: visible;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 999px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(245, 248, 241, 0.28)),
    rgba(255, 255, 255, 0.22);
  box-shadow:
    0 18px 48px rgba(40, 69, 45, 0.18),
    0 2px 10px rgba(31, 42, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    inset 0 -1px 0 rgba(38, 49, 38, 0.04);
  backdrop-filter: blur(28px) saturate(1.45);
  -webkit-backdrop-filter: blur(28px) saturate(1.45);
  transition:
    border-color 180ms ease,
    box-shadow 220ms ease,
    transform 220ms var(--ease-out-power2);
}

.capsule-toolbar::before {
  position: absolute;
  inset: -10px;
  z-index: -1;
  border-radius: inherit;
  background:
    radial-gradient(circle at 22% 50%, rgba(255, 255, 255, 0.46), transparent 34%),
    radial-gradient(circle at 78% 48%, rgba(169, 216, 130, 0.28), transparent 38%);
  content: '';
  filter: blur(18px);
  opacity: 0.55;
  transform: scale(0.96);
  transition:
    opacity 260ms ease,
    transform 260ms var(--ease-out-power2);
}

.capsule-toolbar:hover {
  border-color: rgba(255, 255, 255, 0.62);
  box-shadow:
    0 22px 58px rgba(40, 69, 45, 0.22),
    0 2px 14px rgba(31, 42, 31, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    inset 0 -1px 0 rgba(38, 49, 38, 0.05);
  transform: translateY(-1px);
}

.capsule-toolbar:hover::before {
  opacity: 0.92;
  transform: scale(1.02);
}

.capsule-toolbar--stats {
  gap: 0.02rem;
  padding: 0.4rem 0.48rem;
}

.capsule-toolbar--actions {
  gap: 0.34rem;
  padding: 0.34rem;
}

.toolbar-stat {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  padding: 0.33rem 0.78rem;
  color: rgba(31, 42, 31, 0.56);
  font-size: 11px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.toolbar-stat::before {
  position: absolute;
  inset: 0.18rem 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
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
  background: linear-gradient(180deg, transparent, rgba(38, 49, 38, 0.12), transparent);
  content: '';
  transform: translateY(-50%);
}

.toolbar-stat strong {
  position: relative;
  color: #263126;
  font-size: 13px;
  font-weight: 680;
  letter-spacing: -0.01em;
}

.toolbar-stat span {
  position: relative;
}

.theme-menu {
  position: relative;
}

.glass-action {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.52),
    inset 0 -1px 0 rgba(38, 49, 38, 0.06);
  color: rgba(31, 42, 31, 0.76);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 680;
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color 180ms ease,
    color 160ms ease,
    box-shadow 220ms ease,
    transform 220ms var(--ease-out-power2);
}

.glass-action::before {
  position: absolute;
  inset: -35%;
  z-index: -1;
  background:
    radial-gradient(circle at 50% 115%, rgba(255, 255, 255, 0.74), transparent 34%),
    radial-gradient(circle at 50% 30%, rgba(169, 216, 130, 0.28), transparent 46%);
  content: '';
  filter: blur(12px);
  opacity: 0;
  transform: scale(0.72);
  transition:
    opacity 260ms ease,
    transform 280ms var(--ease-out-power2);
}

.glass-action:hover,
.glass-action[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    0 8px 22px rgba(40, 69, 45, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    inset 0 -1px 0 rgba(38, 49, 38, 0.05);
  color: #1f2a1f;
  transform: translateY(-1px) scale(1.012);
}

.glass-action:hover::before,
.glass-action[aria-expanded='true']::before {
  opacity: 1;
  transform: scale(1);
}

.glass-action__icon,
.glass-action svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.8;
}

.glass-action--theme {
  gap: 0.42rem;
  padding: 0 0.68rem 0 0.62rem;
}

.glass-action--theme small {
  margin-left: -0.18rem;
  border-left: 1px solid rgba(38, 49, 38, 0.1);
  padding-left: 0.42rem;
  color: rgba(31, 42, 31, 0.48);
  font-size: 11px;
  font-weight: 620;
}

.theme-trigger__chevron {
  width: 13px;
  height: 13px;
  color: rgba(31, 42, 31, 0.42);
  transition: transform 220ms var(--ease-out-power2);
}

.glass-action[aria-expanded='true'] .theme-trigger__chevron {
  transform: rotate(180deg);
}

.glass-action--icon {
  width: 36px;
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
  border: 1px solid rgba(255, 255, 255, 0.44);
  border-radius: 1.2rem;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.64), rgba(245, 248, 241, 0.34)),
    rgba(255, 255, 255, 0.22);
  box-shadow:
    0 24px 58px rgba(40, 69, 45, 0.2),
    0 4px 16px rgba(31, 42, 31, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.68);
  padding: 0.42rem;
  backdrop-filter: blur(30px) saturate(1.5);
  -webkit-backdrop-filter: blur(30px) saturate(1.5);
}

.theme-menu__option {
  display: grid;
  width: 100%;
  min-height: 36px;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  border-radius: 0.86rem;
  background: transparent;
  color: rgba(31, 42, 31, 0.7);
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
  background: rgba(255, 255, 255, 0.38);
  color: #1f2a1f;
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
  color: #5e944f;
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
    align-items: stretch;
    flex-direction: column;
    padding: 0 0 0.75rem;
  }

  .capsule-toolbar {
    width: 100%;
    justify-content: center;
  }

  .capsule-toolbar--stats {
    justify-content: space-between;
  }

  .toolbar-stat {
    flex: 1;
    justify-content: center;
    padding-inline: 0.5rem;
  }

  .capsule-toolbar--actions {
    justify-content: space-between;
  }

  .theme-menu {
    flex: 1;
  }

  .glass-action--theme {
    width: 100%;
  }

  .theme-menu__popover {
    right: auto;
    left: 0;
    width: min(15rem, calc(100vw - 1.6rem));
  }
}

:global([data-theme='dark']) .capsule-toolbar {
  border-color: rgba(245, 244, 237, 0.12);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.11), rgba(245, 244, 237, 0.045)),
    rgba(20, 20, 19, 0.44);
  box-shadow:
    0 18px 52px rgba(0, 0, 0, 0.32),
    0 2px 12px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
}

:global([data-theme='dark']) .capsule-toolbar::before {
  background:
    radial-gradient(circle at 22% 50%, rgba(255, 255, 255, 0.13), transparent 34%),
    radial-gradient(circle at 78% 48%, rgba(217, 119, 87, 0.18), transparent 40%);
  opacity: 0.72;
}

:global([data-theme='dark']) .capsule-toolbar:hover {
  border-color: rgba(245, 244, 237, 0.18);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.4),
    0 2px 14px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}

:global([data-theme='dark']) .toolbar-stat {
  color: rgba(245, 244, 237, 0.58);
}

:global([data-theme='dark']) .toolbar-stat::before {
  background: rgba(255, 255, 255, 0.06);
}

:global([data-theme='dark']) .toolbar-stat + .toolbar-stat::after {
  background: linear-gradient(180deg, transparent, rgba(245, 244, 237, 0.1), transparent);
}

:global([data-theme='dark']) .toolbar-stat strong {
  color: #f5f4ed;
}

:global([data-theme='dark']) .glass-action {
  background: rgba(255, 255, 255, 0.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
  color: rgba(245, 244, 237, 0.72);
}

:global([data-theme='dark']) .glass-action::before {
  background:
    radial-gradient(circle at 50% 115%, rgba(255, 255, 255, 0.16), transparent 34%),
    radial-gradient(circle at 50% 30%, rgba(217, 119, 87, 0.16), transparent 46%);
}

:global([data-theme='dark']) .glass-action:hover,
:global([data-theme='dark']) .glass-action[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.11);
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
  color: #f5f4ed;
}

:global([data-theme='dark']) .glass-action--theme small {
  border-left-color: rgba(245, 244, 237, 0.12);
  color: rgba(245, 244, 237, 0.48);
}

:global([data-theme='dark']) .theme-trigger__chevron {
  color: rgba(245, 244, 237, 0.42);
}

:global([data-theme='dark']) .theme-menu__popover {
  border-color: rgba(245, 244, 237, 0.13);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(245, 244, 237, 0.055)),
    rgba(20, 20, 19, 0.72);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.42),
    0 4px 18px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

:global([data-theme='dark']) .theme-menu__option {
  color: rgba(245, 244, 237, 0.68);
}

:global([data-theme='dark']) .theme-menu__option:hover,
:global([data-theme='dark']) .theme-menu__option--active {
  background: rgba(255, 255, 255, 0.09);
  color: #f5f4ed;
}

:global([data-theme='dark']) .theme-menu__check {
  color: #d97757;
}
</style>
