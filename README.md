# OpenCode v2 TUI

**English** | [简体中文](README.zh-CN.md)

<!-- 上传前：把本文件与 package.json 里的 ThinkDonk 替换成你的 GitHub 用户名 -->

[![CI](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/ThinkDonk/vscode-opencode-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Unofficial community extension — not affiliated with or endorsed by the opencode project.

Run the [opencode](https://opencode.ai) **v2** TUI inside VS Code, and push the current file or selection into the session as an `@path#Lx-Ly` reference.

## What it is

A VS Code extension for **opencode v2**. It runs the agent's terminal UI inside VS Code and pushes the current file or selection into the session as an `@path#Lx-Ly` reference.

It launches the plain `opencode` command in an integrated terminal, sets `OPENCODE_CALLER=vscode`, and writes references into the running TUI with `terminal.sendText`. There is no HTTP client, no stdout parsing and no version probing — see [How it works](#how-it-works).

It targets the `@opencode/cli` v2 line, where running `opencode` on its own opens the TUI.

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

> Keybindings declare `key` for Windows and Linux plus a separate `mac` override, so `Ctrl+Esc` and `Ctrl+Alt+K` work outside macOS as well.

## Install

Requires the opencode v2 CLI on your `PATH` (`opencode --version` should print `2.x`).

From the Marketplace — search for **OpenCode v2 TUI** in the Extensions view, or run:

```bash
code --install-extension ThinkDonk.vscode-opencode-v2
```

Or build from source:

```bash
npm install
npm run package
code --install-extension vscode-opencode-v2-<version>.vsix
```

Then run `Developer: Reload Window`.

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
- **No server-based integration.** Everything goes through the terminal, so anything that needs opencode's HTTP server — diff previews inside the editor, session APIs — is out of scope.
- **Reuse is decided by terminal name.** A terminal you opened yourself under the configured name (`opencode` by default) will be reused; change `ocv2.terminalName` if you want isolation.
- **No version detection.** Point `ocv2.binary` at another build and it will simply launch it.

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
