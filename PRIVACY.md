# Privacy Policy — Quick Actions for YouTube

_Last updated: 2026-09-05_

**Short version: this extension collects nothing, sends nothing and has no server.**

## What data the extension stores

The extension stores the following on your own device only, using Chrome's
`chrome.storage.local` API:

- Which of your playlists you pinned, and the icon or image you chose for each
- Your settings from the options page
- A local cache of the video IDs contained in your pinned playlists, used to
  highlight which playlists already contain a video
- Images you upload as a playlist symbol, downscaled to 96 px and stored as WebP

This data never leaves your browser. It is not transmitted anywhere, not to the
developer and not to any third party.

## What the extension does not do

- No analytics, telemetry, crash reporting or tracking of any kind
- No accounts, no login, no advertising, no advertising identifiers
- No selling or sharing of data — there is nothing to sell or share
- No remote code: all code is contained in the extension package
- No network requests to any server operated by the developer. The extension has
  no backend.

## Screenshots

The screenshot button copies the current video frame inside your browser and
saves it straight to your downloads folder. The image is never uploaded
anywhere.

## Thumbnails

"Download thumbnail" in a video's menu loads that video's thumbnail from
YouTube's own image server (i.ytimg.com), the same picture YouTube is already
showing, and saves it straight to your downloads folder. Nothing is sent
anywhere else.

## Permissions and why they are needed

- **`storage`** — to save your pinned playlists, their icons and your settings on
  your device.
- **Access to `https://www.youtube.com/*`** — the extension only runs on
  youtube.com. It adds the delete and quick-save buttons to the YouTube pages you
  open, and it reads the contents of your own pinned playlists (the same pages
  your browser would load if you clicked them) to know which playlists already
  contain a video. It does not run on any other website.

## Deleting your data

Removing the extension from Chrome deletes everything it stored. You can also
unpin playlists individually at any time.

## Contact

Questions about this policy: open an issue at
<https://github.com/PapayaCodeLab/quick-actions-for-youtube/issues>
