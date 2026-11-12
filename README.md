# Agent status indicator

A DSH profile bundle that adds one ambient entry to the composer dock — the row
just below the message input card, beside the session statistics — showing what
the harness is currently waiting for.

| Marker | State | Meaning |
| --- | --- | --- |
| grey ring + dot | Idle | No live turn; the harness waits for your next message. |
| amber pulsing dot | Waiting | A model request is in flight, but no token has arrived yet (TTFT). |
| blue rotating arc | Streaming | The model is producing output: text, reasoning, or tool-call argument deltas. Tool arguments may never render as transcript text, so this marker is the only visible sign that the model is still working. |
| violet dashed ring | Tool running | At least one tool call is dispatched and awaiting its result. |
| rose pulsing ring | Needs you | An interaction is pending (shown when the composer is visible). |

The label and a longer tooltip are localized (English and Chinese). The dock
orders entries by `order`, so this entry registers at `order: -1` and sits at the
leading edge of the dock content. A blank Session (the Hero composer) shows no
reading until the conversation actually has history or a live turn.

While a question or approval card is pending it takes over the composer seat and
hides the dock; this plugin does not decorate that card, so the dock reading
simply reappears when the composer returns. That keeps the decoration inside the
dock and out of the question card's layout.

## How it reads state

The browser half subscribes to the standard Session props the slot runtime
already provides:

- `useSession` — whether the viewed Session is running.
- `useChat` — the Chat view's live facts: `legacy.runningCalls` distinguishes a
  tool call whose arguments are still streaming (`phase: "preparing"`) from a
  dispatched call (`phase: "start"`), and `legacy.partial` covers visible
  streaming text and reasoning.
- `useSessionStatus` — a pending interaction, when the composer is visible.

No Host polling, no Session-event rescanning, and no DOM outside this component.

## Install

Install the package root as a DSH bundle through the plugin manager
(`install_bundle` with this directory as `target`). It then appears in Plugins
as "Agent status indicator" and can be disabled or removed there. Reload the Web
page once after installing: a dynamic client bundle that was installed while a
page was already open may need the reboot of the page to fetch its module.

## Test

```powershell
node test/client-logic.test.mjs
```

The test mocks the browser module loader, React, locale/slot services, and the
standard Session hooks, then checks the state derivation (idle, TTFT, streaming
text, streaming tool arguments, dispatched tool, pending interaction), the
blank-Session hiding rule, the dock registration, and the render output (label,
tooltip, aria label).

## Files

- `package.json` — bundle manifest, `dsh.bundle.patch`, and the `dsh.client`
  web-module declaration.
- `cordis.patch.yml` — one Loader row (`status-indicator`).
- `index.js` — Host half; there is nothing to do on the Host.
- `client.js` — the browser module that registers the composer-dock entry.
- `locale/en.json`, `locale/zh.json` — Plugin Manager display title/description.
- `icon.svg` — the five-color status ring.

## Limitations

- Status facts come from the Chat view's compatibility slice; a composition
  that does not mount `@deepseek-ai/dsh-client-ui-chat` has no Chat target to
  read, and the entry falls back to a running/not-running reading.
- The first token after a tool result is shown as "Waiting" until the next
  `step/start` or first chunk arrives; the two are visually identical from the
  Client because both mean "model request in flight".
- The marker lives in the composer dock, so it is not visible while a question
  or approval card occupies the composer seat. That is intentional: the question
  card is already self-explanatory and should not be re-laid out by a
  decoration.
