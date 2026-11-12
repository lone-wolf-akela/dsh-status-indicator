/**
 * Agent status indicator — browser half.
 *
 * Adds one entry to the composer dock (the ambient row under the input card)
 * that reports what the harness is currently waiting for:
 *
 *   idle       no live turn; the harness waits for the user
 *   waiting    a model request is in flight but no token has arrived (TTFT)
 *   streaming  the model is producing output (text, reasoning, or tool-argument
 *              deltas — the last case shows no transcript text while it runs)
 *   tool       at least one tool call is dispatched and awaiting its result
 *   user       an interaction is pending (shown when the composer is visible)
 *
 * Everything is read through the standard Session props the slot runtime
 * already provides (`useSession`, `useChat`, `useSessionStatus`), so this
 * decoration subscribes to the framework's own incremental stores instead of
 * polling the Host or rescanning Session events.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-status-indicator',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Runtime locale namespace owned by this bundle. */
    const NS = 'status-indicator'

    const DICTIONARIES = {
      en: {
        'state.idle': 'Idle',
        'state.waiting': 'Waiting',
        'state.streaming': 'Streaming',
        'state.tool': 'Tool running',
        'state.user': 'Needs you',
        'hint.idle': 'Idle — waiting for your next message.',
        'hint.waiting': 'Request sent — waiting for the model to return its first token (TTFT).',
        'hint.streaming': 'The model is streaming output; this includes tool-call arguments, which may not render as transcript text.',
        'hint.tool': 'A tool is dispatched — waiting for its result.',
        'hint.user': 'Blocked until you answer a question or approve an action.',
        'aria': 'Harness status: {state}. {hint}',
      },
      zh: {
        'state.idle': '空闲',
        'state.waiting': '等待响应',
        'state.streaming': '流式输出',
        'state.tool': '执行工具',
        'state.user': '等待你',
        'hint.idle': '空闲：正在等待你的下一条消息。',
        'hint.waiting': '请求已发出，正在等待模型返回第一个 token（TTFT）。',
        'hint.streaming': '模型正在流式返回数据；工具调用参数也算在内，界面上不一定显示吐字。',
        'hint.tool': '工具已下发，正在等待执行结果。',
        'hint.user': '正在等待你的回答或确认。',
        'aria': 'Harness 状态：{state}。{hint}',
      },
    }

    const CSS = [
      '.dsh-agent-status{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;padding:1px 8px;border-radius:var(--dsw-radius-sm);font:inherit;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;user-select:none;-webkit-user-select:none;cursor:default;--dsh-agent-status-color:#8f97a3}',
      '.dsh-agent-status[data-state="waiting"]{--dsh-agent-status-color:#e0a106}',
      '.dsh-agent-status[data-state="streaming"]{--dsh-agent-status-color:#3d8bfd}',
      '.dsh-agent-status[data-state="tool"]{--dsh-agent-status-color:#a855f7}',
      '.dsh-agent-status[data-state="user"]{--dsh-agent-status-color:#f0506e}',
      '.dsh-agent-status[data-state="waiting"],.dsh-agent-status[data-state="streaming"],.dsh-agent-status[data-state="tool"],.dsh-agent-status[data-state="user"]{background:color-mix(in srgb, var(--dsh-agent-status-color) 9%, transparent)}',
      '.dsh-agent-status-glyph{display:block;flex:none;width:14px;height:14px;color:var(--dsh-agent-status-color)}',
      '.dsh-agent-status-label{min-width:0;max-width:140px;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-agent-status[data-state="user"] .dsh-agent-status-label{color:var(--dsh-agent-status-color)}',
      '.dsh-agent-status-spin{transform-box:fill-box;transform-origin:center;animation:dsh-agent-status-spin 1.15s linear infinite}',
      '.dsh-agent-status-throb{animation:dsh-agent-status-throb 1.35s ease-in-out infinite}',
      '.dsh-agent-status-pulse{transform-box:fill-box;transform-origin:center;animation:dsh-agent-status-pulse 1.7s ease-out infinite}',
      '@keyframes dsh-agent-status-spin{to{transform:rotate(360deg)}}',
      '@keyframes dsh-agent-status-throb{0%,100%{opacity:.35}50%{opacity:1}}',
      '@keyframes dsh-agent-status-pulse{0%{opacity:.55;transform:scale(.72)}70%,100%{opacity:0;transform:scale(1.35)}}',
      '@media (prefers-reduced-motion:reduce){.dsh-agent-status-spin,.dsh-agent-status-throb,.dsh-agent-status-pulse{animation:none}}',
    ].join('')

    /** Fallback when a composition does not provide a Session-status hook. */
    const EMPTY_STATUS_MAP = new Map()

    /**
     * Empty Session-status selector for assemblies without `uiSession`.
     * @param selector - unused selector.
     * @returns undefined for every Session.
     */
    function selectFromEmptyStatus(selector) {
      return selector(EMPTY_STATUS_MAP)
    }

    /**
     * Fold the Session and Chat facts into one status discriminator.
     * @param facts - running flag, pending interaction, live tool roots, and
     *   the visible streaming partial.
     * @returns the status id rendered by this decoration.
     */
    function readStatus(facts) {
      const { running, pending, runningCalls, partial } = facts
      if (pending !== undefined && pending !== null) return 'user'
      if (running !== true) return 'idle'
      const calls = Array.isArray(runningCalls) ? runningCalls : []
      let preparingCall = false
      for (const root of calls) {
        if (root === null || typeof root !== 'object') continue
        // A 'preparing' root is a tool call whose arguments the model is still
        // streaming; every other live root is dispatched and awaiting a result.
        if (root.phase === 'preparing') preparingCall = true
        else return 'tool'
      }
      if (preparingCall) return 'streaming'
      if (partial !== null && partial !== undefined) return 'streaming'
      return 'waiting'
    }

    /**
     * Draw the compact glyph for one status.
     * @param props - the status id.
     * @returns the 14px status glyph.
     */
    function StatusGlyph({ status }) {
      const children = []
      if (status === 'streaming') {
        children.push(
          h('circle', {
            key: 'ring',
            cx: 8,
            cy: 8,
            r: 6,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeDasharray: '9.42 28.27',
            className: 'dsh-agent-status-spin',
          }),
        )
      } else if (status === 'tool') {
        children.push(
          h('circle', {
            key: 'ring',
            cx: 8,
            cy: 8,
            r: 6,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeDasharray: '1.8 2.8',
            className: 'dsh-agent-status-spin',
          }),
        )
      } else {
        children.push(
          h('circle', {
            key: 'ring',
            cx: 8,
            cy: 8,
            r: 6,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeOpacity: status === 'idle' ? 0.4 : 0.35,
            className: status === 'user' ? 'dsh-agent-status-pulse' : undefined,
          }),
        )
      }
      children.push(
        h('circle', {
          key: 'dot',
          cx: 8,
          cy: 8,
          r: status === 'idle' ? 2.2 : 2.6,
          fill: 'currentColor',
          className: status === 'waiting' ? 'dsh-agent-status-throb' : undefined,
        }),
      )
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 14,
          height: 14,
          'aria-hidden': true,
          focusable: 'false',
          className: 'dsh-agent-status-glyph',
        },
        children,
      )
    }

    /**
     * Render one status marker with its localized label and tooltip.
     * @param props - the status id and the bound translator.
     * @returns the dock entry.
     */
    function StatusMark({ status, t }) {
      const label = t('state.' + status)
      const hint = t('hint.' + status)
      return h(
        'span',
        {
          className: 'dsh-agent-status',
          'data-state': status,
          'data-composer-stat': 'agent-status',
          role: 'status',
          title: hint,
          'aria-label': t('aria', { state: label, hint }),
        },
        h(StatusGlyph, { status }),
        h('span', { className: 'dsh-agent-status-label', 'aria-hidden': true }, label),
      )
    }

    /**
     * Standard Session selector for a pending interaction of the viewed Session.
     * @param props - standard Session props of the dock entry.
     * @returns the selector hook the marker uses.
     */
    function sessionStatusHook(props) {
      return typeof props.useSessionStatus === 'function' ? props.useSessionStatus : selectFromEmptyStatus
    }

    /**
     * Full marker: reads the Session binding, the per-Session status map, and
     * the Chat view the composer statistics already use.
     * @param props - standard Session props of the dock entry.
     * @returns the status marker, or null on a blank Session.
     */
    function StatusWithChat(props) {
      const sessionId = props.sessionId
      const running = props.useSession((session) => session.running)
      const pending = sessionStatusHook(props)((snapshot) =>
        sessionId === undefined ? undefined : snapshot.get(sessionId)?.pendingInteraction,
      )
      const runningCalls = props.useChat((snapshot) => snapshot.legacy.runningCalls)
      const partial = props.useChat((snapshot) => snapshot.legacy.partial)
      const hasHistory = props.useChat((snapshot) => snapshot.legacy.nodes.length > 0)
      const status = readStatus({ running, pending, runningCalls, partial })
      // The Hero composer shares this dock; keep a blank Session free of a
      // permanent "Idle" reading.
      if (status === 'idle' && hasHistory !== true) return null
      return h(StatusMark, { status, t: props.t })
    }

    /**
     * Degraded marker for compositions without a Chat target: it still reports
     * that the harness is working, just without the streaming/tool split.
     * @param props - standard Session props of the dock entry.
     * @returns the status marker, or null while idle.
     */
    function StatusWithoutChat(props) {
      const sessionId = props.sessionId
      const running = props.useSession((session) => session.running)
      const pending = sessionStatusHook(props)((snapshot) =>
        sessionId === undefined ? undefined : snapshot.get(sessionId)?.pendingInteraction,
      )
      const status = pending !== undefined && pending !== null ? 'user' : running === true ? 'waiting' : 'idle'
      if (status === 'idle') return null
      return h(StatusMark, { status, t: props.t })
    }

    /**
     * Pick the marker variant from the standard hooks this composition provides.
     * @param props - standard Session props of the dock entry.
     * @returns the matching marker.
     */
    function StatusIndicator(props) {
      return typeof props.useChat === 'function' ? h(StatusWithChat, props) : h(StatusWithoutChat, props)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'status-indicator: dictionaries')

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = '@local/dsh-status-indicator'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'status-indicator: styles')

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'agent-status',
              order: -1,
              locale: NS,
            },
            StatusIndicator,
          ),
        )
      },
    }
  },
})
