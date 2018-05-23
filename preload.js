const {remote} = require('electron');
const logger = require('.');

const defaultsNameSpace = '__ELECTRON_TIMBER_DEFAULTS__';
const {shouldHookConsole} = remote.getGlobal(defaultsNameSpace);

if (shouldHookConsole) {
	logger.hookConsole();
}
