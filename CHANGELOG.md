# Changelog / 更新日志

All notable changes to this project will be documented in this file.

---

## [Unreleased]

### ✨ 新功能
- 个人中心新增创作引擎与模型选择体验，支持接入官方服务、OpenAI Compatible 和 Gemini Compatible 服务。
- 创作引擎支持服务识别、模型用途分类、文本模型轻量检测和删除/停用影响确认。

### ⚙️ 优化
- 自定义模型配置改为 canonical 创作引擎结构，并让计费、模板助手和旧 API 配置保存路径保留新的模型元数据。

---

## [v0.2] - 2026-02-28

### ✨ 新功能
- 增加 OpenAI 兼容图片、视频格式支持

### 🐛 修复
- 修复默认模型配置后项目模型需要二次选择的问题
- 修复部分情况 resolution 无法读取的问题
- 修复模型链路为 LangGraph
- 修复默认参数无选择问题
- 修复关闭计费依然触发计费问题
- 修复 openai-compatible 被误判为原生 OpenAI 推理问题
- 修复 JSON 解析失败问题

### ⚙️ 优化
- 修改为默认计费 off
- 增强提示词 JSON 格式限制

---

## [v0.2.1] - 2026-02-28

### 🐛 修复
- 修复 AI 生成内容语言不跟随网站语言设置的问题
- 修复前端 API 请求未携带 Accept-Language header 导致 locale 回退到浏览器默认语言
---

## [v0.1] - 2026-02-27

### 🎉 首次发布
- 项目初始开源版本
