import * as vscode from "vscode"

/** opencode 用它识别调用方，官方扩展也设这个变量 */
const CALLER_ENV = { OPENCODE_CALLER: "vscode" }

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
  if (!vscode.workspace.getWorkspaceFolder(editor.document.uri)) return undefined

  const ref = `@${vscode.workspace.asRelativePath(editor.document.uri)}`
  const selection = editor.selection
  if (selection.isEmpty) return ref

  const start = selection.start.line + 1
  const end = selection.end.line + 1
  return start === end ? `${ref}#L${start}` : `${ref}#L${start}-${end}`
}

function findTerminal(name: string): vscode.Terminal | undefined {
  return vscode.window.terminals.find((terminal) => terminal.name === name)
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
    vscode.commands.registerCommand("ocv2.addFilepathToTerminal", () => {
      const terminal = findTerminal(settings().terminalName)
      if (!terminal) {
        void vscode.window.showWarningMessage(`没有正在运行的 opencode 终端，先执行 Open opencode`)
        return
      }
      const ref = activeFileRef()
      if (!ref) {
        void vscode.window.showWarningMessage("当前没有打开文件，或文件不属于任何工作区")
        return
      }
      terminal.show()
      terminal.sendText(ref, false)
    }),
  )
}

export function deactivate() {}
