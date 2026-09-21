/**
 * 零依赖冒烟测试：用一个假的 vscode 模块加载 out/extension.js，验证三个命令的行为。
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
    },
    workspace: {
      getConfiguration: () => ({ get: (key) => config[key] }),
      getWorkspaceFolder: (uri) => (options.inWorkspace === false ? undefined : { uri }),
      asRelativePath: () => options.relativePath ?? "src/main.ts",
    },
    commands: {
      registerCommand(id, handler) {
        state.commands.set(id, handler)
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

function editorWith(selection) {
  return {
    document: { uri: { path: "/w/src/main.ts" } },
    selection,
  }
}

const empty = { isEmpty: true, start: { line: 0 }, end: { line: 0 } }
const singleLine = { isEmpty: false, start: { line: 6 }, end: { line: 6 } }
const multiLine = { isEmpty: false, start: { line: 2 }, end: { line: 4 } }

const results = []
function test(name, fn) {
  try {
    fn()
    results.push(["PASS", name])
  } catch (error) {
    results.push(["FAIL", `${name} — ${error.message}`])
  }
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

const failed = results.filter(([status]) => status === "FAIL")
for (const [status, name] of results) console.log(`${status}  ${name}`)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) process.exit(1)
