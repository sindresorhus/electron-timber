'use strict';
const electron = require('electron');
const logger = require('../..');

let mainWindow;
electron.app.on('ready', async () => {
	mainWindow = new electron.BrowserWindow();
	mainWindow.loadURL(`file://${__dirname}/index.html`);

	logger.log('Main log');
	logger.error('Main error');

	const customLogger = logger.create({name: 'custom'});
	customLogger.log('Custom log');
});
