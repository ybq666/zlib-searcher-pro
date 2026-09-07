<div align="center">

# 📚 Z-Library 搜索下载助手 (Z-Library Searcher Pro)

**为科研、学习与阅读而生的高速 Z-Library 图书检索与直链下载 Chrome 扩展**

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Vite](https://img.shields.io/badge/Build%20Tool-Vite%206-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/ybq666/zlib-searcher-pro/pulls)

</div>

---

## 📖 项目简介

[Z-Library](https://zh.wikipedia.org/wiki/Z-Library) 是全球最大的数字图书共享平台之一，包含千万级电子书与论文期刊资源。

原版浏览器扩展往往存在**域名写死、国内无法访问即瘫痪、不支持自定义镜像、无法按格式筛选**等痛点。**Z-Library Searcher Pro** 深度结合了 [ZLibrary Searcher](https://chromewebstore.google.com/detail/zlibrary-searcher/hacdelicpoafdkmkehadcdfkmkakiclf) 的底层直链接口与 [Awesome-Zlibrary](https://github.com/dongyubin/Awesome-Zlibrary) 的动态可用镜像情报，打造出一款**永不失联、国内直连可用、自带多节点测速选优与自动云端镜像爬虫**的全新浏览器扩展。

---

## ✨ 核心特性对比

| 功能特性 | 原版应用商店插件 | **Z-Library Searcher Pro (本项目)** |
| :--- | :--- | :--- |
| **镜像支持** | 硬编码 `z-library.sk`，失效即瘫痪 | **内置最新官方镜像群，支持添加任意私有域名** |
| **云端镜像爬取** | ❌ 无 | **✅ 自动/手动同步 Awesome-Zlibrary 最新可用源** |
| **延迟测速选路** | ❌ 无 | **✅ 一键并发测速，毫秒级标注，自动切换最快节点** |
| **网络权限机制** | 固定死少数域名 | **✅ 采用 `optional_host_permissions`，支持任意新域名** |
| **格式快速筛选** | ❌ 无筛选 | **✅ 支持 EPUB、PDF、MOBI、AZW3、TXT 一键过滤** |
| **身份认证机制** | 仅支持固定站 Cookie | **✅ 多站 Cookie 自动嗅探 + 手动 Token 备份双保障** |
| **界面与国际化** | 简陋英文界面 | **✅ 现代化全中文交互、卡片排版、会话自动记忆** |
| **数据安全性** | 本地直连 | **✅ 纯客户端交互，无任何第三方中转服务器，安全透明** |

---

## 🚀 快速安装与使用

### 方法一：免编译直接加载（推荐普通用户）

本仓库已预先打包了最新的生产就绪产物，**无需安装任何开发环境**，即可直接在 Chrome / Edge 中安装：

1. **下载代码仓库**：
   - 点击右上角绿色的 **Code** 按钮 -> 点击 **Download ZIP**；
   - 将下载的压缩包解压到您的电脑任意目录。
2. **打开浏览器扩展管理页面**：
   - 在 Chrome 浏览器地址栏中输入：`chrome://extensions/` 并回车；
   - （Edge 浏览器输入：`edge://extensions/`）。
3. **开启开发者模式**：
   - 在扩展管理页面右上角，打开 **“开发者模式” (Developer mode)** 开关。
4. **加载扩展程序**：
   - 点击左上角出现的 **“加载已解压的扩展程序” (Load unpacked)** 按钮；
   - 在弹出的文件夹选择框中，选中解压目录下的 **`dist`** 文件夹。
5. **固定扩展图标**：
   - 点击浏览器右上角拼图图标，将 **Z-Library 搜索助手** 固定在工具栏，点击图标即可开启高速检索！

---

### 方法二：本地源码二次开发与编译（开发者）

本项目基于现代化的前端工具链构建，Node.js 环境下编译仅需 100ms：

```bash
# 1. 克隆代码仓库
git clone https://github.com/ybq666/zlib-searcher-pro.git
cd zlib-searcher-pro

# 2. 安装依赖
npm install

# 3. 生产环境构建打包 (输出到 dist 目录)
npm run build

# 4. 开发热重载模式 (可选)
npm run dev
```

编译完成后，按照方法一将 `dist` 文件夹加载到浏览器即可。

---

## 💡 详细功能与操作指南

### 1. 🔍 图书高速检索与格式筛选
- 点击扩展图标呼出弹窗，在搜索框中输入**书名、作者、ISBN、出版社**即可实时检索；
- 支持在搜索框下方快速点击 **EPUB / PDF / MOBI / AZW3 / TXT** 药丸标签，直接过滤目标图书格式；
- 页面具备**智能滚动加载**与**会话记忆功能**，即使临时关闭弹窗再打开，上次搜索结果与位置依然完整保留。

### 2. ⚡ 镜像延迟测速与自动选优
- 点击弹窗右上角的节点状态标签，或点击齿轮图标进入 **“设置中心”**；
- 点击 **“一键全面测速”**，插件将并发对所有已知镜像发起网络连通性与响应时间（Ping）测试；
- 绿色（<350ms）、黄色（350~800ms）、红色（>800ms/超时）清晰展示当前网络下各节点的可用性；
- 点击 **“自动优选最快节点”**，系统会自动选择延迟最低的可用站点作为默认请求通道。

### 3. 🔄 自动同步 Awesome-Zlibrary 云端镜像源
- 针对 Z-Library 域名轮换频繁的问题，插件内置镜像源自动爬虫；
- **定时后台自动同步**：默认每 24 小时在后台自动从 [Awesome-Zlibrary](https://github.com/dongyubin/Awesome-Zlibrary) 抓取经国内网络验证通过的可用镜像源；
- **手动立即同步**：在设置中心点击 **“同步云端镜像源”** 按钮，秒级拉取最新官方/镜像地址并智能合并。

### 4. ➕ 添加自定义专属节点
- 如果您拥有个人专有域名（Personal Domain）或自建反代镜像：
- 在设置中心点击 **“+ 添加自定义节点”**，输入名称与网址（如 `https://my-zlib-domain.com`）；
- 插件会自动根据 Manifest V3 标准向 Chrome 动态申请该域名的通信权限，并立即进行连通性测试。

### 5. 🔑 账号登录凭据与下载配额
- **自动嗅探**：在浏览器中登录任意 Z-Library 镜像后，插件会自动通过 Cookie 读取 `remix_userid` 与 `remix_userkey`，顶部实时显示当日下载额度；
- **手动填入**：若因隐私拦截未读到 Cookie，可在设置中心手动填入凭据：
  1. 打开任意 Z-Library 站点并登录；
  2. 按 <kbd>F12</kbd> 打开开发者工具，选择 **Application (应用)** -> **Cookies**；
  3. 找到并复制 `remix_userid` 和 `remix_userkey` 的值，粘贴保存即可。

---

## 📂 项目结构概览

```text
zlib-searcher-pro/
├── dist/                  # 生产环境编译产物（Chrome 直接加载此目录）
├── public/                # 静态静态资源
│   ├── manifest.json      # Chrome 扩展 Manifest V3 核心声明清单
│   └── icons/             # 16/32/48/128 各分辨率原生 PNG 图标
├── src/
│   ├── popup/             # 扩展主弹窗界面 (HTML / TypeScript / SCSS 样式)
│   ├── options/           # 设置中心界面 (节点测速管理 / 凭据维护 / 偏好配置)
│   ├── services/          # 核心业务服务层
│   │   ├── mirrorCrawler.ts # Awesome-Zlibrary 镜像源在线爬虫与智能合并
│   │   ├── nodeManager.ts   # 节点并发测速、动态权限申请与最优选路
│   │   ├── auth.ts          # Cookie 嗅探、手动凭据回退与用户配额读取
│   │   ├── api.ts           # Z-Library EAPI 官方协议封装与直链解析
│   │   └── storage.ts       # 统一本地持久化缓存管理
│   └── types/             # TypeScript 全局接口与类型声明
├── scripts/
│   └── generate_icons.py  # 图标自动化生成脚本
├── package.json           # 项目依赖与构建脚本
├── tsconfig.json          # TypeScript 严格类型配置
└── vite.config.ts         # Vite 针对 Chrome MV3 多入口构建配置
```

---

## ❓ 常见问题 (FAQ)

<details>
<summary><b>Q1: 为什么搜索图书时提示“连接超时”或“检索失败”？</b></summary>
A: 某些特定镜像可能在部分地区网络运营商被临时阻断。建议点击扩展右上角的齿轮进入设置中心，点击<b>“一键全面测速”</b>，并点击<b>“自动优选最快节点”</b>或切换到其他显示绿色的可用节点即可恢复正常。
</details>

<details>
<summary><b>Q2: 下载书籍时提示“需要登录”？</b></summary>
A: Z-Library 官方接口要求普通用户每日下载图书必须带有身份标识。您只需在任意官方镜像站登录您的账号，或者在插件设置中心手动填入您的 <code>remix_userid</code> 与 <code>remix_userkey</code> 凭据即可开始无限直链下载。
</details>

<details>
<summary><b>Q3: 该扩展是否会收集或上传我的账号信息？</b></summary>
A: <b>绝无可能</b>。本项目完全开源，代码透明，采用纯客户端架构，搜索与下载请求直接向 Z-Library 官方节点发起，不经过任何第三方服务器中转，不包含任何跟踪或数据上报代码。
</details>

---

## ⚖️ 免责声明 (Disclaimer)

- 本项目仅供前端技术研究、学习与学术交流使用；
- 本扩展不存储任何电子书文件，所有图书检索与下载数据均直接来源于用户所选择的第三方网络公开节点；
- 请在遵守当地法律法规的前提下使用本工具，支持正版图书与作者权益。

---

## 🤝 鸣谢与致敬

- [balldk/zlib-extension](https://github.com/balldk/zlib-extension) - 启发了底层的 EAPI 交互思路与原版插件实现
- [dongyubin/Awesome-Zlibrary](https://github.com/dongyubin/Awesome-Zlibrary) - 提供持续更新的高质量官方镜像网址情报
- [Google Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 开源许可证。
