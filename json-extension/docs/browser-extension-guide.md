# 浏览器扩展开发指南

以 Chrome Manifest V3 为例，讲解开发一个完整扩展的必要步骤。

---

## 一、基础架构

Chrome 扩展由以下核心部分组成：

| 文件 | 作用 |
|------|------|
| `manifest.json` | 扩展配置文件，定义元数据、权限、入口 |
| `background.js` | Service Worker，后台脚本，监听浏览器事件 |
| `popup.html/js/css` | 点击图标弹出的 UI 界面 |
| `content.js` | 注入到网页的脚本，可操作 DOM |
| `web_accessible_resources` | 可被网页或新标签页访问的扩展资源 |

---

## 二、manifest.json — 入口配置

```json
{
  "manifest_version": 3,
  "name": "扩展名称",
  "version": "1.0.0",
  "description": "扩展描述",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_title": "工具提示文字",
    "default_icon": { "16": "icons/icon16.png" }
  },
  "background": {
    "service_worker": "background.js"
  },
  "permissions": ["tabs", "storage", "activeTab"],
  "web_accessible_resources": [
    { "resources": ["fullpage.html"], "matches": ["<all_urls>"] }
  ]
}
```

**关键说明：**

- `action.default_popup` 与 `action` 二选一：
  - 设 `default_popup` → 点击图标弹窗
  - 不设 → 用 `background.js` 的 `chrome.action.onClicked` 事件自定义行为
- `permissions` 决定能访问哪些 API（如 `tabs` 才能创建标签页）
- `web_accessible_resources` 内的文件可被外部网页访问

---

## 三、background.js — Service Worker

取代了老版本的 Background Page，是扩展的"后台大脑"。

### 基本示例

```javascript
// 监听图标点击
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') });
});

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('扩展已安装');
});
```

### 生命周期

- 按需启动：事件触发时激活，空闲时销毁
- 无法保留长期状态，所有数据需存 `chrome.storage.local` 或 `localStorage`
- 不能操作 DOM

### 常用 API

| API | 作用 |
|-----|------|
| `chrome.tabs.create()` | 打开新标签页 |
| `chrome.tabs.sendMessage()` | 向标签页发送消息 |
| `chrome.storage.local.set()` | 持久化存储 |
| `chrome.runtime.getURL()` | 获取扩展内资源路径 |

---

## 四、Popup — 弹窗 UI

### 特点

- 普通的 HTML + CSS + JS
- 生命周期短：打开时加载，关闭时销毁
- 通过 `chrome.runtime` 与 background 通信

### 创建步骤

1. 在 `manifest.json` 中设置 `"default_popup": "popup.html"`
2. 创建 `popup.html` 作为弹窗内容
3. 引入 `popup.css` 和 `popup.js`

### 通信示例

```javascript
// popup.js 发送消息
chrome.runtime.sendMessage({ type: 'DO_SOMETHING', data: value });

// background.js 接收
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DO_SOMETHING') {
    // 处理逻辑
  }
});
```

---

## 五、全屏页面 — 独立标签页

如果弹窗 UI 受限，可以选择在新标签页打开完整页面。

### 实现方式

```javascript
// manifest.json：移除 default_popup，用 background 处理点击
"action": {
  "default_title": "扩展名"
}

// background.js
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') });
});
```

### fullpage.html 结构

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
  <link rel="stylesheet" href="fullpage.css">
</head>
<body>
  <div class="app">
    <!-- 完整页面内容 -->
  </div>
  <script src="lib/jsonrepair.js"></script>
  <script src="popup.js"></script>
  <script src="fullpage.js"></script>
</body>
</html>
```

注意：fullpage.js 在 popup.js 之后加载，可用于隐藏不需要的元素（如"全屏展开"按钮）。

---

## 六、Content Script — 注入网页的脚本

可以读取和修改网页 DOM，但运行在隔离的 JS 环境中。

### 配置

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "css": ["injected.css"]
  }
]
```

### 特点

- 与页面脚本隔离，不会互相冲突
- 可以使用 `window.postMessage` 与页面通信
- 无法访问页面脚本定义的变量和函数

---

## 七、性能优化

### 1. 字体加载优化

避免在 CSS 中使用阻塞式 `@import`：

```html
<!-- popup.html / fullpage.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap"
      rel="stylesheet" media="print" onload="this.media='all'">
```

```css
/* popup.css — 不要用 @import */
*, *::before, *::after { box-sizing: border-box; }
```

### 2. 脚本执行时机

- `defer` / `module` 脚本按顺序执行
- 避免在 `head` 中放置耗时脚本
- 事件监听使用 `addEventListener` 而非内联 `onclick`

---

## 八、开发调试

### 加载扩展

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择扩展根目录

### 调试方式

| 目标 | 调试方法 |
|------|----------|
| popup | 右键点击扩展图标 → 检查 |
| background | chrome://extensions → Service Worker 链接 |
| fullpage | 正常在新标签页，F12 开发者工具 |
| content script | 在目标网页的 DevTools Console 切换上下文 |

### 热重载

Manifest V3 的 Service Worker 不会自动热重载，需在 `chrome://extensions` 点击「重新加载」。

---

## 九、完整开发流程

1. **明确需求**：是弹窗 UI 还是全屏页面？需要哪些权限？
2. **创建 manifest.json**：配置基本信息、图标、入口
3. **实现 background.js**：处理点击事件、页面跳转
4. **创建 UI 页面**：popup.html 或 fullpage.html + CSS
5. **实现业务逻辑**：popup.js 中编写核心功能
6. **测试调试**：在 chrome://extensions 加载并排查问题
7. **打包发布**：压缩为 .crx 或上传 Chrome Web Store

---

## 十、注意事项

1. **权限最小化**：只申请必要的权限，审核更易通过
2. **HTTPS 要求**：大部分 Chrome API 仅在 HTTPS 页面可用
3. **Service Worker 限制**：无法使用 `alert()`、`prompt()`、`confirm()`
4. **跨域限制**：background 无法直接请求任意跨域 URL，需通过 `fetch` 或配置权限
5. **CSP 策略**：默认限制内联脚本和远程脚本，需通过配置或外部资源解决

---

## 相关资源

- [Chrome Extensions 官方文档](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/develop/migrate)
- [Chrome API 参考](https://developer.chrome.com/docs/extensions/reference/)
