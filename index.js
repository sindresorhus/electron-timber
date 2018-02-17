'use strict';
const electron = require('electron');
const {is} = require('electron-util');
const chalk = require('chalk');
const split = require('split2');
const Randoma = require('randoma');

// TODO: use require('perf_hooks') in main process when electron 2.0 comes out (needs node > 8.5.0)
const now = () => global.performance ? global.performance.now() : Date.now();
const logChannel = '__ELECTRON_TIMBER_LOG__';
const warnChannel = '__ELECTRON_TIMBER_WARN__';
const errorChannel = '__ELECTRON_TIMBER_ERROR__';
const filteredLoggers = process.env.TIMBER_LOGGERS && new Set(process.env.TIMBER_LOGGERS.split(','));

let longestNameLength = 0;

class Timber {
	constructor(options = {}) {
		this._options = options;
		this.isEnabled = filteredLoggers && options.name ? filteredLoggers.has(options.name) : true;
		this.name = options.name || '';
		this._prefixColor = (new Randoma({seed: `${this.name}x`})).color().hex().toString();
		this._timers = new Map();

		if (this.name.length > longestNameLength) {
			longestNameLength = this.name.length;
		}
	}

	_getPrefix() {
		return chalk.hex(this._prefixColor)(this.name.padStart(longestNameLength));
	}

	log(...args) {
		if (!this.isEnabled) {
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

		console.log(...args);
	}

	warn(...args) {
		if (!this.isEnabled) {
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

		console.warn(...args);
	}

	error(...args) {
		if (!this.isEnabled) {
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

		console.error(...args);
	}

	time(label = 'default') {
		if (!this.isEnabled) {
			return;
		}

		this._timers.set(label, now());
	}

	timeEnd(label = 'default') {
		if (!this.isEnabled) {
			return;
		}

		if (this._timers.has(label)) {
			const prev = this._timers.get(label);
			const args = [label + ': ' + (now() - prev) + 'ms'];
			this._timers.delete(label);

			if (is.renderer) {
				electron.ipcRenderer.send(logChannel, args);
			} else if (this.name) {
				args.unshift(this._getPrefix() + ' ' + chalk.dim('›'));
			}

			if (this._options.ignore && this._options.ignore.test(args.join(' '))) {
				return;
			}

			console.log(...args);
		}
	}

	streamLog(stream) {
		if (!this.isEnabled) {
			return;
		}

		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.log(data);
		});
	}

	streamError(stream) {
		if (!this.isEnabled) {
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
}

module.exports = new Timber({
	name: is.main ? 'main' : null
});

if (is.main) {
	const rendererLogger = new Timber({name: 'renderer'});
	electron.ipcMain.on(logChannel, (event, data) => {
		rendererLogger.log(...data);
	});
	electron.ipcMain.on(warnChannel, (event, data) => {
		rendererLogger.warn(...data);
	});
	electron.ipcMain.on(errorChannel, (event, data) => {
		rendererLogger.error(...data);
	});
}
