import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 中文说明：开发代理目标仅用于本地 dev / preview，生产打包后的主题仍然通过相对路径访问 Komari。
const defaultProxyTarget = 'http://localhost:8080'

// 中文说明：根据模式读取 .env 文件，让本地调试目标可配置，但不把目标域名打进客户端产物。
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const komariProxyTarget = env.KOMARI_PROXY_TARGET || defaultProxyTarget
  const useSecureProxy = komariProxyTarget.startsWith('https://')

  // 中文说明：开发和预览环境统一代理 API 与旗帜资源，前端代码始终只使用相对路径。
  const komariProxy = {
    '/api': {
      target: komariProxyTarget,
      changeOrigin: true,
      ws: true,
      secure: useSecureProxy,
    },
    '/assets/flags': {
      target: komariProxyTarget,
      changeOrigin: true,
      secure: useSecureProxy,
    },
  }

  // 中文说明：开发环境使用根路径 '/'，避免路由跳转警告；生产环境打包使用指定的基准路径。
  const base = command === 'serve' && mode === 'development' ? '/' : '/themes/Koumei/dist/'

  // https://vite.dev/config/
  return {
    plugins: [vue(), tailwindcss()],
    base,
    define: {
      __KOMARI_PROXY_TARGET__: JSON.stringify(komariProxyTarget),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: komariProxy,
    },
    preview: {
      proxy: komariProxy,
    },
  }
})
