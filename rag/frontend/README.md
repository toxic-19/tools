# RAG Frontend

基于 React + Vite + Tailwind CSS 的 RAG 知识库问答平台前端。

## 功能

- 💬 **智能问答**: 基于向量检索 + Rerank 的 RAG 问答
- 📁 **文档管理**: 上传和批量导入文档
- ⚙️ **系统配置**: 查看系统配置和 RAG 流程
- 🎨 **主题切换**: 5 种主题（默认蓝、琥珀暖、翡翠绿、玫瑰金、暗夜紫）
- 📐 **布局切换**: 3 种布局（侧边栏、居中、全屏）
- ✨ **风格切换**: 3 种风格（默认、玻璃、极简）

## 开发

### 安装依赖

```bash
cd frontend
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:3000

### 构建

```bash
npm run build
```

构建产物在 `../static` 目录

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS

## 目录结构

```
frontend/
├── src/
│   ├── api/          # API 调用
│   ├── components/    # React 组件
│   ├── hooks/        # 自定义 Hooks
│   ├── styles/       # 全局样式
│   ├── App.tsx       # 主应用
│   └── main.tsx      # 入口文件
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

## 布局说明

| 布局 | 说明 |
|------|------|
| 侧边栏 | 经典后台管理布局，左侧固定导航 |
| 居中 | 对话界面，居中显示最大 800px |
| 全屏 | 沉浸式对话，最大宽度 900px |

## 主题说明

| 主题 | 主色 | 适合场景 |
|------|------|----------|
| 默认蓝 | #4F7CF8 | 通用 |
| 琥珀暖 | #D4A574 | 知识库、学术 |
| 翡翠绿 | #10B981 | AI 原生 |
| 玫瑰金 | #E879A9 | 现代、女性向 |
| 暗夜紫 | #A78BFA | 极客、开发者 |
