/**
 * 零依赖冒烟测试：用一个假的 vscode 模块加载 out/extension.js，验证命令的行为。
 * 运行：npm test（需先 npm run compile）
 */
const assert = require("assert")
const path = require("path")
const Module = require("module")

const extensionPath = path.join(__dirname, "..", "out", "extension.js")

function makeStub(options = {}) {
  const state = {
    terminals: options.terminals ?? [],
    warnings: [],
    commands: new Map(),
    created: [],
    dialogs: [],
    picks: [],
    inputs: [],
    information: [],
    providers: [],
    diagnosticQueries: [],
  }

  const config = {
    terminalName: options.terminalName ?? "opencode",
    binary: options.binary ?? "opencode",
    injectOnLaunch: options.injectOnLaunch ?? false,
  }

  class Terminal {
    constructor(name) {
      this.name = name
      this.sent = []
      this.shown = 0
    }
    show() {
      this.shown++
    }
    sendText(text, addNewline) {
      this.sent.push({ text, addNewline })
    }
  }

  const vscode = {
    ViewColumn: { Beside: -2 },
    FileType: { File: 1, Directory: 2 },
    env: { language: options.language ?? "zh-cn" },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CodeActionKind: { QuickFix: "quickfix" },
    CodeAction: class { constructor(title, kind) { this.title = title; this.kind = kind } },
    window: {
      activeTextEditor: options.activeTextEditor,
      terminals: state.terminals,
      createTerminal(opts) {
        const terminal = new Terminal(opts.name)
        state.created.push({ terminal, opts })
        state.terminals.push(terminal)
        return terminal
      },
      showWarningMessage(message) {
        state.warnings.push(message)
        return Promise.resolve(undefined)
      },
      async showOpenDialog(settings) {
        state.dialogs.push(settings)
        return options.openDialog?.(state) ?? options.files
      },
      async showQuickPick(items, settings) {
        state.picks.push({ items, settings })
        return options.pick?.(items, state)
      },
      async showInputBox(settings) {
        state.inputs.push(settings)
        if (options.input) return options.input(settings, state)
        return options.acceptDraft ? settings.value : undefined
      },
      async showInformationMessage(message) { state.information.push(message) },
    },
    workspace: {
      getConfiguration: () => ({ get: (key) => config[key] }),
      workspaceFolders: [{ uri: uri("/w") }],
      getWorkspaceFolder: (uri) => (options.inWorkspace === false || !uri.path.startsWith("/w/") ? undefined : { uri }),
      asRelativePath: (uri) => options.relativePath ?? uri.path.slice(3),
      fs: { stat: async (uri) => {
        if (options.missing === uri.path) throw new Error("ENOENT")
        return { type: uri.path.endsWith("/folder") ? 2 : 1 }
      } },
    },
    commands: {
      registerCommand(id, handler) {
        state.commands.set(id, handler)
        return { dispose() {} }
      },
    },
    languages: {
      getDiagnostics(uri) { state.diagnosticQueries.push(uri); return options.diagnostics ?? [] },
      registerCodeActionsProvider(selector, provider, metadata) {
        state.providers.push({ selector, provider, metadata })
        return { dispose() {} }
      },
    },
  }

  return { vscode, state, Terminal }
}

function loadExtension(stub) {
  const originalLoad = Module._load
  Module._load = function (request, ...rest) {
    if (request === "vscode") return stub.vscode
    return originalLoad.call(this, request, ...rest)
  }
  try {
    delete require.cache[require.resolve(extensionPath)]
    return require(extensionPath)
  } finally {
    Module._load = originalLoad
  }
}

function uri(path) {
  return { path, toString: () => `file://${path}` }
}

function editorWith(selection) {
  return {
    document: { uri: uri("/w/src/main.ts") },
    selection,
  }
}

