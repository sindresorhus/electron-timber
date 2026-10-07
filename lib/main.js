import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {format, stripVTControlCharacters} from 'node:util';
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

const preloadScript = fileURLToPath(new URL('../preload.cjs', import.meta.url));

globalThis[defaultsNamespace] = {
	ignore: undefined,
	shouldHookConsole: false,
	logLevel: process.env.NODE_ENV === 'development' ? logLevels.info : logLevels.warn,
	timestamp: false,
	file: false,
	maxFileSize: 1024 * 1024,
};

let isConsoleHooked = false;
const _console = {};

function appendToFile(file, maxFileSize, text) {
	// Logging must never crash the app, so a failed write only loses the line.
	try {
		const filePath = file === true ? path.join(app.getPath('logs'), 'main.log') : file;
		const size = fs.statSync(filePath, {throwIfNoEntry: false})?.size;
		if (size === undefined) {
			fs.mkdirSync(path.dirname(filePath), {recursive: true});
		} else if (maxFileSize > 0 && size >= maxFileSize) {
			const {dir, name, ext} = path.parse(filePath);
			try {
				fs.renameSync(filePath, path.join(dir, `${name}.old${ext}`));
			} catch {
				// For example, the file is open in another app on Windows. The file then grows past the limit instead of losing the line.
			}
		}

		// Synchronous, so the last lines before a crash are not lost.
		fs.appendFileSync(filePath, text);
	} catch {}
}

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

	#addPrefix(arguments_, separator) {
		const prefix = [
			this.#options.timestamp && chalk.dim(new Date().toTimeString().slice(0, 8)),
			this.#name && `${this.#getPrefix()} ${separator}`,
		].filter(Boolean).join(' ');

		if (prefix) {
			arguments_.unshift(prefix);
		}
	}

	#print(method, separator, arguments_) {
		const options = this.#options;
		const output = [...arguments_];
		this.#addPrefix(output, separator);

		if (options.ignore && options.ignore.test(output.join(' '))) {
			return;
		}

		this.#console[method](...output);

		if (!options.file) {
			return;
		}

		const level = method === 'log' ? 'info' : method;
		const name = this.#name ? `${this.#name} › ` : '';
		const message = stripVTControlCharacters(format(...arguments_));
		appendToFile(options.file, options.maxFileSize, `${new Date().toISOString()} [${level}] ${name}${message}\n`);
	}

	log(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.info) {
			return;
		}

		this.#print('log', chalk.dim('›'), arguments_);
	}

	warn(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.warn) {
			return;
		}

		this.#print('warn', chalk.yellow('›'), arguments_);
	}

	error(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.error) {
			return;
		}

		this.#print('error', chalk.red('›'), arguments_);
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

		this.#print('log', chalk.dim('›'), arguments_);
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

// Handle defaults requests from the preload script. The preload asks synchronously, as it has to be CommonJS without top-level await.
if (ipcMain.listenerCount(defaultsRequestChannel) === 0) {
	ipcMain.on(defaultsRequestChannel, event => {
		event.returnValue = globalThis[defaultsNamespace];
	});
}

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
