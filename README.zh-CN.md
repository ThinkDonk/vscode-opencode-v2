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
| 把选中的文件加入 opencode | 资源管理器右键／命令面板 | 同左 |
| 把错误／警告加入 opencode | 编辑器右键／命令面板／诊断快速修复 | 同左 |
| 为选区使用 opencode 提示词模板 | 编辑器右键／命令面板 | 同左 |

- **Open opencode**：已有名为 `opencode` 的终端就复用它（聚焦并把当前引用送进去），没有就分屏新建并启动 TUI。
- **Open opencode in new tab**：总是新建一个终端。编辑器标题栏按钮执行的也是这个命令。
- **Add file reference to opencode**：只注入到正在运行的终端，不会顺带启动一个。

引用格式与 opencode 的 `@` 语法一致：`@src/main.ts`，选中单行是 `@src/main.ts#L37`，多行是 `@src/main.ts#L37-42`。写入时不带结尾换行，你可以继续补内容再发送。

### 批量添加文件

在资源管理器选中一个或多个文件，右键选择 **把选中的文件加入 opencode**。也可以从命令面板运行此命令，在文件选择框中多选。引用会去重、保留选择顺序，以空格分隔；含空格的路径使用双引号包裹，例如 `"@src/my file.ts"`。

只接受工作区内已存在的文件。如果选择中包含文件夹、已删除的文件、工作区外文件或路径含控制字符的文件，整批都不写入终端。

### 添加错误／警告

在诊断的快速修复中选择 **让 opencode 分析此问题…**（编辑器灯泡，或「问题」面板条目的快速修复）。也可以从编辑器右键或命令面板运行 **把错误／警告加入 opencode**，选择当前文件的一条或多条问题。

草稿包含文件与行号引用、严重程度、可用的诊断来源／编号和问题文本。加入前可以编辑。多行诊断会合并为单行，不包含「信息」和「提示」级别。这里只读取 VS Code 已报告的问题，不会执行编译器或检查工具。

### 使用选区模板

选中代码，从编辑器右键或命令面板选择 **为选区使用 opencode 提示词模板**。支持 **解释代码、检查问题、生成测试、重构建议**，选定后可以编辑提示词。打开选择框前会固定原文件和选中的行号。

以上三个功能都要求已有配置名称对应的终端，且 OpenCode TUI 已就绪。内容只加入当前输入框，不代按回车。取消选择或编辑不会写入终端；如果原终端在弹窗期间关闭，也不会把草稿转给另一个会话。

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
- **引用是普通文本**。扩展不创建结构化附件，也不复制编辑器尚未保存的内容，请先保存改动。路径采用 VS Code 的工作区相对形式（多根工作区会带工作区文件夹名称），请保持 OpenCode 工作目录一致，并在提交前检查引用。
- **草稿为单行**。诊断换行会合并；编辑后的草稿如果包含换行或终端控制字符，则不会发送。扩展不会读取或清空终端已有输入，向已有草稿追加时请检查分隔空格。

## 开发

```bash
npm install
npm run compile      # tsc -p . → out/extension.js
npm test             # 编译 + 冒烟测试
npm run package      # vsce package → vscode-opencode-v2-<version>.vsix
```

`npm test` 跑的是 `test/smoke.js`，一个零依赖冒烟测试：通过 `Module._load` 钩子注入假的 `vscode` 模块，加载编译产物 `out/extension.js`。覆盖终端复用和启动行为、引用格式、批量选择及无效文件、诊断动作与草稿、四个模板、取消、弹窗期间终端关闭和中英文文案。它不能证明真实 OpenCode TUI 已正确接收内容。

交互验证时，在 VS Code 里打开本目录按 `F5`：

1. 打开工作区，按 `Ctrl+Esc`，等待 OpenCode 输入框出现；用 `Ctrl+Alt+K` 加入选区引用。
2. 从资源管理器加入多个文件，检查 TUI 输入框里的引用。
3. 使用一条真实诊断的快速修复，编辑草稿，核对 TUI 中的文件、行号和问题文本。
4. 逐个使用选区模板，并分别取消选择和编辑步骤。确认加入草稿不会自动提交。

打包检查必须确认包含 `out/extension.js` 和两个 `package.nls*.json`，不包含 `src/`、`test/`、`.github/` 和 `node_modules/`。

## 许可

MIT，见 [LICENSE](LICENSE)。
