'use strict';
const electron = require('electron');
const logger = require('../..');

let mainWindow;
electron.app.on('ready', async () => {
	mainWindow = new electron.BrowserWindow();
	mainWindow.loadURL(`file://${__dirname}/index.html?test=hookConsole`);

	let unhook = logger.hookConsole();
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
	} catch (err) {
		console.log(err.message);
	}
});
