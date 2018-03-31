'use strict';
const electron = require('electron');
const logger = require('../..');

let mainWindow;
electron.app.on('ready', async () => {
	mainWindow = new electron.BrowserWindow();
	mainWindow.loadURL(`file://${__dirname}/index.html?test=logLevel`);

	const customLogger = logger.create({name: 'custom', logLevel: 'info'});

	electron.ipcMain.on('setDefaults', (event, newDefaults) => {
		logger.setDefaults(newDefaults);
	});
	electron.ipcMain.on('logger', (event, method, ...args) => {
		logger[method](...args);
		customLogger[method](...args);
	});
});
