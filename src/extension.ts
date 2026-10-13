import * as vscode from "vscode"

// tsc 输出 CommonJS；语言表随扩展打包，不需要引入运行时本地化依赖。
declare function require(path: string): Record<string, string>

/** opencode 用它识别调用方，官方扩展也设这个变量 */
const CALLER_ENV = { OPENCODE_CALLER: "vscode" }
const english: Record<string, string> = require("../package.nls.json")
const chinese: Record<string, string> = require("../package.nls.zh-cn.json")
const controlCharacters = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

function text(key: string): string {
  return (/^zh-(cn|hans)$/i.test(vscode.env.language) ? chinese[key] : undefined) ?? english[key]
}

function fileRef(uri: vscode.Uri, range?: vscode.Range, includeEmptyRange = false): string | undefined {
  if (!vscode.workspace.getWorkspaceFolder(uri)) return undefined
  const path = vscode.workspace.asRelativePath(uri).replace(/\\/g, "/")
  if (controlCharacters.test(path)) return undefined
  let ref = `@${path}`
  if (range && (!range.isEmpty || includeEmptyRange)) {
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

function singleLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim()
}

async function editDraft(terminal: vscode.Terminal, value: string) {
  const validate = (draft: string) => !draft.trim() || controlCharacters.test(draft)
    ? text("message.invalidDraft") : undefined
  const draft = await vscode.window.showInputBox({
    title: text("dialog.editDraft"),
    prompt: text("dialog.draftHelp"),
    value,
    valueSelection: [0, value.length],
    validateInput: validate,
  })
  if (draft === undefined) return
  const error = validate(draft)
  if (error) {
    void vscode.window.showWarningMessage(error)
    return
  }
  insert(terminal, draft.trim())
}

function isProblem(diagnostic: vscode.Diagnostic): boolean {
  return diagnostic.severity === vscode.DiagnosticSeverity.Error || diagnostic.severity === vscode.DiagnosticSeverity.Warning
}

function diagnosticText(diagnostic: vscode.Diagnostic): string {
  const severity = text(diagnostic.severity === vscode.DiagnosticSeverity.Error ? "diagnostic.error" : "diagnostic.warning")
  const code = typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code
  const origin = [diagnostic.source, code].filter(value => value !== undefined && value !== "").join(" ")
  return singleLine(`${severity}${origin ? ` [${origin}]` : ""}: ${diagnostic.message}`)
}

async function sendDiagnostics(uri?: vscode.Uri, diagnostic?: vscode.Diagnostic) {
  const terminal = existingTerminal()
  if (!terminal) return
  const target = uri ?? vscode.window.activeTextEditor?.document.uri
  if (!target || !fileRef(target)) {
    void vscode.window.showWarningMessage(text("message.noFile"))
    return
  }
  let selected: readonly vscode.Diagnostic[]
  if (diagnostic && isProblem(diagnostic)) {
    selected = [diagnostic]
  } else {
    const diagnostics = vscode.languages.getDiagnostics(target).filter(isProblem)
    if (!diagnostics.length) {
      void vscode.window.showInformationMessage(text("message.noDiagnostics"))
      return
    }
    const items = diagnostics.map(item => ({
      label: diagnosticText(item),
      description: `L${item.range.start.line + 1}:${item.range.start.character + 1}`,
      diagnostic: item,
    }))
    const picked = await vscode.window.showQuickPick(items, {
      title: text("dialog.diagnostics"),
      placeHolder: text("dialog.selectDiagnostics"),
      canPickMany: true,
      matchOnDescription: true,
    })
    if (!picked?.length) return
    selected = picked.map(item => item.diagnostic)
  }
  const problems: string[] = []
  for (const item of selected) {
    const ref = fileRef(target, item.range, true)
    if (!ref) {
      void vscode.window.showWarningMessage(text("message.noFile"))
      return
    }
    problems.push(`${ref} ${diagnosticText(item)}`)
  }
  await editDraft(terminal, `${text("prompt.diagnostics")} ${problems.join(" | ")}`)
}

function launch(name: string, binary: string, extensionUri: vscode.Uri): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name,
    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    env: CALLER_ENV,
    iconPath: {
      light: vscode.Uri.joinPath(extensionUri, "images", "icon-light.svg"),
      dark: vscode.Uri.joinPath(extensionUri, "images", "icon-dark.svg"),
    },
  })
  terminal.show()
  // v2 的裸 opencode 就是 TUI 入口，不能再带 v1 的 --port
  terminal.sendText(binary, true)
  return terminal
}

async function useTemplate() {
  const terminal = existingTerminal()
  if (!terminal) return
  const editor = vscode.window.activeTextEditor
  const ref = editor && fileRef(editor.document.uri, editor.selection)
  if (!ref) {
    void vscode.window.showWarningMessage(text("message.noFile"))
    return
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showInformationMessage(text("message.selectCode"))
    return
  }
  // 打开选择框前固定原选区，切换编辑器或选区不会把请求指向别处。
  const template = await vscode.window.showQuickPick([
    { label: text("template.explain"), prompt: text("prompt.explain") },
    { label: text("template.review"), prompt: text("prompt.review") },
    { label: text("template.tests"), prompt: text("prompt.tests") },
    { label: text("template.refactor"), prompt: text("prompt.refactor") },
  ], {
    title: text("dialog.templates"),
    placeHolder: text("dialog.selectTemplate"),
  })
  if (template) await editDraft(terminal, `${ref} ${template.prompt}`)
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

    const terminal = launch(terminalName, binary, context.extensionUri)
    const ref = activeFileRef()
    if (ref && injectOnLaunch) terminal.sendText(ref, false)
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("ocv2.openTerminal", () => open(false)),
    vscode.commands.registerCommand("ocv2.openNewTerminal", () => open(true)),
    vscode.commands.registerCommand("ocv2.addFilesToTerminal", addFiles),
    vscode.commands.registerCommand("ocv2.sendDiagnostics", sendDiagnostics),
    vscode.commands.registerCommand("ocv2.usePromptTemplate", useTemplate),
    vscode.languages.registerCodeActionsProvider("*", {
      provideCodeActions(document, _range, actionContext) {
        if (!fileRef(document.uri)) return []
        return actionContext.diagnostics.filter(isProblem).map(diagnostic => {
          const action = new vscode.CodeAction(text("action.diagnostic"), vscode.CodeActionKind.QuickFix)
          action.diagnostics = [diagnostic]
          action.command = {
            command: "ocv2.sendDiagnostics",
            title: action.title,
            arguments: [document.uri, diagnostic],
          }
          return action
        })
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
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
