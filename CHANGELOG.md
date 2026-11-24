# Changelog

Web guest for A. Music Listening together. Newest first.

## 2026-11-24
- Fix: page stopped loading when favourites were saved (helpers used before definition); cache v20

## 2026-11-23
- Listening together: guests measure the host's clock (shortest round trip) so the delay of each state is exact
- Web: fits iPhone home-screen app (no black band), text written only when it changes, progress bar on the GPU, no background painting under full-screen artwork
- Relay rest: several refusals at once count as one
- Web: moving Modern-flow background (canvas, far lighter), fits any screen with no scrolling, landscape two-column player, motion artwork with full-screen mode
- Report button works (shows the report on the page), page errors shown, servers reached shown while waiting
- Sync report: relay status and sent/refused counts
- Never reload a song that has started (a reload only brought another ad); relay details in the sync report
- Second kind of relay: public MQTT brokers over secure WebSocket (no daily message cap), alongside ntfy
- No second player on iPhone/iPad (it could stop the playing song); tg.js versioned so page and script always match

## 2026-11-22
- Rest a relay that answers 429 instead of posting every message to it
- Seamless next song (second player preloads it), sound on at Join when allowed, tap the badge to sync, fewer corrections
- Favourites: star a song, kept in this browser across sessions, download as .m3u or copy links; offered on leave
- Guest: ride through the host's brief pause at song changes, never restart a buffering or ending song, sync report in About
- Desktop and tablet layout: player left, lyrics right, side panel for Up next and About; cover sized to the window
- Guest: report state changes at once; restart a song that never starts
- Show the host's phone songs in Now playing and the queue; edits can move them
- App badge spot with sync dot, lyrics, artwork tint, ad hold, lock-screen controls, no-cookie player, About tips
- Search songs through the host's A. Music (Play next / Add)
- SoundCloud playback, links found by the host's app, players hidden, credits and README
- Up next sheet with link bar (play next / add to queue), move and remove; About sheet; installable app
- iPhone sound: start muted, turn sound on with a tap
- Look of the app's full player: blurred drifting artwork, big cover, player controls; app icon
- Keep the page out of search engines
- Web guest for A. Music Listening together (protocol 1)
