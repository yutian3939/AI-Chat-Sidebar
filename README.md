# AI Chat Sidebar - Edge 浏览器扩展

一个遵循 Material Design 3 设计语言的 AI 对话侧边栏浏览器扩展，支持任何 OpenAI 兼容格式的 API 服务商。

## ✨ 功能特性

- 🎯 **右侧悬浮球** - 可拖拽定位，点击展开/收起侧边栏
- 💬 **AI 对话** - 支持流式响应（Streaming），实时显示 AI 回复
- 🎨 **MD3 设计** - 遵循 Material Design 3 设计规范，支持亮色/暗色主题
- ⚙️ **自定义配置** - 支持自定义 API 端点、API Key、模型名称和系统提示词
- 📝 **Markdown 渲染** - 支持标题、列表、代码块、链接等格式
- 📋 **代码复制** - 代码块一键复制
- 🔌 **广泛兼容** - 支持 OpenAI、DeepSeek、通义千问、GLM、Moonshot 等服务商

## 🚀 安装方法

1. 打开 Edge 浏览器，访问 `edge://extensions/`
2. 开启右上角 **"开发人员模式"**
3. 点击 **"加载解压缩的扩展"**
4. 选择本项目文件夹 `my-extension`

## 📖 使用说明

### 首次配置

1. 点击页面右侧的紫色悬浮球（AI 图标）
2. 在侧边栏顶部点击 ⚙️ 设置按钮
3. 填写以下信息：
   - **API 端点** - 你的服务商 Chat Completions 接口地址
   - **API Key** - 你的 API 密钥
   - **模型名称** - 使用的模型（如 `gpt-4o`、`deepseek-chat`）
   - **系统提示词** - AI 的角色设定（可选）
4. 点击 **"保存设置"**
5. 可选：点击 **"测试连接"** 验证配置是否正确

### 常用 API 端点示例

| 服务商 | API 端点 |
|--------|---------|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |
| Moonshot | `https://api.moonshot.cn/v1/chat/completions` |
| GLM (智谱) | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |

### 日常使用

- **发送消息** - 在输入框输入文字，按 `Enter` 或点击发送按钮
- **换行** - 按 `Shift + Enter`
- **拖拽悬浮球** - 按住悬浮球上下拖动调整位置
- **清空对话** - 点击侧边栏顶部的 🗑️ 按钮
- **关闭侧边栏** - 点击 ✕ 按钮或再次点击悬浮球

## 📁 项目结构

```
my-extension/
├── manifest.json      # 扩展清单 (Manifest V3)
├── background.js      # Service Worker - 处理 API 流式请求
├── content.js         # Content Script - 悬浮球 + 侧边栏 UI
├── settings.html      # 设置页面
├── settings.css       # 设置页面样式
├── settings.js        # 设置页面逻辑
├── icons/             # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 🔒 隐私说明

- API Key 存储在浏览器本地同步存储中（`chrome.storage.sync`）
- 所有 API 请求直接从浏览器发送到配置的服务商，不经过任何第三方服务器
- 对话历史仅在页面会话期间保留在内存中，刷新页面即清除