const empty = { isEmpty: true, start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
const singleLine = { isEmpty: false, start: { line: 6, character: 0 }, end: { line: 6, character: 5 } }
const multiLine = { isEmpty: false, start: { line: 2, character: 0 }, end: { line: 4, character: 5 } }

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

function lastSent(terminal) {
  return terminal.sent[terminal.sent.length - 1]
}

test("新建终端时只发裸 opencode，不带 --port，且不注入引用", () => {
  const stub = makeStub({ activeTextEditor: editorWith(multiLine) })
  loadExtension(stub).activate({ subscriptions: [] })

  stub.state.commands.get("ocv2.openTerminal")()

  assert.strictEqual(stub.state.created.length, 1)
  const terminal = stub.state.created[0].terminal
  assert.deepStrictEqual(terminal.sent, [{ text: "opencode", addNewline: true }])
  assert.ok(!terminal.sent.some((entry) => entry.text.includes("--port")))
})

test("createTerminal 传入 OPENCODE_CALLER=vscode 与分屏位置", () => {
  const stub = makeStub({ activeTextEditor: editorWith(empty) })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.openTerminal")()

  const { opts } = stub.state.created[0]
  assert.strictEqual(opts.env.OPENCODE_CALLER, "vscode")
  assert.strictEqual(opts.location.viewColumn, stub.vscode.ViewColumn.Beside)
})

test("已存在同名终端时复用，并把多行选区引用送进去", () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({
    terminals: [existing],
    activeTextEditor: editorWith(multiLine),
    relativePath: "src/main.ts",
  })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.openTerminal")()

  assert.strictEqual(stub.state.created.length, 0, "不应新建终端")
  assert.strictEqual(existing.shown, 1)
  assert.deepStrictEqual(lastSent(existing), { text: "@src/main.ts#L3-5", addNewline: false })
})

test("单行选区引用格式为 @path#L7", () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(singleLine) })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.addFilepathToTerminal")()

  assert.deepStrictEqual(lastSent(existing), { text: "@src/main.ts#L7", addNewline: false })
})

test("无选区时引用只有路径", () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(empty) })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.addFilepathToTerminal")()

  assert.deepStrictEqual(lastSent(existing), { text: "@src/main.ts", addNewline: false })
})

test("没有 opencode 终端时给提示而不是静默失败", () => {
  const stub = makeStub({ activeTextEditor: editorWith(empty) })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.addFilepathToTerminal")()

  assert.strictEqual(stub.state.warnings.length, 1)
  assert.match(stub.state.warnings[0], /没有正在运行的 opencode 终端/)
})

test("文件不属于任何工作区时不产生引用", () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({
    terminals: [existing],
    activeTextEditor: editorWith(empty),
    inWorkspace: false,
  })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.addFilepathToTerminal")()

  assert.strictEqual(existing.sent.length, 0)
  assert.strictEqual(stub.state.warnings.length, 1)
  assert.match(stub.state.warnings[0], /不属于任何工作区/)
})

test("openNewTerminal 即使已有终端也新建", () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(empty) })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.openNewTerminal")()

  assert.strictEqual(stub.state.created.length, 1)
  assert.notStrictEqual(stub.state.created[0].terminal, existing)
})

test("injectOnLaunch 打开后新终端也收到引用", () => {
  const stub = makeStub({ activeTextEditor: editorWith(multiLine), injectOnLaunch: true })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.openTerminal")()

  const terminal = stub.state.created[0].terminal
  assert.deepStrictEqual(lastSent(terminal), { text: "@src/main.ts#L3-5", addNewline: false })
})

test("多文件使用资源管理器参数而不是活动编辑器，去重并保序", async () => {
  const existing = new (makeStub().Terminal)("custom")
  const stub = makeStub({ terminalName: "custom", terminals: [existing], activeTextEditor: editorWith(singleLine) })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.addFilesToTerminal")(uri("/w/b.ts"), [uri("/w/b.ts"), uri("/w/a.ts"), uri("/w/b.ts")])
  assert.deepStrictEqual(existing.sent, [{ text: "@b.ts @a.ts", addNewline: false }])
  assert.strictEqual(stub.state.dialogs.length, 0)
  assert.strictEqual(stub.state.created.length, 0)
})

test("资源管理器单文件与含空格/中文路径保留完整引用", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing] })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.addFilesToTerminal")(uri("/w/目录/a b.ts"))
  assert.deepStrictEqual(existing.sent, [{ text: '"@目录/a b.ts"', addNewline: false }])
})

test("命令面板打开多文件选择框，取消不发送", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], files: [uri("/w/a.ts"), uri("/w/b.ts")] })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.addFilesToTerminal")()
  assert.strictEqual(stub.state.dialogs[0].canSelectMany, true)
  assert.strictEqual(stub.state.dialogs[0].canSelectFolders, false)
  assert.deepStrictEqual(existing.sent, [{ text: "@a.ts @b.ts", addNewline: false }])
  const cancelled = makeStub({ terminals: [existing] })
  loadExtension(cancelled).activate({ subscriptions: [] })
  await cancelled.state.commands.get("ocv2.addFilesToTerminal")()
  assert.strictEqual(existing.sent.length, 1)
})

