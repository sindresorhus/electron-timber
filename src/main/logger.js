'use strict';

const {app, BrowserWindow, ipcMain, session} = require('electron');
const {join} = require('path');

const {channel, defaults, padBwIdDigits, side, text} = require('../common/constants');
const {getTransports, has, isArray, isNil, isObject, isString, oneOf} = require('../common/utils');
const TimberLogger = require('../common/abstract-logger');

class TimberMain extends TimberLogger {
	/**
	 * See {@link ../../common/AbstractTimberLogger.js|method Abstract.constructor()}.
	 */
	constructor(options = {}) {
		super(options, side.MAIN, __dirname);
	}

	/**
	 * @summary Rebuilds the contexts for ALL (except `exclude`) instantiated loggers at both sides.
	 * @param   {Object} exclude The renderer `logger` in BrowserWindow with ID `wid` to exclude.
	 * NOTE: Only invoked by `timber [main]`.
	 */
	_broadcastUpdate(needsRebuild, exclude) {
		const maxNameLength = TimberLogger._maxNameLength;

		// We need to broadcast the changes to chromium devTools/extensions
		// (which don't have a bound BrowserWindow, so we cannot fetch their
		// renderer process by ID), so we grab the very first one we found,
		// since the only we want is to send a message from any renderer to main.
		let rendererID;

		const excludedWID = exclude && `${exclude.wid}`;
		TimberLogger._loggers.forEach((instances, name) => {
			if (!instances) {
				return;
			}
			const isExcluded = exclude ? (name === exclude.logger) : false;

			if (instances.main && (!isExcluded || exclude.wid)) {
				instances.main._update(needsRebuild, maxNameLength);
			}

			const renderers = this._purgeDestroyedRenderers(instances);
			rendererID = rendererID || renderers[0];

			renderers.forEach(wid => {
				// Exclude here the requestor logger instance which (should be
				// managed actually when returning the new max length by IPC).
				if (!isExcluded || wid !== excludedWID) {
					const bw = BrowserWindow.fromId(parseInt(wid, 10));
					bw.webContents.send(channel.update, needsRebuild, maxNameLength);
				}
			});
		});

		// We only need to broadcast to all chromium devTools/extensions ONCE by
		// sending an IPC message from any renderer process to main (all chromium
		// devTools/extensions will be listening to that channel).
		if (rendererID) {
			const extChannel = channel.updateExtensions;
			const compactFlags = JSON.stringify(needsRebuild);
			const code = `require('electron').ipcRenderer.send("${extChannel}", ${compactFlags}, ${maxNameLength});`;
			const bw = BrowserWindow.fromId(parseInt(rendererID, 10));
			bw.webContents.executeJavaScript(code);
		}
	}

	_calcPads() {
		this._pads = {
			left: text.blank.repeat(TimberLogger._maxNameLength - this.name.length),
			right: text.blank.repeat(side.RENDERER.length + padBwIdDigits + 1 - this._side.length)
		};
	}

	_checkNameLength(buildContext = false, loggerName = this.name, rendererID = null) {
		const nameLength = loggerName.length;

		if (nameLength > TimberLogger._maxNameLength) {
			// Update longest context length to pad all messages accordingly.
			TimberLogger._maxNameLength = nameLength;
			this._broadcastUpdate({contexts: true}, {
				logger: loggerName,
				wid: rendererID
			});
		}

		if (buildContext) {
			this._buildContexts(TimberLogger._maxNameLength);
		}

		return TimberLogger._maxNameLength;
	}

	_getSharedSettings(event = null, name = this.name, rendererID = TimberLogger._id) {
		const returned = this._getSharedSettingsIfLoggerExists(event, name, rendererID);
		return returned;
	}

