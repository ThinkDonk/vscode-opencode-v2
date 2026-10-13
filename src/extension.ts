import * as vscode from "vscode"

// tsc 输出 CommonJS；语言表随扩展打包，不需要引入运行时本地化依赖。
declare function require(path: string): Record<string, string>

/** opencode 用它识别调用方，官方扩展也设这个变量 */
const CALLER_ENV = { OPENCODE_CALLER: "vscode" }
const english: Record<string, string> = require("../package.nls.json")
const chinese: Record<string, string> = require("../package.nls.zh-cn.json")

function text(key: string): string {
  return (/^zh-(cn|hans)$/i.test(vscode.env.language) ? chinese[key] : undefined) ?? english[key]
}

function fileRef(uri: vscode.Uri, range?: vscode.Range): string | undefined {
  if (!vscode.workspace.getWorkspaceFolder(uri)) return undefined
  const path = vscode.workspace.asRelativePath(uri).replace(/\\/g, "/")
  if (/[\u0000-\u001f\u007f-\u009f]/.test(path)) return undefined
  let ref = `@${path}`
  if (range && !range.isEmpty) {
    const start = range.start.line + 1
    // VS Code 的选区终点不包含在选区内；下一行第 0 列不应多算一行。
    const end = range.end.line + (range.end.character === 0 && range.end.line > range.start.line ? 0 : 1)
    ref += start === end ? `#L${start}` : `#L${start}-${end}`
  }
  return /[\s"]/.test(ref) ? JSON.stringify(ref) : ref
}

type Settings = {
  terminalName: string
  binary: string
  injectOnLaunch: boolean
}

function settings(): Settings {
  const config = vscode.workspace.getConfiguration("ocv2")
  return {
    terminalName: config.get<string>("terminalName", "opencode"),
    binary: config.get<string>("binary", "opencode"),
    injectOnLaunch: config.get<boolean>("injectOnLaunch", false),
  }
}

/**
 * 当前编辑器在工作区内的引用文本：@path 或 @path#L3 或 @path#L3-9。
 * 没有活动编辑器、或文件不在任何工作区内时返回 undefined。
 */
function activeFileRef(): string | undefined {
  const editor = vscode.window.activeTextEditor
  if (!editor) return undefined
  return fileRef(editor.document.uri, editor.selection)
}

function findTerminal(name: string): vscode.Terminal | undefined {
  return vscode.window.terminals.find((terminal) => terminal.name === name)
}

function existingTerminal(): vscode.Terminal | undefined {
  const terminal = findTerminal(settings().terminalName)
  if (!terminal) void vscode.window.showWarningMessage(text("message.noTerminal"))
  return terminal
}

// 异步选择期间终端可能已关闭。不要另建终端或把草稿转发给另一个会话。
function insert(terminal: vscode.Terminal, value: string) {
  if (!vscode.window.terminals.includes(terminal)) {
    void vscode.window.showWarningMessage(text("message.terminalClosed"))
    return
  }
  terminal.show()
  terminal.sendText(value, false)
}

async function addFiles(uri?: vscode.Uri, selectedUris?: vscode.Uri[]) {
  const terminal = existingTerminal()
  if (!terminal) return
  const uris = selectedUris?.length ? selectedUris : uri ? [uri] : await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: text("dialog.addFiles"),
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  })
  if (!uris?.length) return

  const refs: string[] = []
  const seen = new Set<string>()
  for (const selected of uris) {
    if (seen.has(selected.toString())) continue
    seen.add(selected.toString())
    const ref = fileRef(selected)
    try {
      if (!ref || !((await vscode.workspace.fs.stat(selected)).type & vscode.FileType.File)) {
        void vscode.window.showWarningMessage(text("message.invalidFiles"))
        return
      }
    } catch {
      void vscode.window.showWarningMessage(text("message.invalidFiles"))
      return
    }
    refs.push(ref)
  }
  insert(terminal, refs.join(" "))
}

function launch(name: string, binary: string): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name,
    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    env: CALLER_ENV,
  })
  terminal.show()
  // v2 的裸 opencode 就是 TUI 入口，不能再带 v1 的 --port
  terminal.sendText(binary, true)
  return terminal
}

export function activate(context: vscode.ExtensionContext) {
  function open(forceNew: boolean) {
    const { terminalName, binary, injectOnLaunch } = settings()

    const existing = forceNew ? undefined : findTerminal(terminalName)
    if (existing) {
      const ref = activeFileRef()
      existing.show()
      if (ref) existing.sendText(ref, false)
      return
    }

    const terminal = launch(terminalName, binary)
    const ref = activeFileRef()
    if (ref && injectOnLaunch) terminal.sendText(ref, false)
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("ocv2.openTerminal", () => open(false)),
    vscode.commands.registerCommand("ocv2.openNewTerminal", () => open(true)),
    vscode.commands.registerCommand("ocv2.addFilesToTerminal", addFiles),
    vscode.commands.registerCommand("ocv2.addFilepathToTerminal", () => {
      const terminal = existingTerminal()
      if (!terminal) return
      const ref = activeFileRef()
      if (!ref) {
        void vscode.window.showWarningMessage(text("message.noFile"))
        return
      }
      terminal.show()
      terminal.sendText(ref, false)
    }),
  )
}

export function deactivate() {}