test("批量包含文件夹、工作区外、缺失或带控制字符的文件时整批不发送", async () => {
  for (const invalid of ["/w/folder", "/outside/a.ts", "/w/missing.ts", "/w/a\nb.ts", "/w/a\u001bb.ts", "/w/a\u2028b.ts"]) {
    const existing = new (makeStub().Terminal)("opencode")
    const stub = makeStub({ terminals: [existing], missing: "/w/missing.ts" })
    loadExtension(stub).activate({ subscriptions: [] })
    await stub.state.commands.get("ocv2.addFilesToTerminal")(undefined, [uri("/w/a.ts"), uri(invalid)])
    assert.deepStrictEqual(existing.sent, [], invalid)
    assert.strictEqual(stub.state.warnings.length, 1, invalid)
  }
})

test("批量引用在无终端时不打开选择框、不新建终端", async () => {
  const stub = makeStub({ language: "en", injectOnLaunch: true })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.addFilesToTerminal")()
  assert.strictEqual(stub.state.dialogs.length, 0)
  assert.strictEqual(stub.state.created.length, 0)
  assert.match(stub.state.warnings[0], /No opencode terminal/)
})

test("异步选择时原终端关闭，不向新同名终端转发引用", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const replacement = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], openDialog: (state) => {
    state.terminals.splice(0, 1, replacement)
    return [uri("/w/a.ts")]
  } })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.addFilesToTerminal")()
  assert.deepStrictEqual(existing.sent, [])
  assert.deepStrictEqual(replacement.sent, [])
  assert.strictEqual(stub.state.warnings.length, 1)
})

test("选区结束在下一行第 0 列时，不额外引用该行", () => {
  const existing = new (makeStub().Terminal)("opencode")
  const selection = { ...multiLine, end: { line: 4, character: 0 } }
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(selection) })
  loadExtension(stub).activate({ subscriptions: [] })
  stub.state.commands.get("ocv2.addFilepathToTerminal")()
  assert.deepStrictEqual(lastSent(existing), { text: "@src/main.ts#L3-4", addNewline: false })
})

test("贡献项和运行时文案有完整的中英本地化键", () => {
  const fs = require("fs")
  const english = require("../package.nls.json")
  const chinese = require("../package.nls.zh-cn.json")
  assert.deepStrictEqual(Object.keys(english).sort(), Object.keys(chinese).sort())
  const manifest = require("../package.json")
  for (const [, key] of JSON.stringify(manifest).matchAll(/%([^%]+)%/g)) assert.ok(english[key], key)
  const source = fs.readFileSync(path.join(__dirname, "../src/extension.ts"), "utf8")
  for (const [, key] of source.matchAll(/text\("([^"]+)"\)/g)) assert.ok(english[key], key)
  const stub = makeStub()
  loadExtension(stub).activate({ subscriptions: [] })
  for (const command of manifest.contributes.commands) assert.ok(stub.state.commands.has(command.command), command.command)
  assert.ok(manifest.contributes.menus["explorer/context"].some(item => item.command === "ocv2.addFilesToTerminal"))
})

function problem(severity = 0, message = "Cannot find name 'foo'.", range = singleLine) {
  return { severity, message, range, source: "ts", code: 2304 }
}

test("灯泡只为错误和警告生成动作，执行时使用诊断原文件与精确位置", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(empty), acceptDraft: true })
  loadExtension(stub).activate({ subscriptions: [] })
  const error = problem(0)
  const warning = problem(1)
  const source = { uri: uri("/w/other.ts") }
  const actions = stub.state.providers[0].provider.provideCodeActions(source, empty, {
    diagnostics: [error, warning, problem(2), problem(3)],
  })
  assert.strictEqual(actions.length, 2)
  assert.deepStrictEqual(actions[0].diagnostics, [error])
  assert.strictEqual(actions[0].kind, "quickfix")
  assert.deepStrictEqual(existing.sent, [], "展示灯泡不能触发发送")
  const command = actions[0].command
  await stub.state.commands.get(command.command)(...command.arguments)
  assert.strictEqual(stub.state.picks.length, 0)
  assert.deepStrictEqual(existing.sent, [{
    text: "请解释以下问题的原因，并给出修复建议： @other.ts#L7 错误 [ts 2304]: Cannot find name 'foo'.",
    addNewline: false,
  }])
})

test("当前文件问题可多选，保留类型、来源、诊断编号与行号，使用编辑后的草稿", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({
    terminals: [existing], activeTextEditor: editorWith(empty), language: "de",
    diagnostics: [problem(0), { ...problem(1, "Unused value", multiLine), code: { value: "W01", target: uri("/docs") } }, problem(2)],
    pick: items => items,
    input: settings => settings.value + " Please prioritize the warning.",
  })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.sendDiagnostics")()
  assert.strictEqual(stub.state.picks[0].items.length, 2)
  assert.strictEqual(stub.state.picks[0].settings.canPickMany, true)
  assert.strictEqual(stub.state.diagnosticQueries[0].path, "/w/src/main.ts")
  assert.deepStrictEqual(existing.sent, [{ text: "Explain the causes of these problems and suggest fixes: @src/main.ts#L7 Error [ts 2304]: Cannot find name 'foo'. | @src/main.ts#L3-5 Warning [ts W01]: Unused value Please prioritize the warning.", addNewline: false }])
})

