// Offline logic test for client.js: mock the browser module loader, React,
// locale/slot services, and the standard Session hooks, then render the dock
// entry against representative Chat/Session facts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'client.js'), 'utf8')

let captured = null
const loaded = {}
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      loaded.id = definition.id
      loaded.factory = definition.factory
    },
  },
}

// Execute the browser module through a plain function wrapper (its only global
// dependencies are `window` here and `require('react')` inside the factory).
const run = new Function('window', source)
run(globalThis.window)

assert.equal(loaded.id, '@local/dsh-status-indicator')

const ReactMock = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
}

const moduleExports = loaded.factory((name) => {
  assert.equal(name, 'react')
  return ReactMock
})

assert.deepEqual(moduleExports.inject, ['slots', 'locale'])

const dictionaries = {}
let registration = null
const ctx = {
  effect(callback) {
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: {
    register(ns, dicts) {
      dictionaries[ns] = dicts
      return () => {}
    },
    bind(ns) {
      return (key) => {
        const dict = (dictionaries[ns] && dictionaries[ns].en) || {}
        return dict[key] ?? key
      }
    },
  },
  slots: {
    inject(key, callback) {
      assert.equal(key, 'conversation.composer.dock')
      return callback()
    },
    register(options, Component) {
      registration = { options, Component }
      return () => {}
    },
  },
}

const originalDocument = globalThis.document
const appended = []
globalThis.document = {
  createElement() {
    return {
      dataset: {},
      textContent: '',
      remove() {},
    }
  },
  head: {
    appendChild(node) {
      appended.push(node)
    },
  },
}

try {
  moduleExports.apply(ctx)
} finally {
  globalThis.document = originalDocument
}

assert.ok(dictionaries['status-indicator'], 'locale namespace registered')
assert.ok(dictionaries['status-indicator'].en && dictionaries['status-indicator'].zh, 'baseline locales registered')
assert.ok(registration, 'dock entry registered')
assert.equal(registration.options.name, 'conversation.composer.dock')
assert.equal(registration.options.id, 'agent-status')
assert.equal(registration.options.order, -1)
assert.equal(registration.options.locale, 'status-indicator')
assert.ok(appended.length === 1 && appended[0].dataset.plugin === '@local/dsh-status-indicator', 'style tag inserted')

const SESSION_ID = 'session-test'
const Component = registration.Component
const t = (key) => {
  const dict = dictionaries['status-indicator'].en
  return dict[key] ?? key
}

/** Render the entry with one synthetic set of Session/Chat facts. */
function render({ running = false, pendingInteraction, runningCalls = [], partial = null, nodes = 3, withChat = true } = {}) {
  const props = {
    sessionId: SESSION_ID,
    t,
    useSession: (selector) => selector({ running }),
    useSessionStatus: (selector) =>
      selector(new Map(pendingInteraction === undefined ? [] : [[SESSION_ID, { pendingInteraction }]])),
  }
  if (withChat) {
    props.useChat = (selector) => selector({ legacy: { nodes: new Array(nodes).fill({}), runningCalls, partial } })
  }
  return Component(props)
}

/** Walk the element tree (resolving mock function components) and collect data-state values. */
function statesOf(element, found = []) {
  if (element === null || element === undefined) return found
  if (Array.isArray(element)) {
    for (const child of element) statesOf(child, found)
    return found
  }
  if (typeof element !== 'object') return found
  if (typeof element.type === 'function') return statesOf(element.type(element.props), found)
  if (element.props && element.props['data-state'] !== undefined) found.push(element.props['data-state'])
  statesOf(element.children, found)
  return found
}

/** Resolve mock function components down to the element carrying one data-state. */
function findState(element, status) {
  if (element === null || element === undefined || typeof element !== 'object') return null
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findState(child, status)
      if (found !== null) return found
    }
    return null
  }
  if (typeof element.type === 'function') return findState(element.type(element.props), status)
  if (element.props && element.props['data-state'] === status) return element
  return findState(element.children, status)
}

assert.equal(statesOf(render({ running: false, nodes: 0 })).length, 0, 'blank Session idle entry is hidden')
assert.deepEqual(statesOf(render({ running: false, nodes: 3 })), ['idle'], 'idle after history')
assert.deepEqual(statesOf(render({ running: true })), ['waiting'], 'waiting for the first token')
assert.deepEqual(
  statesOf(render({ running: true, partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: 'hi' }] } })),
  ['streaming'],
  'streaming visible text',
)
assert.deepEqual(
  statesOf(render({ running: true, runningCalls: [{ phase: 'preparing', callId: 'c1', name: 'bash' }] })),
  ['streaming'],
  'streaming tool arguments',
)
assert.deepEqual(
  statesOf(render({ running: true, runningCalls: [{ phase: 'start', callId: 'c1', name: 'bash' }] })),
  ['tool'],
  'tool dispatched',
)
assert.deepEqual(
  statesOf(
    render({
      running: true,
      runningCalls: [{ phase: 'start', callId: 'c1', name: 'bash' }],
      pendingInteraction: { kind: 'question' },
    }),
  ),
  ['user'],
  'pending interaction wins over a running tool',
)
assert.equal(statesOf(render({ running: false, withChat: false })).length, 0, 'degraded variant hides idle')
assert.deepEqual(statesOf(render({ running: true, withChat: false })), ['waiting'], 'degraded variant reports work')
assert.deepEqual(
  statesOf(render({ running: true, withChat: false, pendingInteraction: { kind: 'approval' } })),
  ['user'],
  'degraded variant reports pending interaction',
)

// Every state renders a glyph with the localized label and tooltip.
for (const status of ['idle', 'waiting', 'streaming', 'tool', 'user']) {
  const element = render({
    running: status !== 'idle',
    pendingInteraction: status === 'user' ? { kind: 'question' } : undefined,
    runningCalls:
      status === 'tool'
        ? [{ phase: 'start', callId: 'c1', name: 'bash' }]
        : status === 'streaming'
          ? [{ phase: 'preparing', callId: 'c2', name: 'edit' }]
          : [],
  })
  const mark = findState(element, status)
  assert.ok(mark !== null, `state ${status} rendered`)
  assert.equal(mark.props['data-composer-stat'], 'agent-status')
  assert.equal(mark.props.role, 'status')
  assert.ok(typeof mark.props.title === 'string' && mark.props.title.length > 0, `state ${status} has a tooltip`)
  assert.ok(
    typeof mark.props['aria-label'] === 'string' && mark.props['aria-label'].includes('Harness status:'),
    `state ${status} has an aria label`,
  )
  assert.ok(mark.children.length === 2, `state ${status} draws glyph and label`)
}

console.log('client.js logic tests passed')
