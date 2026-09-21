# Changelog

本项目的版本变更记录，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

- 只走终端通道，不使用 opencode 的任何 HTTP 接口，因此不受 v1 → v2 接口变更影响
- 与 `sst-dev.opencode` 存在终端名冲突，同时安装时需禁用后者

[Unreleased]: https://github.com/ThinkDonk/vscode-opencode-v2/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ThinkDonk/vscode-opencode-v2/releases/tag/v0.1.0