test("无错误/警告时给出说明；工作区外文件不提供诊断动作", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(empty), diagnostics: [problem(2)] })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.sendDiagnostics")()
  assert.strictEqual(stub.state.information.length, 1)
  assert.strictEqual(stub.state.picks.length, 0)
  const actions = stub.state.providers[0].provider.provideCodeActions({ uri: uri("/outside/a.ts") }, empty, { diagnostics: [problem()] })
  assert.deepStrictEqual(actions, [])
  await stub.state.commands.get("ocv2.sendDiagnostics")(uri("/outside/a.ts"), problem())
  assert.strictEqual(stub.state.warnings.length, 1)
  assert.deepStrictEqual(existing.sent, [])
})

test("取消问题选择或草稿编辑不发送", async () => {
  for (const pick of [() => undefined, () => [], items => items]) {
    const existing = new (makeStub().Terminal)("opencode")
    const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(empty), diagnostics: [problem()], pick })
    loadExtension(stub).activate({ subscriptions: [] })
    await stub.state.commands.get("ocv2.sendDiagnostics")()
    assert.deepStrictEqual(existing.sent, [])
  }
})

test("多行诊断和来源中的控制字符转为单行，零宽诊断仍携带行号", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], acceptDraft: true })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.sendDiagnostics")(uri("/w/a.ts"), {
    ...problem(0, "first\r\nsecond\u001b[31m\u2028last", empty), source: "lint\r\nsource", code: 0,
  })
  assert.strictEqual(existing.sent.length, 1)
  assert.match(existing.sent[0].text, /@a.ts#L1 错误 \[lint source 0\]: first second \[31m last/)
  assert.doesNotMatch(existing.sent[0].text, /[\x00-\x1f\x7f-\x9f\u2028\u2029]/)
  assert.strictEqual(existing.sent[0].addNewline, false)
})

test("空白或带换行/控制字符的用户草稿不会送入终端", async () => {
  for (const input of ["  ", "first\nsecond", "first\rsecond", "first\u001bsecond", "first\u2028second"]) {
    const existing = new (makeStub().Terminal)("opencode")
    const stub = makeStub({ terminals: [existing], input: () => input })
    loadExtension(stub).activate({ subscriptions: [] })
    await stub.state.commands.get("ocv2.sendDiagnostics")(uri("/w/a.ts"), problem())
    assert.ok(stub.state.inputs[0].validateInput(input))
    assert.strictEqual(stub.state.inputs[0].validateInput("valid draft"), undefined)
    assert.deepStrictEqual(existing.sent, [])
    assert.strictEqual(stub.state.warnings.length, 1)
  }
})

test("诊断命令不会创建终端，异步编辑时终端关闭也不转发", async () => {
  const absent = makeStub({ injectOnLaunch: true })
  loadExtension(absent).activate({ subscriptions: [] })
  await absent.state.commands.get("ocv2.sendDiagnostics")(uri("/w/a.ts"), problem())
  assert.strictEqual(absent.state.created.length, 0)
  assert.strictEqual(absent.state.inputs.length, 0)
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], input: (settings, state) => {
    state.terminals.splice(0)
    return settings.value
  } })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.sendDiagnostics")(uri("/w/a.ts"), problem())
  assert.deepStrictEqual(existing.sent, [])
  assert.strictEqual(stub.state.warnings.length, 1)
})

test("问题选择期间文件移出工作区，不生成失效引用", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(empty), diagnostics: [problem()],
    acceptDraft: true, pick: items => {
      stub.vscode.workspace.getWorkspaceFolder = () => undefined
      return items
    },
  })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.sendDiagnostics")()
  assert.deepStrictEqual(existing.sent, [])
  assert.strictEqual(stub.state.inputs.length, 0)
  assert.strictEqual(stub.state.warnings.length, 1)
})

