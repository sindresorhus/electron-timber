// Only load the logger for the current process type.
// Importing both would break as the main logger uses main-only APIs
// (`BrowserWindow`, `session`, …) and the renderer logger is plain browser ESM.
// This entry point itself must stay free of bare specifiers so renderers loaded
// as `<script type="module">` can resolve it without a bundler.
//
// Note: Bundlers (Vite, webpack, …) never load this file for renderer code.
// `package.json` routes the bare specifier `electron-timber` to
// `./lib/renderer.js` (`browser` condition) and to `./lib/main.js` (`node`
// condition). This file is only a fallback for relative imports (for example,
// `<script type="module">` without a bundler). The `@vite-ignore` comments
// keep bundlers from statically including the unused branch when this file is
// loaded directly.
// eslint-disable-next-line n/prefer-global/process -- Must stay import-free for plain browser ESM.
const isMain = globalThis.process?.type === 'browser';

// eslint-disable-next-line jsdoc/no-bad-blocks -- `/* @vite-ignore */` is required for Vite to skip bundling the unused branch.
const {default: logger} = await (isMain ? import(/* @vite-ignore */ './lib/main.js') : import(/* @vite-ignore */ './lib/renderer.js'));

export default logger;