	/**
	 * @summary Fetches the options from an existent logger instance with the same `name` (if exists).
	 * @param   {Event}   [event]    The IPC event (only on renderer loggers).
	 * @param   {String}  name       The logger name.
	 * @param   {Number}  rendererID The BrowserWindow ID (only on renderer loggers); `null` on main.
	 * @return  {Object}             The configuration to share.
	 * NOTE: ALWAYS invoked from `timber [main]` through IPC (renderer) or any other main logger by itself.
	 */
	_getSharedSettingsIfLoggerExists(event, name, rendererID) {
		const instances = TimberLogger._loggers.get(name);

		// We must trigger contexts regeneration if max logger name length changes by
		// notifying ALL logger(s) instance(s) (main & renderers), except the current one
		// doing the request (which already manages this its creation on `constructor()`).
		const maxNameLength = this._checkNameLength(false, name, rendererID);
		const basicShared = {maxNameLength};

		// Purge destroyed windows from instances (if any).
		// NOTE: This prevent cases where `channel.removeRendererLogger` doesn't trigger.
		const rendererLoggers = this._purgeDestroyedRenderers(instances);

		// No logger instance available to fetch options from, so we must
		if (!instances || (!instances.main && rendererLoggers.length === 0)) {
			// Main loggers already self-manage its registration on creation, but
			// renderer loggers don't, so we must register them here on main, because
			// they self-manage its registration on creation on its renderer side.
			if (rendererID) {
				const firstLoggerFromRenderer = {main: null, renderer: {}};
				firstLoggerFromRenderer.renderer[rendererID] = true;
				TimberLogger._loggers.set(name, firstLoggerFromRenderer);
			}
			if (event) {
				event.returnValue = basicShared;
			}
			return basicShared;
		}

		// Update the entry with the browserWindow ID of the new renderer logger instance.
		if (rendererID && !instances.renderer[rendererID]) {
			instances.renderer[rendererID] = true;
			TimberLogger._loggers.set(name, instances);
		}

		// Main logger ~> (main|renderer) logger.
		// NOTE: Since listener at first renderer instance is removed after a
		//   main instance is available, we must check main instance first!
		if (instances.main) {
			const shared = Object.assign(basicShared, {
				color: instances.main._color,
				levels: instances.main._levels,
				options: instances.main._initialOptions
			});
			if (event) {
				event.returnValue = shared;
			}
			return shared;
		}

		// Requestor is a renderer logger.
		if (rendererID) {
			// Renderer logger ~> renderer logger.
			if (rendererLoggers.length > 0) {
				// Find the first renderer logger which is in a different browserWindow.
				const wid = rendererLoggers.find(wid => (parseInt(wid, 10) !== rendererID));
				const bwLoggerChannel = `${channel.config}#${name}@${wid}`;

				// Check here that `ipcRenderer` has a listener on `bwLoggerChannel` before sending!
				const bw = BrowserWindow.fromId(parseInt(wid, 10));
				if (!bw || bw.webContents.listenerCount(bwLoggerChannel) === 0) {
					throw new Error(`No BrowserWindow with ID ${wid} or no listener at "${bwLoggerChannel}"`);
				}

				// Set listener to catch the response from the renderer logger and fetch them!
				ipcMain.once(bwLoggerChannel, (bwEvent, rendererConfig) => {
					event.returnValue = Object.assign(basicShared, rendererConfig);
				});
				bw.webContents.send(bwLoggerChannel, false);
			}
			return;
		}

		// Requestor is a main logger: Renderer logger ~> main logger.
		if (rendererLoggers.length > 0) {
			// Requestor is the first main logger with this name, but there exist
			// renderer loggers, so we have to remove their listeners for options
			// after fetching them (because main logger instances are cached and take over).
			const bwLoggerChannel = `${channel.config}#${name}@${rendererLoggers[0]}`;

			// Set listener to catch the response from the renderer logger.
			ipcMain.once(bwLoggerChannel, (bwEvent, rendererConfig) => {
				for (const id of rendererLoggers) {
					const wid = parseInt(id, 10);
					BrowserWindow.fromId(wid).webContents.send(channel.config, true);
				}
				event.returnValue = Object.assign(basicShared, rendererConfig);
			});

			// Fetch the options to share from the first available renderer logger.
			BrowserWindow.fromId(parseInt(rendererLoggers[0], 10)).webContents.send(bwLoggerChannel, false);
			// FIXME We should return here the config in a sync way to the main
			//   logger requestor, but I have no idea on how to do this!
			// return rendererConfig;
		}
	}