test("四个选区模板均可生成中英草稿，包含选区引用且不提交", async () => {
  const expected = [
    ["解释代码", "请解释这段代码的作用、执行流程和关键边界条件。", "Explain code", "Explain what this code does, its execution flow, and the key edge cases."],
    ["检查问题", "请检查这段代码中的缺陷和遗漏的边界情况，说明各项问题并给出修复建议。", "Review for problems", "Review this code for bugs and missing edge cases. Explain each issue and suggest a fix."],
    ["生成测试", "请按照项目现有的测试惯例为这段代码生成测试，覆盖正常流程、边界情况和失败场景。", "Generate tests", "Generate tests for this code using the project's existing test conventions. Cover the normal flow, edge cases, and failures."],
    ["重构建议", "请在保持对外行为不变的前提下，为这段代码提出重构建议，并说明收益与取舍。", "Suggest a refactor", "Suggest a refactor for this code that preserves its external behavior. Explain the benefits and tradeoffs."],
  ]
  for (const language of ["zh-cn", "en"]) {
    for (let index = 0; index < expected.length; index++) {
      const existing = new (makeStub().Terminal)("opencode")
      const stub = makeStub({ terminals: [existing], language, activeTextEditor: editorWith(multiLine),
        pick: items => items[index], acceptDraft: true,
      })
      loadExtension(stub).activate({ subscriptions: [] })
      await stub.state.commands.get("ocv2.usePromptTemplate")()
      const offset = language === "en" ? 2 : 0
      assert.deepStrictEqual(stub.state.picks[0].items.map(item => item.label), expected.map(item => item[offset]))
      assert.deepStrictEqual(existing.sent, [{ text: `@src/main.ts#L3-5 ${expected[index][offset + 1]}`, addNewline: false }])
      assert.strictEqual(stub.state.created.length, 0)
    }
  }
})

test("模板使用原始选区，选择过程中切换编辑器不改变引用，并采用编辑后的内容", async () => {
  const existing = new (makeStub().Terminal)("opencode")
  const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(singleLine),
    pick: items => {
      stub.vscode.window.activeTextEditor = { document: { uri: uri("/w/switched.ts") }, selection: multiLine }
      return items[0]
    },
    input: settings => settings.value + " 请用初学者能理解的语言。",
  })
  loadExtension(stub).activate({ subscriptions: [] })
  await stub.state.commands.get("ocv2.usePromptTemplate")()
  assert.deepStrictEqual(existing.sent, [{ text: "@src/main.ts#L7 请解释这段代码的作用、执行流程和关键边界条件。 请用初学者能理解的语言。", addNewline: false }])
})

test("没有终端、没有编辑器、空选区或工作区外文件不进入模板选择", async () => {
  for (const options of [
    { terminals: [], activeTextEditor: editorWith(singleLine) },
    { activeTextEditor: undefined },
    { activeTextEditor: editorWith(empty) },
    { activeTextEditor: editorWith(singleLine), inWorkspace: false },
  ]) {
    const existing = new (makeStub().Terminal)("opencode")
    const stub = makeStub({ terminals: [existing], ...options, injectOnLaunch: true, pick: items => items[0], acceptDraft: true })
    loadExtension(stub).activate({ subscriptions: [] })
    await stub.state.commands.get("ocv2.usePromptTemplate")()
    assert.strictEqual(stub.state.created.length, 0)
    assert.strictEqual(stub.state.picks.length, 0)
    assert.strictEqual(stub.state.inputs.length, 0)
    assert.strictEqual(stub.state.warnings.length + stub.state.information.length, 1)
    assert.deepStrictEqual(existing.sent, [])
  }
})

test("取消模板或编辑步骤不写入终端", async () => {
  for (const pick of [() => undefined, items => items[0]]) {
    const existing = new (makeStub().Terminal)("opencode")
    const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(singleLine), pick })
    loadExtension(stub).activate({ subscriptions: [] })
    await stub.state.commands.get("ocv2.usePromptTemplate")()
    assert.deepStrictEqual(existing.sent, [])
  }
})

test("模板沿用草稿校验和原终端关闭保护", async () => {
  for (const closeTerminal of [false, true]) {
    const existing = new (makeStub().Terminal)("opencode")
    const stub = makeStub({ terminals: [existing], activeTextEditor: editorWith(singleLine), pick: items => items[0],
      input: (settings, state) => {
        if (closeTerminal) state.terminals.splice(0)
        return closeTerminal ? settings.value : "unwanted\nsubmit"
      },
    })
    loadExtension(stub).activate({ subscriptions: [] })
    await stub.state.commands.get("ocv2.usePromptTemplate")()
    assert.deepStrictEqual(existing.sent, [])
    assert.strictEqual(stub.state.warnings.length, 1)
  }
})

async function main() {
  let failed = 0
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`PASS  ${name}`)
    } catch (error) {
      failed++
      console.error(`FAIL  ${name} — ${error.stack}`)
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} 通过`)
  if (failed) process.exitCode = 1
}
void main()
