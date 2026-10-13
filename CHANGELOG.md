# Changelog

本项目的版本变更记录，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0] - 2026-10-13

### Added

- 资源管理器右键与命令面板批量添加文件引用，支持多选、去重和含空格路径；无效文件使整批取消
- 诊断快速修复及当前文件错误／警告多选，生成带文件、行号、来源和编号的可编辑草稿
- 选区提示词模板：解释代码、检查问题、生成测试、重构建议，加入前可编辑
- 新功能只写入原有终端，不自动提交；取消弹窗或原终端关闭时不发送
- 中英文命令、提示、模板文案与对应冒烟测试

### Fixed

- 选区在下一行第 0 列结束时，不再把该行计入引用
- 运行时提示根据 VS Code 界面语言选择中文或英文兜底
- 诊断换行合并为单行；拒绝带控制字符的路径与编辑后的草稿

## [0.1.0] - 2026-09-21

首个版本。

### Added

- 三个命令：`Open opencode`（复用或新建名为 `opencode` 的终端并启动 v2 TUI）、`Open opencode in new tab`（总是新建）、`Add file reference to opencode`（把当前文件/选区引用注入已运行的终端）
- 键位 `Ctrl+Esc` / `Ctrl+Shift+Esc` / `Ctrl+Alt+K`，`mac` 平台分别覆盖为 `Cmd+Esc` / `Cmd+Shift+Esc` / `Cmd+Alt+K`
- 编辑器标题栏按钮
- 设置项 `ocv2.binary`、`ocv2.terminalName`、`ocv2.injectOnLaunch`
- 启动时设置 `OPENCODE_CALLER=vscode`
- 零依赖冒烟测试 `test/smoke.js`（伪造 `vscode` 模块，9 条断言）

### Notes

- 只走终端通道：不调用 opencode 的 HTTP 接口、不解析 stdout、不探测版本，因此不受 CLI 接口变更影响
- 终端复用依据名字 `opencode`；需要隔离时改 `ocv2.terminalName`

[Unreleased]: https://github.com/ThinkDonk/vscode-opencode-v2/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ThinkDonk/vscode-opencode-v2/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ThinkDonk/vscode-opencode-v2/releases/tag/v0.1.0
