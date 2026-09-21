# AGENTS.md — vscode-opencode-v2

> 草案，待用户确认后定稿。确认前不要基于本文件做架构性改动。

## 这是什么

一个面向 opencode v2 的 VS Code 扩展：把 TUI 拉进 VS Code 终端，并把当前文件/选区以 `@path#Lx-Ly` 引用注入会话。

## 技术栈

- TypeScript + `tsc`，不使用打包器（扩展总量 100 余行，`tsc -p .` 直接产出 `out/extension.js`）
- 运行时零依赖，`dependencies` 为空；`devDependencies` 只有 `typescript`、`@types/vscode`、`@vscode/vsce`
- 目标 VS Code `^1.94.0`，本机实测 1.138.0

## 架构约束（改代码前先读）

1. **只走终端通道**。所有与 opencode 的交互通过 `createTerminal` / `sendText` 完成，不调用 opencode 的任何 HTTP 接口、不解析它的 stdout。v2 已经删掉了 v1 的 `--port` 与 `/tui/append-prompt`，任何依赖它们的集成都会失效，不要走回头路。
2. **不做 opencode 版本探测**。需要区分 v1/v2 时说明设计错了。启动命令一律是裸 `opencode`（可由 `ocv2.binary` 覆盖）。
3. **不自动为新建终端注入引用**。TUI 接管 stdin 之前发送的字符有被 shell 执行的风险，`injectOnLaunch` 默认必须是 `false`。
4. **终端名字是复用判定的唯一依据**。改动 `terminalName` 相关逻辑要同步 README 的「已知边界」。
5. 键位一律 `key`（非 mac）+ `mac` 分开声明，不要只写 `cmd+...`。
6. **用户可见文案走 nls**。命令标题、设置项描述等出现在 VS Code 界面里的字符串，在 `package.json` 里写成 `%key%`，实际文案放 `package.nls.json`（英文，兜底）与 `package.nls.zh-cn.json`（中文）。两个文件必须键一致，改一处就要同步另一处；`package.nls.json` 缺失的键在非中文环境会显示成 `%key%` 原样文本。

## 目录结构

```
src/extension.ts              全部实现（activate / 三个命令 / activeFileRef）
test/smoke.js                 冒烟测试，npm test 入口
package.nls.json              界面文案（英文兜底）
package.nls.zh-cn.json        界面文案（中文）
README.md / README.zh-CN.md   中英双语文档，改动要同步
CHANGELOG.md                  版本变更记录，每个版本追加条目
images/icon-{light,dark}.svg  编辑器标题栏按钮图标
images/icon.png               Marketplace 图标（256×256）
.github/workflows/ci.yml      CI：npm test + 打包 vsix
out/                          编译产物，已被 .gitignore 与 .vscodeignore 排除
```

## 验证入口

提交前必须实际跑通：

```bash
npm test                             # = tsc 编译（零错误）+ node test/smoke.js
npm run package                      # 必须产出 vscode-opencode-v2-<version>.vsix
```

`test/smoke.js` 是零依赖冒烟测试：通过 `Module._load` 钩子注入一个假的 `vscode` 模块，直接加载 `out/extension.js` 并触发三个命令，断言终端复用、引用格式（`@path` / `@path#L7` / `@path#L3-5`）、`OPENCODE_CALLER` 环境变量、以及启动命令不含 `--port`。改动 `src/extension.ts` 时同步补断言。

打包后要检查 vsix 内容：`src/`、`test/`、`.github/`、`node_modules/` 不得进包，`package.nls*.json` 必须在包里。

行为验证（手工，无法脚本化）：按 F5 启动 Extension Development Host，打开一个工作区，验证 `Ctrl+Esc` 能起 TUI、`Ctrl+Alt+K` 送出的引用落在 TUI 输入框里而不是被 shell 执行。

已知无法自动验证的部分必须如实说明，不要用「编译通过」代替行为验证。

## 提交约定

- 按可独立验证的单元提交，一次提交一件事（骨架、功能、文档分开）
- 提交信息用中文 + gitmoji 前缀
- 不自动 push

## 仓库与发布

仓库地址 `https://github.com/ThinkDonk/vscode-opencode-v2`，已写入 `package.json` 的 `repository` / `bugs` / `homepage`、两个 README 的 CI 徽章与 `CHANGELOG.md` 的 compare 链接。改仓库名或整体迁移时，这几处要一起改。

### 发布到 VS Code Marketplace

1. `package.json` 的 `publisher` 必须等于 Marketplace 上已存在的 publisher id（当前为 `ThinkDonk`），扩展 id 是 `<publisher>.<name>` = `ThinkDonk.vscode-opencode-v2`
2. 打标签前先定版本：改 `package.json` 的 `version`、在 `CHANGELOG.md` 补条目，两者必须一致
3. 本地发布：`vsce login ThinkDonk`（粘 PAT）→ `vsce publish`。`package.json` 里的 `vscode:prepublish` 会在打包前自动跑 `tsc`，所以不用手动编译
4. PAT 需要 Azure DevOps 的 Marketplace → Manage 权限；不要把 PAT 写进仓库，交给 CI 时用仓库 secret
5. 提交身份走仓库级 `user.email`（个人邮箱）；全局 git 配置仍是公司邮箱，在本仓库之外提交时要注意

## 边界

- 不做 GUI/聊天面板，不做会话历史浏览，不读 opencode 的会话存储
- 不打包 opencode 本体，也不检查它是否安装（启动失败由终端自己报错）
- 不实现 VS Code 之外的编辑器支持
