# A. Music Together

**Listen together from any browser.** Join a friend who is hosting a *Listening together* session in **A. Music** for Android, and hear the same song at the same moment – on iPhone, iPad, Mac, Windows, Linux or Android.

**Open it:** https://x1ob.github.io/LISTEN-TOGATHER/ – type the code from your friend's screen and tap **Join**.
Install it as an app: iPhone/iPad → Share → *Add to Home Screen*; Chrome/Edge → the install button in the address bar.

## What it does
- **Plays in step with the host** – same song, same moment, kept in sync the same way the app does it.
- **The app's player look** – big cover, the artwork blurred and drifting behind it, ♥ and ✕ reactions that reach the host.
- **Up next** – see what's coming, move a song to play next or remove it (the host's queue changes too).
- **Add songs with a link** – YouTube, YouTube Music and SoundCloud play right here; Bandcamp plays on the host's phone; Spotify, Apple Music, Deezer, Tidal and other links are found on YouTube Music by the host's A. Music, the same way the app handles shared links.
- **Private by design** – no account. The session code is the key: it names a private channel and locks every message with AES-256-GCM. Only tiny messages (song, play/pause, position) pass through two public relays (ntfy.sh, ntfy.envs.net).

## Good to know
- The host is an A. Music phone; this page joins as a guest.
- iPhone needs one tap (**Tap for sound**) before Safari plays sound, and stops the sound when the screen locks.
- A few YouTube songs can't play outside YouTube. Bandcamp songs can't play in a web page.
- Moving/removing songs needs a recent A. Music on the host; adding links from Spotify and other services needs A. Music build 264 or newer.

## How it works
`tg.js` speaks protocol 1 of A. Music's Listening together: PBKDF2-SHA256 (`accord-together-v1`, 30 000 rounds) turns the code into the channel name and the AES-256 key; every message is AES-GCM with a 12-byte nonce and the `accord-tg` label. `index.html` is the player (YouTube IFrame API and the SoundCloud widget, both off screen). `sw.js` makes it installable.

## Credits
Made by **7SN XOB** – [@x1ob](https://instagram.com/x1ob) on Instagram. Part of the A. Music project.
