'use strict';

const {ipcRenderer, remote} = require('electron');
const {existsSync} = require('fs');
const {join} = require('path');

const {appProjectFile, channel, defaults, padBwIdDigits, side, text} = require('../common/constants');
const TimberLogger = require('../common/abstract-logger');

class TimberRenderer extends TimberLogger {
	/**
	 * See {@link ../../common/AbstractTimberLogger.js|method Abstract.constructor()}.
	 */
	constructor(options = {}) {
		super(options, side.RENDERER, __dirname);
	}

	_calcPads() {
		this._pads = {
			left: text.blank.repeat(TimberLogger._maxNameLength - this.name.length),
			right: (this._id === null) ?
				text.blank.repeat(padBwIdDigits + 1) :
				text.blank.repeat(padBwIdDigits - `${this._id}`.length)
		};
	}

	_checkNameLength(buildContexts = false) {
		if (buildContexts) {
			this._buildContexts(TimberLogger._maxNameLength);
		}
		return TimberLogger._maxNameLength;
	}

	_getSharedSettings() {
		const bwLoggerChannel = `${channel.config}#${this.name}@${this._id}`;
		const shared = ipcRenderer.sendSync(channel.config, this.name, this._id);

		if (!shared.options && ipcRenderer.listenerCount(bwLoggerChannel) === 0) {
			// This means there is no logger @ main, so we set a listener to
			// provide the config to share from this renderer.
			// NOTE: The channel must be logger-specific, since multiple loggers
			//   can coexist in the same renderer browserWindow and we only want
			//   one of them (the one with same name) to return its options.
			ipcRenderer.on(bwLoggerChannel, (event, remove = false) => {
				if (remove && ipcRenderer.listenerCount(bwLoggerChannel) > 0) {
					// This task is asynchronous (no response), and we cannot remove
					// an event listener from inside its handler, so we spawn a timeout.
					return setTimeout(() => ipcRenderer.removeAllListeners(bwLoggerChannel), 0);
				}

				ipcRenderer.send(bwLoggerChannel, {
					color: this._color,
					levels: this._levels,
					options: this._initialOptions
				});
			});
		}

		return shared;
	}

	_init() {
		// Save a reference to this logger if any other file tries to
		// re-create it in this same browserWindow.
		const instances = TimberLogger._loggers.get(this.name) || {
			main: null,
			renderer: {}
		};
		instances.renderer[this._id] = this;
		TimberLogger._loggers.set(this.name, instances);

		if (ipcRenderer.listenerCount(channel.update) === 0) {
			// Listen for changes in max logger name length to rebuild the contexts.
			ipcRenderer.on(channel.update, (event, rebuild, newMaxLength) => {
				this._update(rebuild, newMaxLength);
			});
		}

		if (ipcRenderer.listenerCount(channel.setLevels) === 0) {
			// Rebuild log level helpers when new levels are broadcasted.
			ipcRenderer.on(channel.setLevels, (event, levels) => {
				this._setLevels(levels);
			});
		}
	}

	_initOnce() {
		TimberRenderer._initOnce();
	}

	create(options) {
		return new TimberRenderer(options);
	}

	getDefaults() {
		return JSON.parse(JSON.stringify(remote.getGlobal(defaults.nameSpace)));
	}

	getLogger(options) {
		const instances = TimberLogger._loggers.get(options.name);
		if (instances && instances.renderer && instances.renderer[this._id]) {
			return instances.renderer[this._id]; // Cached instance in the same browserWindow.
		}
		return new TimberRenderer(options);
	}

	/**
	 * @summary Requests `timber [main]` to set new defaults (which broadcasts them if changed).
	 * @param   {Object} [newDefaults={}] The new defaults to set.
	 */
	setDefaults(newDefaults = {}) {
		const {rebuild, maxNameLength} = ipcRenderer.sendSync(channel.defaults, newDefaults, {
			logger: this.name,
			wid: this._id
		});
		this._update(rebuild, maxNameLength);
		return rebuild;
	}

	setLevels(levels) {
		ipcRenderer.send(channel.setLevels, levels, this._id);
		this._setLevels(levels);
	}

	get _id() {
		return TimberLogger._id;
	}
}

function remoteRequireDefaultMainLogger() {
	const appPath = remote.app.getAppPath();
	const appProjectFilePath = join(appPath, appProjectFile);
	if (!existsSync(appProjectFilePath)) {
		throw new Error(`The Electron app has no "${appProjectFile}" file!!`);
	}

	const packageJSON = require(appProjectFilePath);
	const entrypointAbspath = join(appPath, packageJSON.main || '');
	if (!packageJSON.main) {
		throw new Error(`The Electron app config file "${appProjectFile}" has no "main" field!!`);
	} else if (!existsSync(entrypointAbspath)) {
		throw new Error(`The Electron app main entrypoint "${packageJSON.main}" does not exist!!`);
	}

	const mainLoggerAbspath = join(__dirname, '..', 'main', 'logger');
	remote.require(mainLoggerAbspath);
}

// eslint-disable-next-line prefer-const
let defaultLogger;

TimberRenderer._initOnce = () => {
	let bw = remote.getCurrentWindow();
	if (defaultLogger || !bw) {
		return;
	}

	// Cache the browserWindow ID for future use by all
	// renderer loggers on this browserWindow.
	TimberLogger._id = bw.id;
	window._bwID = bw.id;

	// Watch out when the browserWindow gets closed...
	// we have to update our internal registry!
	const callback = () => {
		ipcRenderer.send(channel.removeRendererLogger, TimberLogger._id);

		// Loop over all registered ipcRenderer channels and remove those belonging to timber.
		Object.keys(ipcRenderer._events).forEach(listeningChannel => {
			if (listeningChannel.startsWith(channel._prefix)) {
				ipcRenderer.removeAllListeners(listeningChannel);
			}
		});

		bw = undefined; // Remove window ref.
	};

	// NOTE: Didn't get to work the browserWindow listeners for events
	//   `close`/`closed`/`destroyed`, so we'll rely on DOM `onbeforeunload` event.
	// bw.once('close', callback);
	// bw.once('closed', callback);
	// bw.webContents.once('destroyed', callback);
	window.addEventListener('beforeunload', callback);

	// Ensure `timber [main]` exists, even when requiring `timber` for first time from a renderer!
	if (remote.ipcMain.listenerCount(channel.config) === 0) {
		remoteRequireDefaultMainLogger();
	}
};

defaultLogger = new TimberRenderer({name: defaults.logger});

module.exports = defaultLogger;
