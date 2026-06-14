# Repository Guidelines

## 项目结构与模块组织

本仓库是 Vite + Vue 3 + TypeScript 的 Komari 主题项目。入口文件位于 `src/main.ts`，主页面在 `src/App.vue`。业务组件集中在 `src/components/`，其中 `src/components/ui/` 存放 shadcn-vue/reka-ui 风格的基础组件。组合式逻辑放在 `src/composables/`，类型定义放在 `src/types/`，模拟数据放在 `src/mock/`，通用工具放在 `src/lib/`。样式入口是 `src/assets/main.css`，会被 Vite 打包的图片资源放在 `src/assets/`；无需打包、以根路径访问的资源放在 `public/`。

## 构建、测试与开发命令

- `yarn install`：按 `yarn.lock` 安装依赖，当前项目使用 Yarn 1。
- `yarn dev`：启动 Vite 开发服务器，并通过 `vite.config.ts` 代理 `/api`、`/assets/flags` 到 `KOMARI_PROXY_TARGET` 或默认 `http://localhost:8080`。
- `yarn build`：先运行 `vue-tsc -b` 做类型检查，再执行生产构建。
- `yarn preview`：本地预览构建结果，同样复用代理配置。

## 编码风格与命名约定

Vue 单文件组件使用 `<script setup lang="ts">`。保持 2 空格缩进、单引号、无分号的现有风格。组件文件使用 PascalCase，例如 `NodeGrid.vue`；组合式函数使用 `useXxx.ts`；类型从 `src/types/` 导出。优先使用 `@/` 路径别名，不要写跨多级的相对路径。新增代码中的必要注释使用中文，说明业务意图或复杂逻辑，避免重复描述代码本身。

## 测试指南

当前未配置自动化测试框架，也没有 `test` 脚本。提交前至少运行 `yarn build`，确保类型检查和生产构建通过。若新增测试，建议使用 Vitest，并将用例命名为 `*.spec.ts`，放在被测模块旁边或 `src/__tests__/`，同时在 `package.json` 增加 `test` 脚本。

## 提交与 Pull Request 规范

近期提交混合使用 `feat:`、`refactor:` 和中文摘要。建议继续使用简短祈使句，格式如 `feat: 增加节点筛选`、`refactor: 调整详情页数据流`。PR 需要说明变更目的、影响范围、验证命令；涉及界面变更时附截图或录屏；涉及接口、代理或环境变量时注明配置方式与兼容性。

## 配置与安全提示

本地后端地址通过 `.env` 中的 `KOMARI_PROXY_TARGET` 配置，不要把私有域名、Token 或 Cookie 写入源码。前端请求应保持相对路径，生产主题由 Komari 所在域名提供 API。

## Agent 专用说明

所有交流使用中文。修改代码时沿用仓库既有结构和风格，新增注释使用中文，并优先通过 `yarn build` 验证结果。
