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
| Add selected files to opencode | Explorer context menu / Command Palette | Same |
| Add errors / warnings to opencode | Editor context menu / Command Palette / diagnostic quick fix | Same |
| Use an opencode prompt template for selection | Editor context menu / Command Palette | Same |

- **Open opencode** reuses the terminal named `opencode` if one exists (focusing it and sending the current reference), otherwise creates one in a split view and launches the TUI.
- **Open opencode in new tab** always creates a fresh terminal. The editor title-bar button runs this command.
- **Add file reference to opencode** only injects into an already running terminal — it never launches one.

The reference format matches opencode's `@` syntax: `@src/main.ts`, or `@src/main.ts#L37` for a single-line selection, or `@src/main.ts#L37-42` for multiple lines. The text is inserted without a trailing newline, so you can keep typing before sending.

### Add multiple files

Select one or more files in Explorer, right-click, and choose **Add selected files to opencode**. From the Command Palette, the same command opens a file picker with multiple selection enabled. References are deduplicated, kept in selection order, and separated by spaces. Paths containing spaces are enclosed in double quotes, for example `"@src/my file.ts"`.

Only existing files inside the workspace are accepted. If any selected item is a folder, missing, outside the workspace, or has control characters in its path, the whole batch is left unsent.

### Add errors or warnings

Use **Ask opencode about this problem…** in a diagnostic's quick fixes (the editor lightbulb, or the quick fix for an entry in Problems). Alternatively, run **Add errors / warnings to opencode** from the editor context menu or Command Palette to select one or more problems from the current file.

The draft includes file and line references, severity, diagnostic source/code when available, and the problem text. You can edit the draft before adding it. Multiline diagnostics become a single line; information and hint diagnostics are excluded. This uses problems already reported by VS Code; it does not run a compiler or linter.

### Use a selection template

Select code, then choose **Use an opencode prompt template for selection** from the editor context menu or Command Palette. Choose **Explain code**, **Review for problems**, **Generate tests**, or **Suggest a refactor**, then edit the resulting prompt. The original file and selected lines are captured before the picker opens.

All three additions require an existing terminal with the configured name and a ready OpenCode TUI. They add text to its current input without pressing Enter. Canceling a picker or draft leaves the terminal unchanged. If the original terminal closes while a dialog is open, the extension does not forward the draft to another session.

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

The extension list, editor title bar, and newly created terminals use the OpenCode mark, with light/dark variants for the toolbar and terminal. Existing terminals keep their previous icon; open a new terminal to see the updated mark. Artwork sources and license are in [images/NOTICE.md](images/NOTICE.md).

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
- **References are plain text.** The extension does not create structured attachments or copy unsaved editor contents. Save changes before asking about them. Paths use VS Code's workspace-relative form (with the workspace folder name in multi-root workspaces); keep the OpenCode working directory consistent and review the references before submitting.
- **Drafts are single-line.** Diagnostic line breaks are flattened, and edited drafts containing line breaks or terminal control characters are rejected. Existing terminal input is neither read nor cleared; check spacing when appending to an existing draft.

## Development

```bash
npm install
npm run compile      # tsc -p . → out/extension.js
npm test             # compile + smoke test
npm run package      # vsce package → vscode-opencode-v2-<version>.vsix
```

`npm test` runs `test/smoke.js`, a dependency-free smoke test. It injects a fake `vscode` module through a `Module._load` hook and loads the compiled `out/extension.js`. Coverage includes terminal reuse and launch behavior, reference formatting, batch selection and invalid files, diagnostic actions and drafts, all four templates, cancellation, terminal closure during dialogs, and English/Chinese localization. These tests do not prove that a real OpenCode TUI receives the text correctly.

For interactive verification, open this folder in VS Code and press `F5`:

1. Open a workspace, press `Ctrl+Esc`, and wait for the OpenCode input to appear. Use `Ctrl+Alt+K` to add a selection reference.
2. Add multiple Explorer files and check their references in the TUI input.
3. Use a real diagnostic's quick fix, edit the draft, and verify its file, lines, and message in the TUI.
4. Try each selection template and cancel both the picker and the edit step. Confirm that adding a draft never submits it automatically.

Package checks must include `out/extension.js` and both `package.nls*.json` files and exclude `src/`, `test/`, `.github/`, and `node_modules/`.

## License

MIT — see [LICENSE](LICENSE).