	_init() {
		// Save a reference to this logger.
		const instances = TimberLogger._loggers.get(this.name) || {
			main: null,
			renderer: {}
		};
		instances.main = this;
		TimberLogger._loggers.set(this.name, instances);
	}

	_initOnce() {
		TimberMain._initOnce();
	}

	_purgeDestroyedRenderers(instances) {
		if (!instances || !instances.renderer) {
			return [];
		}
		const wids = Object.keys(instances.renderer);
		if (wids.lentgth === 0) {
			return [];
		}

		for (const wid of wids) {
			const bw = BrowserWindow.fromId(parseInt(wid, 10));
			if (!bw) {
				delete instances.renderer[wid];
			}
		}
		return Object.keys(instances.renderer);
	}

	create(options) {
		return new TimberMain(options);
	}

	getDefaults() {
		return Object.assign({}, global[defaults.nameSpace]);
	}

	getLogger(options) {
		if (!options.name) {
			throw new Error('No name provided to fetch logger!');
		}
		const instances = TimberLogger._loggers.get(options.name);
		if (instances && instances.main) {
			return instances.main;
		}
		return new TimberMain(options);
	}

	setDefaults(newDefaults = {}, exclude) {
		const hasChanged = (option, value) => (value !== global[defaults.nameSpace][option]);

		// We don't want the `name`/`levels` properties being set as a default.
		delete newDefaults.name;
		delete newDefaults.levels;

		this._mapLogLevelToPriority(newDefaults);

		const update = {
			collector: false,
			contexts: false,
			helpers: false,
			hooks: false,
			levels: hasChanged('devToolsDarkTheme', newDefaults.devToolsDarkTheme),
			transports: false
		};

		// Validate options.
		// Some ones (`devToolsDarkTheme`/`timestamp`) require rebuilding the logger contexts.
		// Other ones (`ignore`/`logLevel`/`prettify`) require rebuilding the log level helpers.
		const supported = {
			collector: [false, 'main', 'renderer'],
			devToolsDarkTheme: [false, true],
			logLevel: null, // Validated in `_mapLogLevelToPriority()`.
			muteElectronInspector: [true, false],
			prettify: ['all', 'context', 'none'],
			separator: null, // Custom validation.
			shouldHookConsole: [false, true],
			timestamp: [false, 'iso', 'time']
		};
		Object.keys(supported).forEach(o => {
			const v = newDefaults[o];
			if (v === undefined) {
				return;
			}

			// Update flags.
			if (o === 'devToolsDarkTheme' || o === 'timestamp') {
				update.contexts = update.contexts || hasChanged(o, v);
			} else if (o === 'logLevel' || o === 'prettify') {
				update.helpers = update.helpers || hasChanged(o, v);
			} else if (o === 'shouldHookConsole') {
				update.hooks = true;
			}

			let valid = (supported[o] === null || oneOf(supported[o], v));
			if (!valid) {
				// These options can take additional values which requires a more-in-depth validation.
				if ((o === 'collector' && parseInt(v, 10) > 0) ||
					(o === 'muteElectronInspector' && parseInt(v, 10) >= 0) ||
					(o === 'separator' && isString(v))
				) {
					valid = true;
				}
			}

			if (!valid) {
				throw new Error(`Invalid value provided for option "${o}": ${v}`);
			}
		});

		// Some more fine-grained validations.
		let opt = 'transports';
		let val = newDefaults[opt];
		const mapTransport = getTransports(__dirname);
		if (!isNil(val)) {
			update.transports = true;
			const validTransport = v => {
				return (isString(v) && has(mapTransport, v)) ||
					(isObject(v) && has(mapTransport, v.type));
			};
			if (!isArray(val) || !val.every(validTransport)) {
				throw new Error(`Invalid value provided for option "${opt}": ${val}`);
			}
		}

		// Parse the collector as number if ID.
		opt = 'collector';
		const collectorID = parseInt(newDefaults[opt], 10);
		if (!isNaN(collectorID)) {
			newDefaults[opt] = collectorID;
		} else if (newDefaults[opt] === 'renderer') {
			newDefaults[opt] = 1; // First created browserWindow.
		}
		if (hasChanged(opt, newDefaults[opt])) {
			update.collector = true;
		}

		// Map `ignore` pattern(s) into RegExps.
		opt = 'ignore';
		val = newDefaults[opt];
		if (val) {
			update.helpers = true;
			if (!isNil(val) && (!isArray(val) || !val.every(v => isString(v)))) {
				throw new Error(`Invalid value provided for option "${opt}": ${val}`);
			}
		}

		Object.assign(global[defaults.nameSpace], newDefaults);

		// Rebuild/rebind where/when needed AFTER new defaults have been
		// saved and for ALL loggers (except extensions!).
		if (Object.values(update).some(flag => (flag === true))) {
			this._broadcastUpdate(update, exclude);
		}

		return update;
	}

