'use strict';
const electron = require('electron');
const {performance} = require('perf_hooks');
const path = require('path');
const {is} = require('electron-util');
const chalk = require('chalk');
const split = require('split2');
const Randoma = require('randoma');
const autoBind = require('auto-bind');

const {app} = electron;

const logChannel = '__ELECTRON_TIMBER_LOG__';
const warnChannel = '__ELECTRON_TIMBER_WARN__';
const errorChannel = '__ELECTRON_TIMBER_ERROR__';
const updateChannel = '__ELECTRON_TIMBER_UPDATE__';
const defaultsNameSpace = '__ELECTRON_TIMBER_DEFAULTS__';

const filteredLoggers = process.env.TIMBER_LOGGERS && new Set(process.env.TIMBER_LOGGERS.split(','));
const preloadScript = path.resolve(__dirname, 'preload.js');

const logLevels = {
	info: 0,
	warn: 1,
	error: 2
};

if (is.main) {
	global[defaultsNameSpace] = {
		ignore: null,
		shouldHookConsole: false,
		logLevel: is.development ? logLevels.info : logLevels.warn
	};
}

// Flag to indicate whether the console has been hooked or not
let isConsoleHooked = false;
const _console = {};
const hookableMethods = ['log', 'warn', 'error', 'time', 'timeEnd'];

let longestNameLength = 0;

class Timber {
	constructor(options = {}) {
		autoBind(this);

		this._initialOptions = options;
		this.isEnabled = filteredLoggers && options.name ? filteredLoggers.has(options.name) : true;
		this.name = options.name || '';
		this._prefixColor = (new Randoma({seed: `${this.name}x`})).color().hex().toString();
		this._timers = new Map();

		if (this.name.length > longestNameLength) {
			longestNameLength = this.name.length;
		}
	}

	get _options() {
		return Object.assign({}, this.getDefaults(), this._initialOptions);
	}

	get _console() {
		return isConsoleHooked ? _console : console;
	}

	_getPrefix() {
		return chalk.hex(this._prefixColor)(this.name.padStart(longestNameLength));
	}

	log(...args) {
		if (!this.isEnabled || this._options.logLevel > logLevels.info) {
			return;
		}

		if (is.renderer) {
			electron.ipcRenderer.send(logChannel, args);
		} else if (this.name) {
			args.unshift(this._getPrefix() + ' ' + chalk.dim('›'));
		}

		if (this._options.ignore && this._options.ignore.test(args.join(' '))) {
			return;
		}

		this._console.log(...args);
	}

	warn(...args) {
		if (!this.isEnabled || this._options.logLevel > logLevels.warn) {
			return;
		}

		if (is.renderer) {
			electron.ipcRenderer.send(warnChannel, args);
		} else if (this.name) {
			args.unshift(this._getPrefix() + ' ' + chalk.yellow('›'));
		}

		if (this._options.ignore && this._options.ignore.test(args.join(' '))) {
			return;
		}

		this._console.warn(...args);
	}

	error(...args) {
		if (!this.isEnabled || this._options.logLevel > logLevels.error) {
			return;
		}

		if (is.renderer) {
			electron.ipcRenderer.send(errorChannel, args);
		} else if (this.name) {
			args.unshift(this._getPrefix() + ' ' + chalk.red('›'));
		}

		if (this._options.ignore && this._options.ignore.test(args.join(' '))) {
			return;
		}

		this._console.error(...args);
	}

	time(label = 'default') {
		if (!this.isEnabled || this._options.logLevel > logLevels.info) {
			return;
		}

		this._timers.set(label, performance.now());
	}

	timeEnd(label = 'default') {
		if (!this.isEnabled) {
			return;
		}

		if (this._timers.has(label)) {
			const prev = this._timers.get(label);
			const args = [label + ': ' + (performance.now() - prev) + 'ms'];
			this._timers.delete(label);

			if (is.renderer) {
				electron.ipcRenderer.send(logChannel, args);
			} else if (this.name) {
				args.unshift(this._getPrefix() + ' ' + chalk.dim('›'));
			}

			if (this._options.ignore && this._options.ignore.test(args.join(' '))) {
				return;
			}

			this._console.log(...args);
		}
	}

