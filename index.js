'use strict';
const electron = require('electron');
const {is} = require('electron-util');
const chalk = require('chalk');
const split = require('split2');
const Randoma = require('randoma');

const logChannel = '__ELECTRON_TIMBER_LOG__';
const errorChannel = '__ELECTRON_TIMBER_ERROR__';
const filteredLoggers = process.env.TIMBER_LOGGERS && new Set(process.env.TIMBER_LOGGERS.split(','));

let longestNameLength = 0;

class Timber {
	constructor(options = {}) {
		this._options = options;
		this.isEnabled = filteredLoggers && options.name ? filteredLoggers.has(options.name) : true;
		this.name = options.name || '';
		this._prefixColor = (new Randoma({seed: `${this.name}x`})).color().hex().toString();

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
	electron.ipcMain.on(errorChannel, (event, data) => {
		rendererLogger.error(...data);
	});
}
