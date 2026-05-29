# LLM Chat Bridge

[![React](https://img.shields.io/badge/React-19-087f8c?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-d99f24?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)

LLM Chat Bridge is a React + TypeScript Manifest V3 Chrome extension that transfers the currently open chat from one supported LLM website to another. It is local-first: the extension does not use a backend, does not sync chat content, and never sends the destination prompt automatically.

## Tech Stack

- React 19 for the popup and options UI.
- TypeScript for UI state, shared provider types, and formatter contracts.
- Vite for building the production load-unpacked extension into `dist/`.
- Manifest V3 content scripts and service worker for Chrome extension behavior.

## V1 Providers

- ChatGPT
- Gemini
- Claude
- DeepSeek

## Load Unpacked

Build the extension first:

```powershell
npm install
npm run build
```

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select the `dist` folder in this project.

## Workflow

1. Open a supported LLM conversation.
2. Click the extension icon.
3. Click **Capture current chat**.
4. Choose a destination provider.
5. Click **Open and fill**.

The extension opens the destination LLM and fills its composer. It never presses Send. If the destination composer cannot be found, it copies the formatted prompt to the clipboard as a fallback.

## File Attachments

The extension captures file attachments as part of the transfer when the source chat exposes a visible file name, attachment card, download link, or file-looking URL. Linked files are included in the destination prompt with their name, type/size when visible, and source link.

Chrome extensions cannot reliably extract and re-upload hidden/private file bytes from another LLM provider's chat history. If a provider does not expose a usable file link, the transfer includes a clear file placeholder so the destination LLM can ask you to upload that file manually.

## Development

The Chrome runtime source files live in `extension/`, while React + TypeScript UI entrypoints live in `src/popup` and `src/options`. The production load-unpacked extension is generated into `dist/`.

Available scripts:

- `npm test` runs formatter tests with Node.
- `npm run build` validates the load-unpacked extension files exist and the manifest is valid JSON.
- `npm run typecheck` runs TypeScript checks after dependencies are installed.

## Privacy

See `PRIVACY.md`. Chat content is processed locally in the browser and is only placed into another LLM composer or copied to the clipboard after a user action.
