import path from 'node:path';
import {app, BrowserWindow, ipcMain as ipc} from 'electron';
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
	await mainWindow.loadFile(path.join(import.meta.dirname, 'index.html'));

	const {log} = logger;
	log('Main log');

	logger.warn('Main warn');
	logger.error('Main error');
	logger.time('Main timer');
	logger.timeEnd('Main timer');

	const customLogger = logger.create({name: 'custom', logLevel: 'info'});
	customLogger.log('Custom log');

	ipc.on('setDefaults', (event, newDefaults) => {
		logger.setDefaults(newDefaults);
	});

	ipc.on('logger', (event, method, ...arguments_) => {
		logger[method](...arguments_);
		customLogger[method](...arguments_);
	});
})();
