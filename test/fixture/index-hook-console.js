import path from 'node:path';
import {app, BrowserWindow} from 'electron';
import logger from '../../index.js';

let mainWindow;

// Top-level await must not be used here: Electron emits `ready` only after the
// entry module finishes evaluating, so awaiting `app.whenReady()` at the top
// level would hang. An async IIFE keeps module evaluation synchronous.
// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
	await app.whenReady();

	mainWindow = new BrowserWindow({
		webPreferences: {
			nodeIntegration: true,
		},
	});
	await mainWindow.loadFile(path.join(import.meta.dirname, 'index.html'), {query: {test: 'hookConsole'}});

	let unhook = logger.hookConsole({main: true, renderer: false});
	console.log('Main log console');
	console.warn('Main warn console');
	unhook();
	console.log('Main log console');
	console.warn('Main warn console');

	unhook = logger.hookConsole();
	console.error('Main error console');
	console.time('Main timer console');
	console.timeEnd('Main timer console');
	unhook();
	console.error('Main error console');
	console.time('Main timer console');
	console.timeEnd('Main timer console');

	const customLogger = logger.create({name: 'custom', logLevel: 'info'});
	try {
		customLogger.hookConsole();
	} catch (error) {
		console.log(error.message);
	}
})();
