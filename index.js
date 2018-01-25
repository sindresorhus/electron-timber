'use strict';
const electron = require('electron');
const {is} = require('electron-util');
const chalk = require('chalk');
const split = require('split2');
const Randoma = require('randoma');

const logChannel = '__ELECTRON_TIMBER_LOG__';
const errorChannel = '__ELECTRON_TIMBER_ERROR__';

let longestPrefixLength = 0;

class Timber {
	constructor(options = {}) {
		this._options = options;

		this._prefix = options.prefix || '';
		this._prefixColor = (new Randoma({seed: `${this._prefix}x`})).color().hex().toString();

		if (this._prefix.length > longestPrefixLength) {
			longestPrefixLength = this._prefix.length;
		}
	}

	_getPrefix() {
		return chalk.hex(this._prefixColor)(this._prefix.padStart(longestPrefixLength));
	}

	log(...args) {
		if (is.renderer) {
			electron.ipcRenderer.send(logChannel, args);
		} else if (this._prefix) {
			args.unshift(this._getPrefix() + ' ' + chalk.dim('›'));
		}

		if (this._options.ignore && this._options.ignore.test(args.join(' '))) {
			return;
		}

		console.log(...args);
	}

	error(...args) {
		if (is.renderer) {
			electron.ipcRenderer.send(errorChannel, args);
		} else if (this._prefix) {
			args.unshift(this._getPrefix() + ' ' + chalk.red('›'));
		}

		if (this._options.ignore && this._options.ignore.test(args.join(' '))) {
			return;
		}

		console.error(...args);
	}

	streamLog(stream) {
		stream.setEncoding('utf8');
		stream.pipe(split()).on('data', data => {
			this.log(data);
		});
	}

	streamError(stream) {
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
	prefix: is.main ? 'main' : null
});

if (is.main) {
	const rendererLogger = new Timber({prefix: 'renderer'});
	electron.ipcMain.on(logChannel, (event, data) => {
		rendererLogger.log(...data);
	});
	electron.ipcMain.on(errorChannel, (event, data) => {
		rendererLogger.error(...data);
	});
}