	streamLog(stream) {
		if (!this.isEnabled || this._options.logLevel > logLevels.info) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.log(data);
		});
	}

	streamWarn(stream) {
		if (!this.isEnabled || this._options.logLevel > logLevels.warn) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.warn(data);
		});
	}

	streamError(stream) {
		if (!this.isEnabled || this._options.logLevel > logLevels.error) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.error(data);
		});
	}

	create(...args) {
		return new Timber(...args);
	}

	getDefaults() {
		const defaults = is.main ? global[defaultsNameSpace] : electron.remote.getGlobal(defaultsNameSpace);
		return Object.assign({}, defaults);
	}

	setDefaults(newDefaults = {}) {
		if (is.renderer) {
			throw new Error('setDefaults can only be called from the main process');
		}

		// We don't want the `name` property being set as a default
		delete newDefaults.name;
		if (Reflect.has(newDefaults, 'logLevel')) {
			newDefaults.logLevel = logLevels[newDefaults.logLevel];
		}

		Object.assign(global[defaultsNameSpace], newDefaults);
	}
}

const logger = new Timber({
	name: is.main ? 'main' : null
});

const unhookConsoleFn = (hookThisConsole, shouldHookRenderers) => () => {
	if (isConsoleHooked) {
		if (hookThisConsole) {
			isConsoleHooked = false;
			for (const key of hookableMethods) {
				console[key] = _console[key];
				_console[key] = null;
			}
		}

		if (shouldHookRenderers) {
			hookRenderers(false);
		}
	}
};

logger.hookConsole = ({main, renderer} = {main: is.main, renderer: is.renderer}) => {
	if (main && is.renderer) {
		throw new Error('You cannot hook the console in the main process from a renderer process.');
	}

	const hookThisConsole = (is.main && main) || (is.renderer && renderer);
	const shouldHookRenderers = is.main && renderer;

	if (hookThisConsole) {
		if (isConsoleHooked) {
			return unhookConsoleFn(hookThisConsole, shouldHookRenderers);
		}

		isConsoleHooked = true;

		for (const key of hookableMethods) {
			_console[key] = console[key];
			console[key] = logger[key];
		}
	}

	if (shouldHookRenderers) {
		hookRenderers(true);
	}

	return unhookConsoleFn(hookThisConsole, shouldHookRenderers);
};

function hookRenderers(flag) {
	if (is.main) {
		global[defaultsNameSpace].shouldHookConsole = flag;
		for (const win of electron.BrowserWindow.getAllWindows()) {
			win.webContents.send(updateChannel, flag);
		}
	}
}

if (is.main) {
	const rendererLogger = new Timber({name: 'renderer'});
	if (electron.ipcMain.listenerCount(logChannel) === 0) {
		electron.ipcMain.on(logChannel, (event, data) => {
			rendererLogger.log(...data);
		});
	}

	if (electron.ipcMain.listenerCount(warnChannel) === 0) {
		electron.ipcMain.on(warnChannel, (event, data) => {
			rendererLogger.warn(...data);
		});
	}

	if (electron.ipcMain.listenerCount(errorChannel) === 0) {
		electron.ipcMain.on(errorChannel, (event, data) => {
			rendererLogger.error(...data);
		});
	}

	// Register a preload script so we know whenever a new renderer is created.
	(async () => {
		await app.whenReady();

		const session = electron.session.defaultSession;
		const currentPreloads = session.getPreloads();
		if (!currentPreloads.includes(preloadScript)) {
			session.setPreloads(currentPreloads.concat([preloadScript]));
		}
	})();
} else if (is.renderer) {
	if (electron.ipcRenderer.listenerCount(updateChannel) === 0) {
		electron.ipcRenderer.on(updateChannel, (event, flag) => {
			if (flag) {
				logger.hookConsole();
			} else {
				isConsoleHooked = false;
				for (const key of hookableMethods) {
					console[key] = _console[key];
					_console[key] = null;
				}
			}
		});
	}
}

module.exports = logger;
