# OpenCode v2 TUI

[English](README.md) | **简体中文**

<!-- 上传前：把本文件与 package.json 里的 ThinkDonk 替换成你的 GitHub 用户名 -->

[![CI](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 非官方扩展，与 opencode 项目没有隶属或背书关系。

在 VS Code 里运行 [opencode](https://opencode.ai) **v2** 的 TUI，并把当前文件或选区以 `@path#Lx-Ly` 引用注入会话。

## 为什么有这个东西

SST 的 `opencode for VS Code` 扩展最后发布于 **2025-12-28**（v0.0.13），启动方式还是 v1 那一套：

```
opencode --port ${port}          # 再用 HTTP 轮询 localhost:port/app、POST /tui/append-prompt
```

而 opencode v2（npm 包 `@opencode/cli`，2026-09-02 首发）删掉了根命令的 `--port`，改成常驻后台服务 + 独立的 `serve` 子命令。于是官方扩展在 v2 上直接报 `Unrecognized flag: --port`（issue [#49992](https://github.com/anomalyco/opencode/issues/49992)）。同门的 `sst-dev.opencode-v2`（"OpenCode Beta"）等的是 v2 已经不再打印的 stdout 标记，结果是 15 秒超时（issue [#50043](https://github.com/anomalyco/opencode/issues/50043)）。

上游的修复是 PR [#49084](https://github.com/anomalyco/opencode/pull/49084)（2026-09-15 提交，至今未合并），做的事是**去掉 `--port`、删掉 HTTP 轮询、注入引用改用 `terminal.sendText`**。**本扩展就是那个思路的重写版** —— 不碰 HTTP API，不解析 stdout，只走终端文本通道。

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

> 官方扩展的键位只声明了 `cmd+escape` / `cmd+alt+k`，而 `cmd` 在 Windows 和 Linux 上并不存在，所以它 README 里承诺的 `Ctrl+Esc` 在那两个平台上是失效的。本扩展把 `key` 和 `mac` 分开声明，两端都可用。

## 安装

需要 `PATH` 里有 opencode v2 CLI（`opencode --version` 应输出 `2.x`）。

```bash
# 用已打包的 vsix
code --install-extension vscode-opencode-v2-0.1.0.vsix

# 或自己构建
npm install
npm run package
code --install-extension vscode-opencode-v2-0.1.0.vsix
```

装完执行一次 `Developer: Reload Window`。

如果你还装着 `sst-dev.opencode`，请先禁用它 —— 两个扩展都会去找名为 `opencode` 的终端，而官方那个会往里发 `opencode --port`，v2 会直接报错。

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
- **不提供 v1 的功能**。没有 HTTP 端口、不读 `/app`、不做 `append-prompt`。依赖 v1 服务端接口的能力 —— 比如在 VS Code 里预览 opencode 的 diff —— 这里没有。
- **复用判定只看终端名**。两个扩展都想管名为 `opencode` 的终端时，会互相抢。
- **不做版本探测**。把 `ocv2.binary` 指向 v1 的二进制，它就只是把 v1 启起来，不具备旧扩展那套 v1 集成。

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
