'use strict';

const {BrowserWindow, ipcMain} = require('electron');

const ConsoleTransport = require('../../common/transports/abstract-console');
const {channel, defaults} = require('../../common/constants');

class MainConsoleTransport extends ConsoleTransport {
	constructor(options = {}, loggerName, isDefaultLogger) {
		super(options, loggerName, isDefaultLogger);
	}

	_configCollect() {
		const mainCollector = 'main';
		const {collector} = global[defaults.nameSpace];
		this._shouldResend = collector && (collector !== mainCollector || !this._isDefaultLogger);
		if (this._shouldResend) {
			return;
		}

		// Remove existent listeners (if any)...
		if (ipcMain.listenerCount(channel.collector) > 0) {
			ipcMain.removeAllListeners(channel.collector);
		}

		// If the collector is the main logger, then we need to set a listener
		// on ipcMain to receive the renderer logger(s) messages.
		ipcMain.on(channel.collector, (event, sendererLevelPriority, args) => {
			this.report(sendererLevelPriority, args);
		});
	}

	report(levelPriority, args) {
		if (this._shouldResend) {
			const idCollector = parseInt(global[defaults.nameSpace].collector, 10);
			const bwCollector = isNaN(idCollector) ? null : BrowserWindow.fromId(idCollector);
			if (bwCollector) {
				bwCollector.webContents.send(channel.collector, levelPriority, args);
			}
		}

		const method = this._getMethod(levelPriority);
		this.getNativeConsoleBackup()[method](...args.main);
	}
}

module.exports = MainConsoleTransport;
