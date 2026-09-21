# OpenCode v2 TUI

[English](README.md) | **简体中文**

<!-- 上传前：把本文件与 package.json 里的 ThinkDonk 替换成你的 GitHub 用户名 -->

[![CI](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 非官方扩展，与 opencode 项目没有隶属或背书关系。

在 VS Code 里运行 [opencode](https://opencode.ai) **v2** 的 TUI，并把当前文件或选区以 `@path#Lx-Ly` 引用注入会话。

## 这是什么

一个面向 **opencode v2** 的 VS Code 扩展。它在 VS Code 里运行 opencode 的终端界面（TUI），并把当前文件或选区以 `@path#Lx-Ly` 引用注入会话。

实现上只做三件事：在集成终端里启动裸 `opencode` 命令、设置 `OPENCODE_CALLER=vscode`、用 `terminal.sendText` 把引用写进 TUI。没有 HTTP 客户端、不解析 stdout、不探测版本，详见[实现方式](#实现方式)。

对应 `@opencode/cli` 的 v2 版本线，也就是直接运行 `opencode` 就进入 TUI 的那一套。

## 命令与键位

| 命令 | Windows / Linux | macOS |
|------|-----------------|-------|
| Open opencode | `Ctrl+Esc` | `Cmd+Esc` |
| Open opencode in new tab | `Ctrl+Shift+Esc` | `Cmd+Shift+Esc` |
| Add file reference to opencode | `Ctrl+Alt+K` | `Cmd+Alt+K` |

- **Open opencode**：已有名为 `opencode` 的终端就复用它（聚焦并把当前引用送进去），没有就分屏新建并启动 TUI。编辑器标题栏也有按钮。
- **Open opencode in new tab**：总是新建一个终端。
- **Add file reference to opencode**：只注入到正在运行的终端，不会顺带启动一个。

引用格式与 opencode 的 `@` 语法一致：`@src/main.ts`，选中单行是 `@src/main.ts#L37`，多行是 `@src/main.ts#L37-42`。写入时不带结尾换行，你可以继续补内容再发送。

> 键位用 `key` 声明 Windows/Linux、用 `mac` 单独覆盖 macOS，所以 `Ctrl+Esc`、`Ctrl+Alt+K` 在非 macOS 平台上同样可用。

## 安装

需要 `PATH` 里有 opencode v2 CLI（`opencode --version` 应输出 `2.x`）。

在扩展市场里搜索 **OpenCode v2 TUI**，或者直接执行：

```bash
code --install-extension ThinkDonk.vscode-opencode-v2
```

也可以从源码构建：

```bash
npm install
npm run package
code --install-extension vscode-opencode-v2-<version>.vsix
```

装完执行一次 `Developer: Reload Window`。

## 设置项

| 设置 | 默认 | 说明 |
|------|------|------|
| `ocv2.binary` | `opencode` | 启动 TUI 的命令，可填完整路径或带参数，例如 `opencode --standalone` |
| `ocv2.terminalName` | `opencode` | 终端名，用于判定是否复用会话。保持默认可复用你手动开的那个终端 |
| `ocv2.injectOnLaunch` | `false` | 新建终端时也注入引用。默认关闭，原因见下 |

## 实现方式

只走终端。扩展只会启动裸 `opencode`（不带任何参数），设置 `OPENCODE_CALLER=vscode`，并用 `terminal.sendText` 把引用写进正在运行的 TUI。它从不调用 opencode 的 HTTP 接口、不解析它的输出、也不探测装的是哪个版本。

## 已知边界

- **启动那一刻不注入引用**。终端刚创建时 TUI 还没接管 stdin，此时发送的字符可能被 shell 当命令执行。安全流程是先 `Ctrl+Esc` 起 TUI，再 `Ctrl+Alt+K` 送引用。确实想冒这个险就把 `ocv2.injectOnLaunch` 设为 `true`。
- **不提供服务端集成**。一切都走终端，所以需要 opencode HTTP 服务的能力 —— 比如在编辑器里预览 diff、会话接口 —— 不在范围内。
- **复用判定只看终端名**。你自己开的、名字等于配置值（默认 `opencode`）的终端会被复用；想要隔离就改 `ocv2.terminalName`。
- **不做版本探测**。把 `ocv2.binary` 指向别的构建，它就只是把它启起来。

## 开发

```bash
npm install
npm run compile      # tsc -p . → out/extension.js
npm test             # 编译 + 冒烟测试
npm run package      # vsce package → vscode-opencode-v2-<version>.vsix
```

`npm test` 跑的是 `test/smoke.js`，一个零依赖冒烟测试：通过 `Module._load` 钩子注入假的 `vscode` 模块，加载编译产物 `out/extension.js`，触发三个命令，断言终端复用、引用格式、`OPENCODE_CALLER` 环境变量，以及启动命令里永远不含 `--port`。不需要起 Extension Development Host。

需要交互调试就在 VS Code 里打开本目录按 `F5`。

## 许可

MIT，见 [LICENSE](LICENSE)。
