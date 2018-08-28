'use strict';

const {ipcRenderer, remote} = require('electron');

const ConsoleTransport = require('../../common/transports/abstract-console');
const {channel, defaults} = require('../../common/constants');

class RendererConsoleTransport extends ConsoleTransport {
	constructor(options = {}, loggerName, isDefaultLogger, rendererID) {
		super(options, loggerName, isDefaultLogger, rendererID);
	}

	_configCollect() {
		const {collector} = remote.getGlobal(defaults.nameSpace);
		this._shouldResend = collector && (collector !== this._id || !this._isDefaultLogger);
		if (this._shouldResend) {
			return;
		}

		// Remove existent listeners (if any)...
		if (remote.ipcMain.listenerCount(channel.collector) > 0) {
			remote.ipcMain.removeAllListeners(channel.collector);
		}

		// If the collector is a renderer logger, then we need to set a
		// listener on ipcMain to re-route the renderer logger(s) messages.
		remote.ipcMain.on(channel.collector, (event, senderLevelPriority, args) => {
			remote.getCurrentWindow().webContents.send(channel.collector, senderLevelPriority, args);
		});

		if (ipcRenderer.listenerCount(channel.collector) === 0) {
			ipcRenderer.on(channel.collector, (event, senderLevelPriority, args) => {
				this.report(senderLevelPriority, args);
			});
		}
	}

	report(levelPriority, args) {
		// Some devTools extensions (like the inspector), also use a console to
		// print messages, but we already redirect those consoles to main one.
		// Those contexts don't have the Electron API available, so we won't
		// have any BrowserWindow ID there.
		if (!this._id) {
			return;
		}

		// We don't want to collect on the same browserWindow (log twice)!
		if (this._shouldResend) {
			ipcRenderer.send(channel.collector, levelPriority, args);
		}

		const method = this._getMethod(levelPriority);
		this.getNativeConsoleBackup()[method](...args.renderer);
	}
}

module.exports = RendererConsoleTransport;
