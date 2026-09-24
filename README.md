# WhisperVault v3 — Personal App

WhisperVault is a local-first personal script-to-audio PWA.

## Features

- 18+ gate
- Local script library with categories, tags, search and favorites
- Device text-to-speech voices with speed, pitch and volume controls
- Source inbox for Reddit/web links
- Reddit OAuth metadata sync for approved API access
- Local JSON backup/import
- Installable PWA for iPhone/desktop after HTTPS hosting
- Scripts and preferences stay in the browser profile unless exported

## Reddit Sync

Reddit currently requires approved Data API access and OAuth authentication. WhisperVault v3 can index post metadata (title, author, permalink, flair, tags, post ID and date). It does not bulk-copy post bodies.

## GitHub Pages

This repository includes a GitHub Pages workflow. In GitHub:

Settings → Pages → Build and deployment → Source → GitHub Actions

Then open:

https://ricosignal.github.io/WhisperVault/

## Privacy

Do not commit private scripts to this repository. Add them inside the app after opening it. They are stored locally in your browser.
