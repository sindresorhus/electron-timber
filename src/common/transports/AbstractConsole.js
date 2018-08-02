'use strict';

const {defaults, hookableMethods} = require('../constants');

class AbstractConsoleTransport {
	constructor(options, loggerName, isDefaultLogger, rendererID) {
		if (this.constructor === AbstractConsoleTransport) {
			throw new Error("Can't instantiate abstract class `AbstractConsoleTransport`!");
		}

		this._id = rendererID;
		this._isDefaultLogger = isDefaultLogger;
		this._nativeConsole = {};
		this._shouldResend = false;
		this.supportsPrettify = true;

		if (isDefaultLogger) {
			AbstractConsoleTransport._backupNativeConsole();
		}

		this._configCollect();
	}

	_getMethod(levelPriority) {
		switch (levelPriority) {
			case 0: return 'error';
			case 1: return 'warn';
			default: return 'log';
		}
	}

	getNativeConsoleBackup() {
		return Object.assign({}, AbstractConsoleTransport._nativeConsole);
	}

	get type() {
		return AbstractConsoleTransport.type;
	}
};

AbstractConsoleTransport._nativeConsole = {};
AbstractConsoleTransport._backupNativeConsole = () => {
	hookableMethods.forEach(fn => {
		AbstractConsoleTransport._nativeConsole[fn] = console[fn];
	});
	return Object.assign({}, AbstractConsoleTransport._nativeConsole);
}


AbstractConsoleTransport.type = 'console';

module.exports = AbstractConsoleTransport;
