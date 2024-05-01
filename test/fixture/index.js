import {app, BrowserWindow, ipcMain as ipc} from 'electron';
import logger from '../../index.js';

let mainWindow;

// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
	await app.whenReady();

	mainWindow = new BrowserWindow();
	await mainWindow.loadURL(`file://${import.meta.dirname}/index.html`);

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
