# Koumei Theme

Koumei 是一个用于 Komari Monitor 的前端主题，基于 `Vue 3 + TypeScript + Vite` 构建。

## 开发说明

- 使用 `yarn install` 安装依赖
- 使用 `yarn build` 执行类型检查与生产构建
- 不要在本项目中启动 `dev` 或 `preview` 服务，按仓库约定仅进行静态构建验证

## 主题能力

- 首页服务器状态展示
- 分组 / 全部视图切换，并持久化用户选择
- 浅色 / 深色 / 自动外观切换，并持久化用户选择
- 支持 Komari 1.0.5+ 的主题动态配置

## 动态配置项

当前主题已在 `komari-theme.json` 中声明以下动态配置：

- 默认分组显示方式
- 默认外观模式
- 浅色模式涂鸦颜色
- 深色模式涂鸦颜色
