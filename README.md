# OpenCode v2 TUI

**English** | [简体中文](README.zh-CN.md)

<!-- 上传前：把本文件与 package.json 里的 ThinkDonk 替换成你的 GitHub 用户名 -->

[![CI](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Unofficial community extension — not affiliated with or endorsed by the opencode project.

Run the [opencode](https://opencode.ai) **v2** TUI inside VS Code, and push the current file or selection into the session as an `@path#Lx-Ly` reference.

## Why this exists

SST's `opencode for VS Code` extension was last published on **2025-12-28** (v0.0.13) and still starts the agent the v1 way:

```
opencode --port ${port}          # then polls localhost:port/app and POSTs /tui/append-prompt
```

opencode v2 (npm package `@opencode/cli`, first released 2026-09-02) removed `--port` from the root command — it now runs a background service plus a separate `serve` subcommand. So the official extension fails on v2 with `Unrecognized flag: --port` (issue [#49992](https://github.com/anomalyco/opencode/issues/49992)). Its sibling `sst-dev.opencode-v2` ("OpenCode Beta") waits for a stdout marker that v2 no longer prints, and hits a 15-second timeout instead (issue [#50043](https://github.com/anomalyco/opencode/issues/50043)).

The upstream fix exists as PR [#49084](https://github.com/anomalyco/opencode/pull/49084) (opened 2026-09-15, still unmerged). It removes `--port`, drops the HTTP polling, and injects file references through `terminal.sendText` instead. **This extension is that idea, rewritten from scratch** — no HTTP API, no stdout parsing, just the terminal text channel.

## Commands

| Command | Windows / Linux | macOS |
|---------|-----------------|-------|
| Open opencode | `Ctrl+Esc` | `Cmd+Esc` |
| Open opencode in new tab | `Ctrl+Shift+Esc` | `Cmd+Shift+Esc` |
| Add file reference to opencode | `Ctrl+Alt+K` | `Cmd+Alt+K` |

- **Open opencode** reuses the terminal named `opencode` if one exists (focusing it and sending the current reference), otherwise creates one in a split view and launches the TUI. There is also a button in the editor title bar.
- **Open opencode in new tab** always creates a fresh terminal.
- **Add file reference to opencode** only injects into an already running terminal — it never launches one.

The reference format matches opencode's `@` syntax: `@src/main.ts`, or `@src/main.ts#L37` for a single-line selection, or `@src/main.ts#L37-42` for multiple lines. The text is inserted without a trailing newline, so you can keep typing before sending.

> The official extension declares its keybindings as `cmd+escape` / `cmd+alt+k` only. `cmd` does not exist on Windows or Linux, so the `Ctrl+Esc` shortcut its README advertises is dead there. Here `key` and `mac` are declared separately, so both platforms work.

## Install

Requires the opencode v2 CLI on your `PATH` (`opencode --version` should print `2.x`).

```bash
# from a published .vsix
code --install-extension vscode-opencode-v2-0.1.0.vsix

# or build it yourself
npm install
npm run package
code --install-extension vscode-opencode-v2-0.1.0.vsix
```

Then run `Developer: Reload Window`.

If you also have `sst-dev.opencode` installed, disable it first — both extensions look for a terminal named `opencode`, and the official one will send `opencode --port` into it, which v2 rejects.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ocv2.binary` | `opencode` | Command used to launch the TUI. Accepts a full path or flags, e.g. `opencode --standalone` |
| `ocv2.terminalName` | `opencode` | Terminal name used to decide whether to reuse a session. Keeping the default lets it reuse a terminal you opened manually |
| `ocv2.injectOnLaunch` | `false` | Also inject the reference when creating a new terminal. Off by default — see below |

## How it works

Terminal only. The extension spawns exactly `opencode` (no flags), sets `OPENCODE_CALLER=vscode`, and writes references into the running TUI with `terminal.sendText`. It never calls opencode's HTTP endpoints, never parses its output, and never probes which CLI version is installed.

## Known limitations

- **No injection at launch.** When a terminal is created, the TUI has not taken over stdin yet; text sent at that moment can be executed by the shell as a command. The safe flow is `Ctrl+Esc` to launch, then `Ctrl+Alt+K` to inject. Set `ocv2.injectOnLaunch` to `true` if you want to take that risk anyway.
- **No v1 features.** There is no HTTP port, no reading `/app`, no `append-prompt`. Capabilities that depended on the v1 server API — such as previewing opencode diffs inside VS Code — are not available.
- **Reuse is decided by terminal name.** Two extensions managing a terminal called `opencode` will fight over it.
- **No version detection.** Point `ocv2.binary` at a v1 binary and it simply launches it, without the v1 integration the old extension provided.

## Development

```bash
npm install
npm run compile      # tsc -p . → out/extension.js
npm test             # compile + smoke test
npm run package      # vsce package → vscode-opencode-v2-<version>.vsix
```

`npm test` runs `test/smoke.js`, a dependency-free smoke test. It injects a fake `vscode` module through a `Module._load` hook, loads the compiled `out/extension.js`, fires all three commands, and asserts terminal reuse, reference formatting, the `OPENCODE_CALLER` environment variable, and that the launch command never contains `--port`. No Extension Development Host required.

For interactive debugging, open this folder in VS Code and press `F5`.

## License

MIT — see [LICENSE](LICENSE).
