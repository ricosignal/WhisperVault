# WhisperVault Soundgasm Worker

Small Cloudflare Worker used by WhisperVault to read public Soundgasm creator pages and recording metadata.

It does **not** archive or re-host audio. Recording playback uses Soundgasm's hosted media URL when available.

## Endpoints

- `GET /health`
- `GET /api/profile?url=https://soundgasm.net/u/CreatorName`
- `GET /api/recording?url=https://soundgasm.net/u/CreatorName/Recording-Slug`

## Deploy

From this folder with Wrangler:

```bash
npx wrangler deploy
```

After deployment, copy the resulting `https://...workers.dev` URL into WhisperVault → Import creator.
