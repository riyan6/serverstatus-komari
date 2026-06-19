export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天`
  if (hours > 0) return `${hours}小时`
  return `${minutes}分钟`
}

export function formatOsName(os: string): string {
  const s = os.toLowerCase()
  if (s.includes('debian')) return 'Debian'
  if (s.includes('ubuntu')) return 'Ubuntu'
  if (s.includes('centos')) return 'CentOS'
  if (s.includes('alpine')) return 'Alpine'
  if (s.includes('fedora')) return 'Fedora'
  if (s.includes('arch')) return 'Arch'
  if (s.includes('opensuse') || s.includes('suse')) return 'openSUSE'
  if (s.includes('rocky')) return 'Rocky'
  if (s.includes('almalinux') || s.includes('alma')) return 'AlmaLinux'
  if (s.includes('oracle')) return 'Oracle'
  if (s.includes('rhel') || s.includes('red hat')) return 'RHEL'
  if (s.includes('windows')) return 'Windows'
  if (s.includes('freebsd')) return 'FreeBSD'
  if (s.includes('openbsd')) return 'OpenBSD'
  if (s.includes('netbsd')) return 'NetBSD'
  if (s.includes('openwrt')) return 'OpenWrt'
  if (s.includes('gentoo')) return 'Gentoo'
  if (s.includes('nixos')) return 'NixOS'
  if (s.includes('void')) return 'Void'
  if (s.includes('kali')) return 'Kali'
  if (s.includes('raspbian')) return 'Raspbian'
  if (s.includes('armbian')) return 'Armbian'
  // fallback: first word
  return os.split(' ')[0]
}

export function formatPercent(used: number, total: number): number {
  if (total === 0) return 0
  return Math.round((used / total) * 10000) / 100
}

export function daysRemaining(expiredAt: string | null): number | null {
  if (!expiredAt) return null
  const exp = new Date(expiredAt)
  if (exp.getFullYear() <= 1) return null
  const now = new Date()
  const diff = exp.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// 中文说明：Komari 的 region 可能是旗帜 emoji，也可能直接是地区短码，这里统一转换成大写短码供资源路径复用。
export function normalizeRegionCode(region: string): string {
  if (!region) return ''

  const trimmedRegion = region.trim()
  const asciiCode = trimmedRegion.match(/[A-Za-z]{2}/)?.[0]
  if (asciiCode) {
    return asciiCode.toUpperCase()
  }

  const codePoints = Array.from(trimmedRegion)
    .map(char => char.codePointAt(0))
    .filter((value): value is number => value != null)

  if (codePoints.length === 2 && codePoints.every(value => value >= 0x1F1E6 && value <= 0x1F1FF)) {
    return codePoints
      .map(value => String.fromCharCode(65 + value - 0x1F1E6))
      .join('')
  }

  return ''
}

// 中文说明：旗帜资源统一走相对路径，开发环境由 Vite 代理到后端，生产环境由 Komari 同源提供。
export function getFlagUrl(region: string): string {
  const regionCode = normalizeRegionCode(region)
  if (!regionCode) return ''

  return `/assets/flags/${regionCode}.svg`
}

export function cleanNodeName(name: string): string {
  if (!name) return ''
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
  let cleaned = name.replace(uuidRegex, '')
  cleaned = cleaned
    .replace(/\(\s*\)|\[\s*\]|（\s*）/g, '') // empty parens
    .replace(/\s*[\(\[（\-#:\s]*$/, '') // trailing separators
    .replace(/^[\(\[（\-#:\s]*/, '') // leading separators
    .trim()
  return cleaned || name
}
