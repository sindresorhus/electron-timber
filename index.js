import process from 'node:process';
import electron from 'electron';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {is} from 'electron-util';
import chalk from 'chalk';
import split from 'split2';
import Randoma from 'randoma';
import autoBind from 'auto-bind';

const {app} = electron;

const logChannel = '__ELECTRON_TIMBER_LOG__';
const warnChannel = '__ELECTRON_TIMBER_WARN__';
const errorChannel = '__ELECTRON_TIMBER_ERROR__';
const updateChannel = '__ELECTRON_TIMBER_UPDATE__';
const defaultsNameSpace = '__ELECTRON_TIMBER_DEFAULTS__';

const filteredLoggers = process.env.TIMBER_LOGGERS && new Set(process.env.TIMBER_LOGGERS.split(','));
const preloadScript = path.resolve(import.meta.dirname, 'preload.mjs');

const logLevels = {
	info: 0,
	warn: 1,
	error: 2,
};

if (is.main) {
	global[defaultsNameSpace] = {
		ignore: null,
		shouldHookConsole: false,
		logLevel: is.development ? logLevels.info : logLevels.warn,
	};
}

// Flag to indicate whether the console has been hooked or not
let isConsoleHooked = false;
const _console = {};

const hookableMethods = [
	'log',
	'warn',
	'error',
	'time',
	'timeEnd',
];

let longestNameLength = 0;

class Timber {
	#timers = new Map();
	#initialOptions;
	#isEnabled;
	#name;
	#prefixColor;

	constructor(options = {}) {
		autoBind(this);

		this.#initialOptions = options;
		this.#isEnabled = filteredLoggers && options.name ? filteredLoggers.has(options.name) : true;
		this.#name = options.name ?? '';
		this.#prefixColor = (new Randoma({seed: `${this.#name}x`})).color().hex().toString();

		if (this.#name.length > longestNameLength) {
			longestNameLength = this.#name.length;
		}
	}

	get _options() {
		return {
			...this.getDefaults(),
			...this.#initialOptions,
		};
	}

	get _console() {
		return isConsoleHooked ? _console : console;
	}

	_getPrefix() {
		return chalk.hex(this.#prefixColor)(this.#name.padStart(longestNameLength));
	}

	log(...arguments_) {
		if (!this.#isEnabled || this._options.logLevel > logLevels.info) {
			return;
		}

		if (is.renderer) {
			electron.ipcRenderer.send(logChannel, arguments_);
		} else if (this.#name) {
			arguments_.unshift(this._getPrefix() + ' ' + chalk.dim('›'));
		}

		if (this._options.ignore && this._options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this._console.log(...arguments_);
	}

	warn(...arguments_) {
		if (!this.#isEnabled || this._options.logLevel > logLevels.warn) {
			return;
		}

		if (is.renderer) {
			electron.ipcRenderer.send(warnChannel, arguments_);
		} else if (this.#name) {
			arguments_.unshift(this._getPrefix() + ' ' + chalk.yellow('›'));
		}

		if (this._options.ignore && this._options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this._console.warn(...arguments_);
	}

	error(...arguments_) {
		if (!this.#isEnabled || this._options.logLevel > logLevels.error) {
			return;
		}

		if (is.renderer) {
			electron.ipcRenderer.send(errorChannel, arguments_);
		} else if (this.#name) {
			arguments_.unshift(this._getPrefix() + ' ' + chalk.red('›'));
		}

		if (this._options.ignore && this._options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this._console.error(...arguments_);
	}

	time(label = 'default') {
		if (!this.#isEnabled || this._options.logLevel > logLevels.info) {
			return;
		}

		this.#timers.set(label, performance.now());
	}

	timeEnd(label = 'default') {
		if (!this.#isEnabled) {
			return;
		}

		if (this.#timers.has(label)) {
			const previous = this.#timers.get(label);
			const arguments_ = [label + ': ' + (performance.now() - previous) + 'ms'];
			this.#timers.delete(label);

			if (is.renderer) {
				electron.ipcRenderer.send(logChannel, arguments_);
			} else if (this.#name) {
				arguments_.unshift(this._getPrefix() + ' ' + chalk.dim('›'));
			}

			if (this._options.ignore && this._options.ignore.test(arguments_.join(' '))) {
				return;
			}

			this._console.log(...arguments_);
		}
	}

	streamLog(stream) {
		if (!this.#isEnabled || this._options.logLevel > logLevels.info) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.log(data);
		});
	}

	streamWarn(stream) {
		if (!this.#isEnabled || this._options.logLevel > logLevels.warn) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.warn(data);
		});
	}

	streamError(stream) {
		if (!this.#isEnabled || this._options.logLevel > logLevels.error) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.error(data);
		});
	}

	create(...arguments_) {
		return new Timber(...arguments_);
	}

	getDefaults() {
		const defaults = is.main ? global[defaultsNameSpace] : electron.remote.getGlobal(defaultsNameSpace);
		return {...defaults};
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
	name: is.main ? 'main' : null,
});

const unhookConsoleFunction = (hookThisConsole, shouldHookRenderers) => () => {
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

// eslint-disable-next-line unicorn/no-object-as-default-parameter
logger.hookConsole = ({main, renderer} = {main: is.main, renderer: is.renderer}) => {
	if (main && is.renderer) {
		throw new Error('You cannot hook the console in the main process from a renderer process.');
	}

	const hookThisConsole = (is.main && main) || (is.renderer && renderer);
	const shouldHookRenderers = is.main && renderer;

	if (hookThisConsole) {
		if (isConsoleHooked) {
			return unhookConsoleFunction(hookThisConsole, shouldHookRenderers);
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

	return unhookConsoleFunction(hookThisConsole, shouldHookRenderers);
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
	// eslint-disable-next-line unicorn/prefer-top-level-await
	(async () => {
		await app.whenReady();

		const session = electron.session.defaultSession;
		const currentPreloads = session.getPreloads();
		if (!currentPreloads.includes(preloadScript)) {
			session.setPreloads([...currentPreloads, preloadScript]);
		}
	})();
} else if (is.renderer && electron.ipcRenderer.listenerCount(updateChannel) === 0) {
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

export default logger;