	setLevels(levels) {
		this._setLevels(levels);
		TimberLogger._loggers.forEach(instances => {
			Object.keys(instances.renderer).forEach(wid => {
				const bw = BrowserWindow.fromId(parseInt(wid, 10));
				bw.webContents.send(channel.setLevels, levels);
			});
		});
	}
}

function injectPreloadScript() {
	const pathToPreloadScript = join(__dirname, '..', 'renderer', 'preload.js');
	const defaultSession = session.defaultSession;
	const currentPreloads = defaultSession.getPreloads();
	if (!currentPreloads.includes(pathToPreloadScript)) {
		// We should capture native console calls since the very beginning.
		defaultSession.setPreloads([pathToPreloadScript].concat(currentPreloads));
	}
}

// eslint-disable-next-line prefer-const
let defaultLogger;

/** *************
 * STATIC STUFF *
 * **************/
TimberMain._initOnce = () => {
	if (defaultLogger) {
		return;
	}

	// Register a preload script so we know whenever a new renderer is created.
	// WARNING! DO NOT USE `electron-utils.appReady.then()` here, because it's
	//   asynchronous and sometimes it gets executed AFTER some browserWindows
	//   have already been created, thus not injecting our preload script in ALL
	//   new browserWindows.
	if (app.isReady()) {
		injectPreloadScript();
	} else {
		app.once('ready', injectPreloadScript);
	}

	if (ipcMain.listenerCount(channel.setLevels) === 0) {
		// Broadcast new log levels to all instances of a given logger.
		ipcMain.on(channel.setLevels, (event, name, rendererID, levels) => {
			const instances = TimberLogger._loggers.get(name);
			if (instances.main && !rendererID) {
				instances.main._setLevels(levels);
			}
			Object.keys(instances.renderer).forEach(bwID => {
				const wid = parseInt(bwID, 10);
				if (wid !== rendererID) {
					const bw = BrowserWindow.fromId(wid);
					bw.webContents.send(channel.setLevels, levels);
				}
			});
		});
	}

	// Listeners from here on only trigger for default main logger (`timber [main]`).
	if (ipcMain.listenerCount(channel.config) === 0) {
		// Keep track of renderer loggers, and inherit options when a
		// logger with the same name exists.
		ipcMain.on(channel.config, (...args) => {
			defaultLogger._getSharedSettings(...args);
		});
	}

	if (ipcMain.listenerCount(channel.defaults) === 0) {
		// Allow setting defaults from anywhere through IPC.
		ipcMain.on(channel.defaults, (event, ...args) => {
			event.returnValue = {
				rebuild: defaultLogger.setDefaults(...args),
				maxNameLength: TimberLogger._maxNameLength
			};
		});
	}

	if (ipcMain.listenerCount(channel.removeRendererLogger) === 0) {
		ipcMain.on(channel.removeRendererLogger, (event, wid) => {
			// We need to loop over ALL existent loggers.
			TimberLogger._loggers.forEach((instances, name, map) => {
				if (has(instances.renderer, wid)) {
					delete instances.renderer[wid];
					if (!instances.main && Object.keys(instances.renderer).length === 0) {
						map.delete(name);
					} else {
						map.set(name, instances);
					}
				}
			});
		});
	}
};

defaultLogger = new TimberMain({name: defaults.logger});

module.exports = defaultLogger;
