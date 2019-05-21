'use strict';
const {app, BrowserWindow} = require('electron');
const logger = require('../..');

let mainWindow;

(async () => {
	await app.whenReady();

	mainWindow = new BrowserWindow();
	await mainWindow.loadURL(`file://${__dirname}/index.html?test=hookConsole`);

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
