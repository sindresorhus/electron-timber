import process from 'node:process';
import path from 'node:path';
import {
	app,
	BrowserWindow,
	ipcMain,
	session,
} from 'electron';
import chalk from 'chalk';
import Randoma from 'randoma';
import autoBind from 'auto-bind';
import split from 'split2';
import {
	logChannel,
	warnChannel,
	errorChannel,
	updateChannel,
	defaultsRequestChannel,
	defaultsUpdatedChannel,
	defaultsNamespace,
	preloadId,
	filteredLoggers,
	logLevels,
	normalizeLogLevel,
	hookableMethods,
	getLongestNameLength,
	updateLongestNameLength,
} from './common.js';

const preloadScript = path.resolve(import.meta.dirname, '..', 'preload.mjs');

globalThis[defaultsNamespace] = {
	ignore: undefined,
	shouldHookConsole: false,
	logLevel: process.env.NODE_ENV === 'development' ? logLevels.info : logLevels.warn,
};

let isConsoleHooked = false;
const _console = {};

class MainTimber {
	#timers = new Map();
	#initialOptions;
	#isEnabled;
	#name;
	#prefixColor;

	constructor(options = {}) {
		autoBind(this);

		this.#initialOptions = {...options};
		if (Object.hasOwn(this.#initialOptions, 'logLevel')) {
			this.#initialOptions.logLevel = normalizeLogLevel(this.#initialOptions.logLevel);
		}

		this.#isEnabled = !filteredLoggers || !options.name || filteredLoggers.has(options.name);
		this.#name = options.name ?? '';
		this.#prefixColor = (new Randoma({seed: `${this.#name}x`})).color().hex().toString();

		updateLongestNameLength(this.#name.length);
	}

	get #options() {
		return {
			...this.getDefaults(),
			...this.#initialOptions,
		};
	}

	get #console() {
		return isConsoleHooked ? _console : console;
	}

	#getPrefix() {
		return chalk.hex(this.#prefixColor)(this.#name.padStart(getLongestNameLength()));
	}

	log(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.info) {
			return;
		}

		if (this.#name) {
			arguments_.unshift(this.#getPrefix() + ' ' + chalk.dim('›'));
		}

		if (this.#options.ignore && this.#options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this.#console.log(...arguments_);
	}

	warn(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.warn) {
			return;
		}

		if (this.#name) {
			arguments_.unshift(this.#getPrefix() + ' ' + chalk.yellow('›'));
		}

		if (this.#options.ignore && this.#options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this.#console.warn(...arguments_);
	}

	error(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.error) {
			return;
		}

		if (this.#name) {
			arguments_.unshift(this.#getPrefix() + ' ' + chalk.red('›'));
		}

		if (this.#options.ignore && this.#options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this.#console.error(...arguments_);
	}

	time(label = 'default') {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.info) {
			return;
		}

		this.#timers.set(label, performance.now());
	}

	timeEnd(label = 'default') {
		if (!this.#isEnabled || !this.#timers.has(label)) {
			return;
		}

		const previous = this.#timers.get(label);
		const arguments_ = [`${label}: ${performance.now() - previous}ms`];
		this.#timers.delete(label);

		if (this.#name) {
			arguments_.unshift(this.#getPrefix() + ' ' + chalk.dim('›'));
		}

		if (this.#options.ignore && this.#options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this.#console.log(...arguments_);
	}

	streamLog(stream) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.info) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.log(data);
		});
	}

	streamWarn(stream) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.warn) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.warn(data);
		});
	}

	streamError(stream) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.error) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.error(data);
		});
	}

	create(...arguments_) {
		return new MainTimber(...arguments_);
	}

	getDefaults() {
		return {...globalThis[defaultsNamespace]};
	}

	setDefaults(newDefaults = {}) {
		// We don't want the `name` property being set as a default
		const {name: _, logLevel, ...rest} = newDefaults;

		if (logLevel !== undefined) {
			rest.logLevel = normalizeLogLevel(logLevel);
		}

		Object.assign(globalThis[defaultsNamespace], rest);
	}
}

const mainLogger = new MainTimber({name: 'main'});

const unhookConsoleFunction = (hookThisConsole, shouldHookRenderers) => () => {
	// The two halves are unhooked independently: a call that only asked for the renderers leaves
	// `isConsoleHooked` false, so returning early on it would strand them hooked.
	if (hookThisConsole && isConsoleHooked) {
		isConsoleHooked = false;
		for (const key of hookableMethods) {
			console[key] = _console[key];
			_console[key] = null;
		}
	}

	if (shouldHookRenderers) {
		hookRenderers(false);
	}
};

// Called with no arguments, hooks the main console.
// Pass `{renderer: true}` to also hook renderer consoles.
mainLogger.hookConsole = options => {
	const {main, renderer} = options ?? {main: true, renderer: false};
	const isHookThisConsole = Boolean(main);
	const shouldHookRenderers = Boolean(renderer);

	if (isHookThisConsole) {
		if (isConsoleHooked) {
			return unhookConsoleFunction(isHookThisConsole, shouldHookRenderers);
		}

		isConsoleHooked = true;

		for (const key of hookableMethods) {
			_console[key] = console[key];
			console[key] = mainLogger[key];
		}
	}

	if (shouldHookRenderers) {
		hookRenderers(true);
	}

	return unhookConsoleFunction(isHookThisConsole, shouldHookRenderers);
};

function hookRenderers(flag) {
	globalThis[defaultsNamespace].shouldHookConsole = flag;
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		browserWindow.webContents.send(updateChannel, flag);
	}
}

// Set up IPC handlers for renderer process logs
const rendererLogger = new MainTimber({name: 'renderer'});

if (ipcMain.listenerCount(logChannel) === 0) {
	ipcMain.on(logChannel, (event, data) => {
		rendererLogger.log(...data);
	});
}

if (ipcMain.listenerCount(warnChannel) === 0) {
	ipcMain.on(warnChannel, (event, data) => {
		rendererLogger.warn(...data);
	});
}

if (ipcMain.listenerCount(errorChannel) === 0) {
	ipcMain.on(errorChannel, (event, data) => {
		rendererLogger.error(...data);
	});
}

// Handle defaults requests from the preload script
// eslint-disable-next-line unicorn/no-top-level-side-effects -- IPC registration must run on import.
ipcMain.handle(defaultsRequestChannel, () => globalThis[defaultsNamespace]);

// Update setDefaults to notify renderers
const originalSetDefaults = mainLogger.setDefaults;
mainLogger.setDefaults = function (newDefaults = {}) {
	originalSetDefaults.call(this, newDefaults);

	// Notify all renderer processes of defaults change
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		browserWindow.webContents.send(defaultsUpdatedChannel, globalThis[defaultsNamespace]);
	}
};

// Register the preload script for all windows.
// `registerPreloadScript` replaced the deprecated `session.setPreloads`/`getPreloads`.
// eslint-disable-next-line unicorn/no-top-level-side-effects, unicorn/prefer-top-level-await -- Registration must run on import without blocking the export.
app.whenReady().then(() => {
	const {defaultSession} = session;
	const alreadyRegistered = defaultSession.getPreloadScripts().some(script => script.filePath === preloadScript || script.id === preloadId);
	if (!alreadyRegistered) {
		defaultSession.registerPreloadScript({
			id: preloadId,
			type: 'frame',
			filePath: preloadScript,
		});
	}
});

export default mainLogger;
