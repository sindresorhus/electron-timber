// Only load the logger for the current process type.
// Importing both would break as the main logger uses main-only APIs
// (`BrowserWindow`, `session`, …) and the renderer logger is plain browser ESM.
// This entry point itself must stay free of bare specifiers so renderers loaded
// as `<script type="module">` can resolve it without a bundler.
// eslint-disable-next-line n/prefer-global/process -- Must stay import-free for plain browser ESM.
const isMain = globalThis.process?.type === 'browser';

const {default: logger} = await (isMain ? import('./lib/main.js') : import('./lib/renderer.js'));

export default logger;
