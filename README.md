# kettu-plugins

Custom Kettu (Vendetta-format) plugins for iOS — part of the **Kettu MAX** build (Discord 353.0, KettuTweak loader). Ports of Discord Plus v1.1 features, rewritten against the Kettu/Vendetta Metro API (no webpack, no DOM), plus one fresh build.

## Install

In Kettu: **Settings → Plugins → Add Plugin**, paste one URL per plugin (the directory URL — Kettu fetches `manifest.json`, then `index.js` from it):

| Plugin | Install URL | What it does |
|---|---|---|
| Catbox Upload | https://dolanexeee.github.io/kettu-plugins/catbox/ | Long-press a message attachment → upload it to Catbox anonymously (permanent link, copied to clipboard). `/catbox <url>` uploads a file from a public URL and posts the link. |
| Translate Messages | https://dolanexeee.github.io/kettu-plugins/translate/ | Long-press a message → "Translate" (or `/translate <text>`). Arabic ↔ English, auto direction. Google gtx primary, MyMemory fallback. |
| Timeout Countdown | https://dolanexeee.github.io/kettu-plugins/timeout-countdown/ | `/timeoutinfo <user>` — when a member's timeout ends, with Discord's native live-countdown timestamp. |
| Member Details | https://dolanexeee.github.io/kettu-plugins/member-details/ | `/userinfo <user>` — account creation date (snowflake), account age, server join date, roles. |
| Export Tools | https://dolanexeee.github.io/kettu-plugins/export-tools/ | `/exportmessages` (JSON) and `/exportmembers` (CSV) — copy loaded channel messages / member list to the clipboard. |

## How these were built

- **Plugin API verified from source**: Kettu repo (`cocobo1/Kettu`, Codeberg) — `src/core/vendetta/plugins.ts` (install = `<url>manifest.json` + `<url><main || "index.js">`, plugin object `{ onLoad, onUnload }`), `src/core/vendetta/api.tsx` (`vendetta.metro.findByProps/findByStoreName`, `vendetta.patcher`, `vendetta.ui.alerts/toasts`, `vendetta.metro.common.clipboard/toasts`, `vendetta.commands.registerCommand`), `src/lib/api/commands/types.ts` (option types: STRING=3, USER=6; command `execute` returning `{ content }` sends a message).
- **Message-sheet pattern copied from a working plugin**: c10udburst's `delete-embeds` (patch `ActionSheet openLazy` for `MessageLongPressActionSheet`, push a `FormRow` into the `ButtonRow` group).
- **Logic ported from Discord Plus v1.1** (`~/workspace/projects/discord-plus/DiscordPlus/Resources/JS/plugins/`): translate endpoints, snowflake date math, `communicationDisabledUntil`, store prop names (`getMember`/`getMemberCount`, `getUser`, `getRoles`).
- **Catbox API verified**: `POST https://catbox.moe/user/api.php`, `reqtype=fileupload` + `fileToUpload`, anonymous (no `userhash`), returns a plain-text `https://files.catbox.moe/…` URL, 200 MB limit.

## Honest limits (mobile vs the web versions)

- **No DOM on mobile**: nothing is injected into profiles or the member list. Timeout and member details are slash commands; the timeout reply uses Discord's native `<t:epoch:R>` timestamp, which the client renders as a live countdown. Translate shows its result in an alert with a Copy button.
- **No file picker in the Kettu API**: Catbox uploads files that are already reachable (message attachments, or a public URL) — it cannot pick a file from the device.
- **No file download on iOS React Native**: Export Tools copies to the clipboard instead of downloading a file. Paste into Notes/Files to save it.
- **Only loaded data is exported**: scroll up to load more history first, same as the web version.
- **Not yet tested on-device**: syntax-checked with `node --check` and reviewed, but no iPhone was available here. On-device testing is still needed — if a store name/shape differs on Discord 353.0, the commands fail with a toast/message instead of inventing data.

## Layout

Each plugin is one directory with `index.js` + `manifest.json` (polymanifest: `name`, `description`, `authors`, `main`, `hash` = sha256 of `index.js`). No build step — edit `index.js`, re-run the hash, update the manifest, push; Kettu re-fetches on update.
