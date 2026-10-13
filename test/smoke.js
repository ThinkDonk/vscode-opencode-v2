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
  for (const invalid of ["/w/folder", "/outside/a.ts", "/w/missing.ts", "/w/a\nb.ts", "/w/a\u001bb.ts"]) {
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
