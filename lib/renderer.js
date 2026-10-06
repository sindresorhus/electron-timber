import {
	logChannel,
	warnChannel,
	errorChannel,
	updateChannel,
	defaultsUpdatedChannel,
	defaultsNamespace,
	bridgeNamespace,
	filteredLoggers,
	logLevels,
	normalizeLogLevel,
	hookableMethods,
} from './common.js';

// The renderer is loaded as plain ESM in the browser, so it cannot use bare
// specifiers (`electron`) or Node.js-only modules. All main-process
// communication goes through the bridge exposed by `preload.cjs`.
const getBridge = () => globalThis[bridgeNamespace];

function sendToMain(channel, data) {
	try {
		getBridge()?.send(channel, data);
	} catch {}
}

function onFromMain(channel, callback) {
	try {
		getBridge()?.on(channel, callback);
	} catch {}
}

let isConsoleHooked = false;
const _console = {};

// Streams are split manually so the renderer stays free of Node.js-only
// dependencies. Works with Node.js streams (when `nodeIntegration` is
// enabled) and Web streams.
function streamLines(stream, logMethod) {
	if (typeof stream?.on === 'function') {
		if (typeof stream.setEncoding === 'function') {
			stream.setEncoding('utf8');
		}

		let buffer = '';
		stream.on('data', chunk => {
			buffer += chunk;
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				logMethod(line);
			}
		});
		stream.on('end', () => {
			if (buffer) {
				logMethod(buffer);
			}
		});
		return;
	}

	if (typeof stream?.getReader === 'function') {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		const read = async () => {
			const {done, value} = await reader.read();
			buffer += typeof value === 'string' ? value : decoder.decode(value, {stream: !done});
			const lines = buffer.split('\n');
			buffer = done ? '' : (lines.pop() ?? '');
			for (const line of (done ? [...lines, buffer].filter(Boolean) : lines)) {
				logMethod(line);
			}

			if (!done) {
				await read();
			}
		};

		read();
		return;
	}

	throw new TypeError('Expected a Node.js Readable or a Web ReadableStream');
}

class RendererTimber {
	#timers = new Map();
	#initialOptions;
	#isEnabled;

	constructor(options = {}) {
		this.#initialOptions = {...options};
		if (Object.hasOwn(this.#initialOptions, 'logLevel')) {
			this.#initialOptions.logLevel = normalizeLogLevel(this.#initialOptions.logLevel);
		}

		this.#isEnabled = !filteredLoggers || !options.name || filteredLoggers.has(options.name);

		// Bind methods so they can be destructured: `const {log} = logger;`
		for (const method of ['log', 'warn', 'error', 'time', 'timeEnd', 'streamLog', 'streamWarn', 'streamError', 'create', 'getDefaults', 'setDefaults']) {
			this[method] = this[method].bind(this);
		}
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

	log(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.info) {
			return;
		}

		sendToMain(logChannel, arguments_);

		if (this.#options.ignore && this.#options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this.#console.log(...arguments_);
	}

	warn(...arguments_) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.warn) {
			return;
		}

		// Electron security warnings are only meant for the DevTools console, so they are not sent to the terminal. Electron 44 and earlier log them with `console.warn`. Later versions log them natively, bypassing `console`.
		const isElectronSecurityWarning = typeof arguments_[0] === 'string' && arguments_[0].startsWith('%cElectron Security Warning');
		if (!isElectronSecurityWarning) {
			sendToMain(warnChannel, arguments_);
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

		sendToMain(errorChannel, arguments_);

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

		sendToMain(logChannel, arguments_);

		if (this.#options.ignore && this.#options.ignore.test(arguments_.join(' '))) {
			return;
		}

		this.#console.log(...arguments_);
	}

	streamLog(stream) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.info) {
			return;
		}

		streamLines(stream, line => {
			this.log(line);
		});
	}

	streamWarn(stream) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.warn) {
			return;
		}

		streamLines(stream, line => {
			this.warn(line);
		});
	}

	streamError(stream) {
		if (!this.#isEnabled || this.#options.logLevel > logLevels.error) {
			return;
		}

		streamLines(stream, line => {
			this.error(line);
		});
	}

	create(...arguments_) {
		return new RendererTimber(...arguments_);
	}

	getDefaults() {
		// Set by the preload script before renderer code runs
		const defaults = globalThis[defaultsNamespace];
		if (defaults) {
			return {...defaults};
		}

		return {
			ignore: undefined,
			shouldHookConsole: false,
			logLevel: logLevels.info,
			timestamp: false,
		};
	}

	setDefaults() {
		throw new Error('setDefaults can only be called from the main process');
	}
}

const rendererLogger = new RendererTimber();

const unhookConsoleFunction = () => {
	if (!isConsoleHooked) {
		return;
	}

	isConsoleHooked = false;
	for (const key of hookableMethods) {
		console[key] = _console[key];
		_console[key] = null;
	}
};

// Called with no arguments, hooks the renderer console.
rendererLogger.hookConsole = options => {
	const {renderer} = options ?? {renderer: true};
	if (!renderer || isConsoleHooked) {
		return unhookConsoleFunction;
	}

	isConsoleHooked = true;

	for (const key of hookableMethods) {
		_console[key] = console[key];
		console[key] = rendererLogger[key];
	}

	return unhookConsoleFunction;
};

// Listen for console hook updates from the main process via the preload bridge.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- Bridge listeners must be registered on import.
onFromMain(updateChannel, flag => {
	if (flag) {
		rendererLogger.hookConsole();
	} else {
		unhookConsoleFunction();
	}
});

// Keep defaults in sync when `setDefaults()` is called in the main process.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- Bridge listeners must be registered on import.
onFromMain(defaultsUpdatedChannel, newDefaults => {
	globalThis[defaultsNamespace] = newDefaults;
});

// Hook automatically when the window was created after
// `hookConsole({renderer: true})` was called in the main process.
try {
	if (rendererLogger.getDefaults().shouldHookConsole) {
		rendererLogger.hookConsole();
	}
} catch {}

export default rendererLogger;
