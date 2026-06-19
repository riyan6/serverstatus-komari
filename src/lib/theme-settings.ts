import type { ThemeMode } from '@/composables/useThemeMode'

export type GroupViewMode = 'grouped' | 'all'

export interface ManagedThemeSettings {
  defaultGroupView: GroupViewMode
  defaultAppearance: ThemeMode
  patternColorLight: string
  patternColorDark: string
}

export const DEFAULT_MANAGED_THEME_SETTINGS: ManagedThemeSettings = {
  defaultGroupView: 'grouped',
  defaultAppearance: 'light',
  patternColorLight: '#3d3b4d',
  patternColorDark: '#fbfbfb',
}

function parseGroupViewMode(value: unknown): GroupViewMode | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toLowerCase()

  if (normalizedValue === 'grouped' || normalizedValue === 'group' || normalizedValue === '分组') {
    return 'grouped'
  }

  if (normalizedValue === 'all' || normalizedValue === '全部') {
    return 'all'
  }

  return null
}

function parseThemeMode(value: unknown): ThemeMode | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toLowerCase()

  if (normalizedValue === 'light' || normalizedValue === '浅色') {
    return 'light'
  }

  if (normalizedValue === 'dark' || normalizedValue === '深色') {
    return 'dark'
  }

  if (normalizedValue === 'auto' || normalizedValue === 'system' || normalizedValue === '自动') {
    return 'auto'
  }

  return null
}

function parseColorValue(value: unknown, fallbackValue: string): string {
  if (typeof value !== 'string') {
    return fallbackValue
  }

  const normalizedValue = value.trim()

  return normalizedValue || fallbackValue
}

export function resolveManagedThemeSettings(
  themeSettings: Record<string, unknown> | null | undefined,
): ManagedThemeSettings {
  const settings = themeSettings ?? {}

  // 中文说明：服务端动态配置可能为空、缺字段或仍是旧版本数据，这里统一做兜底，避免页面因为配置缺失而失效。
  return {
    defaultGroupView: parseGroupViewMode(settings.default_group_view) ?? DEFAULT_MANAGED_THEME_SETTINGS.defaultGroupView,
    defaultAppearance: parseThemeMode(settings.default_appearance) ?? DEFAULT_MANAGED_THEME_SETTINGS.defaultAppearance,
    patternColorLight: parseColorValue(settings.pattern_color_light, DEFAULT_MANAGED_THEME_SETTINGS.patternColorLight),
    patternColorDark: parseColorValue(settings.pattern_color_dark, DEFAULT_MANAGED_THEME_SETTINGS.patternColorDark),
  }
}
