import { computed, watch } from 'vue'
import { usePreferredDark, useStorage } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const THEME_MODE_STORAGE_KEY = 'appearance'

// 中文说明：外观模式沿用 Komari 文档建议的 appearance 键，便于主题和宿主系统保持一致约定。
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

  // 中文说明：只在用户尚未手动选择时才应用动态配置默认值，避免刷新后把用户偏好覆盖掉。
  function initializeThemeMode(defaultMode: ThemeMode): void {
    if (typeof window === 'undefined') {
      return
    }

    const hasStoredValue = window.localStorage.getItem(THEME_MODE_STORAGE_KEY) !== null

    if (!hasStoredValue) {
      themeMode.value = defaultMode
    }
  }

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
    initializeThemeMode,
  }
}
