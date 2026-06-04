# AI Chat Sidebar - Edge 浏览器扩展

MD3 风格 AI 对话侧边栏，支持 OpenAI 兼容 API。特别优化超星学习通作业自动答题。

## ✨ 功能特性

### 通用 AI 对话
- 🎯 **右侧悬浮球** — 可拖拽定位，点击展开/收起侧边栏（32px，约为原始一半大小）
- ↔️ **拖拽调宽** — 左边缘拖拽调整侧边栏宽度（300px ~ 70%），持久化记忆
- 💬 **流式对话** — 支持 SSE 流式响应，逐 token 实时渲染
- 🎨 **MD3 主题** — Material Design 3，亮色/暗色自动跟随系统
- 📝 **Markdown 渲染** — 标题、列表、代码块（一键复制）、链接
- 🕐 **对话历史** — 自动保存 + 历史面板查看/切换/删除
- ✏ **新建对话** — 一键开启新会话，旧会话自动存入历史

### 🎓 超星学习通自动答题
- 📋 **自动识别** — 检测页面单选题，显示「▶ 自动答题」按钮
- 🤖 **逐题作答** — 提取题目 → 调用 AI → 自动点击选项
- ⏯ **暂停/恢复** — 点击暂停，再次点击继续；长按结束
- 📊 **进度显示** — 按钮自身充当进度条，实时显示 `5/18`
- 📦 **结果面板** — 折叠式答题结果，显示题号+答案+解析
- 💬 **上下文追问** — 每道题的问答存入对话上下文，可继续追问
- 💾 **防丢保护** — 自动点击页面「暂时保存」，暂停/结束/每3题触发
- 🔒 **独立提示词** — 自动答题专用系统提示词，与聊天分离

### 兼容性
- 🔌 OpenAI / DeepSeek / 通义千问 / GLM / Moonshot 等服务商
- ⚙️ 自定义 API 端点（自动补全路径）、Key、模型、系统提示词

## 🚀 安装

1. 打开 Edge，访问 `edge://extensions/`
2. 开启右上角 **"开发人员模式"**
3. 点击 **"加载解压缩的扩展"** → 选择 `my-extension` 文件夹

> 修改 `manifest.json` 后需点击扩展卡片上的 🔄 刷新，再刷新目标页面。

## 📖 使用说明

### 首次配置

1. 点击右侧悬浮球 → 展开侧边栏
2. 头部 ⚙️ → 设置页填写 API 端点 / Key / 模型
3. 保存 → 可选「测试连接」验证

### 日常聊天

| 操作 | 方式 |
|------|------|
| 发送消息 | `Enter` 或点击发送按钮 |
| 换行 | `Shift + Enter` |
| 新建对话 | 头部 ✏ 按钮 |
| 查看历史 | 头部 🕐 按钮 |
| 拖拽悬浮球 | 按住上下拖动 |
| 调整侧边栏宽 | 左侧边缘拖拽 |
| 关闭侧边栏 | ✕ 或点击悬浮球 |

### 自动答题（学习通作业页面）

1. 打开作业页 → 展开侧边栏 → 输入框上方出现「▶ 自动答题」
2. 点击 → 开始逐题作答，按钮显示进度
3. **点击** → 暂停（自动保存），再点击 → 恢复
4. **长按 800ms** → 结束答题（自动保存）
5. 结果面板出现在消息列表中，可折叠/展开
6. 答完后可在聊天框追问（如「第 3 题为什么选 C？」）

### 常用 API 端点

| 服务商 | API 端点 |
|--------|---------|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |
| Moonshot | `https://api.moonshot.cn/v1/chat/completions` |
| GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |

## 📁 项目结构

```
AI_ChatSidebar/
├── manifest.json           # Manifest V3，document_start
├── background.js           # Service Worker：流式聊天 + 自动答题 API
├── content/                # Content Script 模块
│   ├── index.js            # 主入口：DOM 创建、事件编排、聊天核心
│   ├── styles.js           # MD3 主题 CSS (亮色/暗色)
│   ├── icons.js            # SVG 图标常量
│   ├── markdown.js         # Markdown / KaTeX 渲染 (纯工具函数)
│   ├── auto-answer.js      # 超星学习通自动答题
│   ├── settings-panel.js   # 设置面板 (供应商/模型/主题管理)
│   └── history-panel.js    # 历史记录 + 消息渲染
├── lib/                    # KaTeX 数学公式库
├── icons/                  # 16/48/128 px 图标
└── README.md
```

## 🔒 隐私说明

- API Key 存储于 `chrome.storage.sync`，对话历史存储于 `chrome.storage.local`
- 请求直连服务商，不经过第三方
- 对话历史在浏览器本地持久化，可随时管理/删除
