'use strict';
const electron = require('electron');
const logger = require('../..');

const test = (new URLSearchParams(window.location.search)).get('test');

// Run different code for different tests
if (test === 'hookConsole') {
	let unhook = logger.hookConsole();
	console.log('Renderer log console');
	console.warn('Renderer warn console');
	unhook();
	console.log('Renderer log console');
	console.warn('Renderer warn console');

	unhook = logger.hookConsole();
	console.error('Renderer error console');
	console.time('Renderer timer console');
	console.timeEnd('Renderer timer console');
	unhook();
	console.error('Renderer error console');
	console.time('Renderer timer console');
	console.timeEnd('Renderer timer console');
} else if (test === 'logLevel') {
	electron.ipcRenderer.on('logger', (event, method, ...arguments_) => {
		logger[method](...arguments_);
	});
} else {
	logger.log('Renderer log');
	logger.warn('Renderer warn');
	logger.error('Renderer error');
	logger.time('Renderer timer');
	logger.timeEnd('Renderer timer');
}
