import path from 'node:path';
import {app, BrowserWindow} from 'electron';
import logger from '../../index.js';

logger.setDefaults({logLevel: 'info', timestamp: true});

// Top-level await must not be used here: Electron emits `ready` only after the
// entry module finishes evaluating, so awaiting `app.whenReady()` at the top
// level would hang. An async IIFE keeps module evaluation synchronous.
// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
	await app.whenReady();

	// Default `webPreferences`, so the renderers are sandboxed and have no Node.js integration.
	await new BrowserWindow({show: false}).loadFile(path.join(import.meta.dirname, 'index.html'));
	await new BrowserWindow({show: false}).loadFile(path.join(import.meta.dirname, 'index.html'), {query: {test: 'defaults'}});

	setTimeout(() => {
		app.quit();
	}, 1000);
})();
