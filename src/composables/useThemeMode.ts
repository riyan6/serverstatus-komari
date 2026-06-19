import { computed, watch } from 'vue'
import { usePreferredDark, useStorage } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const THEME_MODE_STORAGE_KEY = 'koumei-theme-mode'

// 中文说明：主题模式持久化到本地，默认先落在 light，和当前现有视觉保持一致。
const themeMode = useStorage<ThemeMode>(THEME_MODE_STORAGE_KEY, 'light')

// 中文说明：auto 模式下跟随系统深浅色偏好。
const preferredDark = usePreferredDark()

// 中文说明：将用户选择的模式统一解析成最终生效的主题值，方便根节点和样式系统直接消费。
const resolvedTheme = computed<ResolvedTheme>(() => {
  if (themeMode.value === 'auto') {
    return preferredDark.value ? 'dark' : 'light'
  }

  return themeMode.value
})

// 中文说明：把主题状态同步到 html 根节点，后续 CSS 只需要围绕 data-theme 扩展即可。
function applyTheme(theme: ResolvedTheme, mode: ThemeMode): void {
  if (typeof document === 'undefined') {
    return
  }

  const rootElement = document.documentElement

  rootElement.dataset.theme = theme
  rootElement.dataset.colorMode = mode
  // 中文说明：深色视觉完全由项目 CSS 控制，避免 Chrome/扩展基于 color-scheme 或 .dark 进行二次暗化。
  rootElement.style.colorScheme = 'light'
  rootElement.classList.remove('dark')
}

watch([themeMode, resolvedTheme], ([mode, theme]) => {
  applyTheme(theme, mode)
}, { immediate: true })

export function useThemeMode() {
  // 中文说明：对外只暴露模式值、解析后的主题值和设置方法，避免组件重复处理 DOM 细节。
  function setThemeMode(mode: ThemeMode): void {
    themeMode.value = mode
  }

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
  }
}
