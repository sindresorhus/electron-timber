import {app, BrowserWindow} from 'electron';
import logger from '../../index.js';

let mainWindow;

// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
	await app.whenReady();

	mainWindow = new BrowserWindow();
	await mainWindow.loadURL(`file://${import.meta.dirname}/index.html?test=hookConsole`);

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
