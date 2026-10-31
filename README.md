<p align="center">
  <img src="./public/icon/rounded_image.png" alt="xb" width="96" />
</p>

<h1 align="center">xb · 油猴版</h1>

<p align="center">
  <strong>Redesign Weibo</strong>
</p>

<p align="center">like X but even better.</p>

<p align="right">
  <a href="./README.en.md">English</a>
  ·
  <a href="https://github.com/dddaniel1/xb">本仓库</a>
  ·
  <a href="https://github.com/nnecec/xb">上游项目</a>
</p>

[![CI](https://github.com/dddaniel1/xb/actions/workflows/test.yml/badge.svg)](https://github.com/dddaniel1/xb/actions/workflows/test.yml)
[![License](https://img.shields.io/github/license/dddaniel1/xb)](https://github.com/dddaniel1/xb/blob/main/LICENSE)

[![Tampermonkey](https://img.shields.io/badge/userscript-Tampermonkey-000000?logo=tampermonkey&logoColor=white)](https://www.tampermonkey.net/)
[![vite-plugin-monkey](https://img.shields.io/badge/build-vite--plugin--monkey-646CFF)](https://github.com/lisonge/vite-plugin-monkey)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.3-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

![preview](./assets/xb_1.9.0.webp)

xb 把微博重写成 X 风格的专注阅读界面：去广告、去干扰、清爽时间线。

这个仓库是 [nnecec/xb](https://github.com/nnecec/xb) 的 **油猴脚本版**。界面、数据层和交互沿用原项目，构建方式从 WXT 浏览器扩展换成了 [vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey)，产物是单个 `xb.user.js`。

## 安装

1. 在浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（Violentmonkey 也可以）。
2. 直接打开安装地址：
   <https://raw.githubusercontent.com/dddaniel1/xb/main/dist/xb.user.js>
   Tampermonkey 会自动弹出安装页。也可以在本仓库执行 `pnpm install && pnpm build` 后，把 `dist/xb.user.js` 拖进浏览器窗口。
3. 脚本头部已配置 `@updateURL` / `@downloadURL`，以后仓库更新版本时 Tampermonkey 会自动检查更新。
4. 打开 <https://weibo.com/>，脚本会在页面加载时接管界面。

> 首次使用「话题搜索 / 未读提醒」时，脚本会请求 `m.weibo.cn`，Tampermonkey 可能弹窗询问 `GM_cookie` 权限，允许即可。

## 功能特点

1. ✨ **X 风格** — 简洁纯粹，阅读优先
2. 🔓 **完全开源** — 代码可审计
3. 🎯 **聚焦阅读** — 无干扰、清楚的信息流
4. 🚫 **减少干扰** — 默认隐藏贴图、广告等干扰，超话卡片可按需开启
5. 🆓 **完全免费** — 没有付费功能
6. 📷 **生图** — 把微博导出成图片，支持多种卡片模板
7. 🔤 **自定义字体** — 支持系统字体和可下载的开源字体
8. 🎨 **自定义主题** — 支持自定义主题配色
9. 📅 **浏览历史** — 本地记录浏览历史
10. ⬇️ **自由下载** — 支持下载和批量下载微博图片和视频

设置入口在界面右下角的 xb 面板里（与原扩展一致）。

## 开发

需要 Node.js ≥ 20 与 pnpm。

```bash
pnpm install
pnpm dev        # 启动 Vite，并在浏览器打开 userscript 安装页（支持热更新）
pnpm build      # 产出 dist/xb.user.js 与 dist/xb.meta.js
pnpm compile    # TypeScript 类型检查
pnpm test:unit  # Vitest
pnpm smoke      # 用 jsdom 加载构建产物做冒烟测试
```

开发时 Tampermonkey 会安装一个带 `dev:` 前缀的临时脚本，指向 Vite 开发服务器；修改代码后刷新微博页面即可。

### 目录结构

```
src/
├── userscript.tsx        # 油猴入口：GM shim、防闪屏、历史桥、挂载 React
├── lib/platform/         # GM_* 封装、browser.* 兼容层、Shadow DOM 挂载、下载/API 代理
├── lib/weibo/            # 原项目的微博数据层、组件、页面、路由
├── components/ui/        # shadcn/ui
└── assets/global.css     # Tailwind 4 + 主题 token
```

## 与扩展版的差异

| 能力       | 扩展版                               | 油猴版                             |
| ---------- | ------------------------------------ | ---------------------------------- |
| 安装方式   | Chrome / Firefox / Edge 商店         | Tampermonkey 导入 `xb.user.js`     |
| 构建       | WXT + Manifest V3                    | vite-plugin-monkey + Vite          |
| 设置存储   | `chrome.storage.local`               | `GM_getValue` / `GM_setValue`      |
| 微博 API   | 页面上下文注入 + postMessage 桥      | axios + `GM_xmlhttpRequest` 适配器 |
| 媒体下载   | 后台 Service Worker + DNR 请求头规则 | `GM_xmlhttpRequest` 直连 CDN       |
| m.weibo.cn | 后台代理 + `chrome.cookies`          | `GM_xmlhttpRequest` + `GM_cookie`  |
| UI 隔离    | Shadow Root（扩展 API）              | Shadow Root（原生 attachShadow）   |
| 产物       | 扩展 zip                             | 单文件 `xb.user.js`（约 7 MB）     |

## 致谢

- 原作者 [nnecec](https://github.com/nnecec) 与 [xb](https://github.com/nnecec/xb)
- 受 [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) 和
  [BewlyCat](https://github.com/keleus/BewlyCat) 启发
- [Linux Do](https://linux.do/) 友好的中文社区
