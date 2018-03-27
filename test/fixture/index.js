'use strict';
const electron = require('electron');
const logger = require('../..');

let mainWindow;
electron.app.on('ready', async () => {
	mainWindow = new electron.BrowserWindow();
	mainWindow.loadURL(`file://${__dirname}/index.html`);

	const log = logger.log;
	log('Main log');

	logger.warn('Main warn');
	logger.error('Main error');
	logger.time('Main timer');
	logger.timeEnd('Main timer');

	const customLogger = logger.create({name: 'custom', logLevel: 'info'});
	customLogger.log('Custom log');

	electron.ipcMain.on('setDefaults', (event, newDefaults) => {
		logger.setDefaults(newDefaults);
	});
	electron.ipcMain.on('logger', (event, method, ...args) => {
		logger[method](...args);
		customLogger[method](...args);
	});
});
