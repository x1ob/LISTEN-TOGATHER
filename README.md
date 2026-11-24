# A. Music Together

**Listen together from any browser.** Join a friend who is hosting a *Listening together* session in **A. Music** for Android, and hear the same song at the same moment – on iPhone, iPad, Mac, Windows, Linux or Android.

**Open it:** https://x1ob.github.io/LISTEN-TOGATHER/ – type the code from your friend's screen and tap **Join**.
Install it as an app: iPhone/iPad → Share → *Add to Home Screen*; Chrome/Edge → the install button in the address bar.

## What it does
- **Plays in step with the host** – same song, same moment, kept in sync the same way the app does it.
- **The app's player look** – big cover, the artwork blurred and drifting behind it, ♥ and ✕ reactions that reach the host.
- **Lyrics** – synced lyrics (LRCLIB) with the line being sung bright and the rest soft, as in the app.
- **Listening together badge** – in the app's badge spot: 🟡 catching up, 🟢 in step.
- **Up next** – see what's coming, move a song to play next or remove it (the host's queue changes too).
- **Search** – type a song name; your friend's A. Music searches YouTube Music and you pick Play next or Add (needs A. Music build 265 or newer on the host).
- **Add songs with a link** – YouTube, YouTube Music and SoundCloud play right here; Bandcamp plays on the host's phone; Spotify, Apple Music, Deezer, Tidal and other links are found on YouTube Music by the host's A. Music, the same way the app handles shared links.
- **Private by design** – no account. The session code is the key: it names a private channel and locks every message with AES-256-GCM. Only tiny messages (song, play/pause, position) pass through two public relays (ntfy.sh, ntfy.envs.net).

## Good to know
- The host is an A. Music phone; this page joins as a guest.
- iPhone needs one tap (**Tap for sound**) before Safari plays sound, and stops the sound when the screen locks.
- A few YouTube songs can't play outside YouTube. Bandcamp songs can't play in a web page.
- Moving/removing songs needs a recent A. Music on the host; adding links from Spotify and other services needs A. Music build 264 or newer.

## How it works
`tg.js` speaks protocol 1 of A. Music's Listening together: PBKDF2-SHA256 (`accord-together-v1`, 30 000 rounds) turns the code into the channel name and the AES-256 key; every message is AES-GCM with a 12-byte nonce and the `accord-tg` label. `index.html` is the player (YouTube IFrame API and the SoundCloud widget, both off screen). `sw.js` makes it installable.

## Files
| File | What it is |
|---|---|
| `index.html` | The whole page: layout, styles, player UI, lyrics, favourites, Up next, search, About, Modern-flow background (canvas), motion artwork, YouTube/SoundCloud players. |
| `tg.js` | The guest engine: session key and topic from the code, AES-GCM sealing (same as the app's Java code), relays (ntfy over SSE/POST and MQTT over secure WebSocket), the follow logic (clock offset, lag, pauses, catch-up jumps), messages to the host (hello, pings, requests, search, reactions). Loaded as `tg.js?v=N`. |
| `sw.js` | Service worker: keeps the app shell for offline start (`amt-vN`, bumped with every change so phones get the new page). |
| `manifest.webmanifest`, `icon*.png`, `icon.svg`, `glyph.svg` | Installable web app (home-screen icon). |
| `robots.txt` | Keeps the page out of search engines. |
| `CHANGELOG.md` | Every change, by date. |

## Updating the page
1. Change `index.html` / `tg.js`.
2. Bump `tg.js?v=N` in `index.html` and `sw.js`, and the cache name `amt-vN` in `sw.js`.
3. Commit and push to `main`; GitHub Pages serves it within a minute.

Current: script v20, cache amt-v20 (24 Nov 2026).

## Credits
Made by **7SN XOB** – [@x1ob](https://instagram.com/x1ob) on Instagram. Part of the A. Music project.
