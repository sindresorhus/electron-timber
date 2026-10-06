import path from 'node:path';
import {app, BrowserWindow} from 'electron';
import logger from '../../index.js';

logger.setDefaults({logLevel: 'info'});
logger.hookConsole({renderer: true});

// Top-level await must not be used here: Electron emits `ready` only after the
// entry module finishes evaluating, so awaiting `app.whenReady()` at the top
// level would hang. An async IIFE keeps module evaluation synchronous.
// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
	await app.whenReady();

	const window = new BrowserWindow({show: false});

	// Print what the DevTools console shows to stdout, as the logger writes the renderer warnings to stderr.
	window.webContents.on('console-message', event => {
		console.log(`DevTools: ${event.message}`);
	});

	await window.loadFile(path.join(import.meta.dirname, 'index.html'), {query: {test: 'securityWarning'}});

	setTimeout(() => {
		app.quit();
	}, 1000);
})();
