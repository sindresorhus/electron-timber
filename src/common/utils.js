'use strict';

const {existsSync} = require('fs');
const {dirname, join, relative, sep} = require('path');
const callsites = require('callsites');
const chalk = require('chalk');

const {text} = require('./constants');

const transports = [
	'console',
];

const utils = {
	_calcMaxLength(accumulator, currentValue, currentIndex, collection) {
		const currentLength = currentValue.length;
		return (currentLength > accumulator) ? currentLength : accumulator;
	},

	_findCaller() {
		for (const caller of callsites()) {
			const filename = caller.getFileName();
			if (filename !== 'module.js' && /[\\\/]electron-timber[\\\/]/.test(filename) === false) {
				return filename;
			}
		}
	},

	capitalize(txt) {
	    return txt.replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
	},

	contrastRatio(luminanceA, luminanceB, delta = 0.05) {
		// See https://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
		return (luminanceA > luminanceB)
			? ((luminanceA + delta) / (luminanceB + delta))
			: ((luminanceB + delta) / (luminanceA + delta));
	},

	envHas(clFlag) {
		return utils.has(process.env, clFlag);
	},

	getPackageName() {
		let path = utils._findCaller();
		if (!path) {
			return;
		}

		// Search upwards until a `package.json` is found.
		let pkgName;
		while (path && !pkgName) {
			path = dirname(path);
			const packageJsonPath = join(path, 'package.json');
			if (existsSync(packageJsonPath)) {
				pkgName = require(packageJsonPath).name;
			}
		}

		return pkgName;
	},

	getTransports(basePath) {
		const map = {};
		const relBasePath = relative(__dirname, basePath);
		transports.forEach(transport => {
			const modulePath = '.' + sep + join(relBasePath, 'transports', transport);
			const transportModule = require(modulePath);
			map[transportModule.type] = transportModule;
		});
		return map;
	},

	has(object, key) {
		return {}.hasOwnProperty.call(object, key);
	},

	hasMethod(object, method) {
		return typeof object[method] === 'function';
	},

	/**
	 * @summary Converts an hexadecimal color to RGB components.
	 * @param   {String} hex The full hexadecimal color (inc. leading shebang) to convert.
	 * @return  {Object}     The object with the caculated RGB components.
	 * @author  Tim Down <https://stackoverflow.com/questions/5623838/#answer-5624139>
	 */
	hexToRgb(hex) {
		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	},

	/**
	 * @summary Checks if `v` is an array (`true`) or not (`false`).
	 * @param   {Any}     v The value to check.
	 * @return  {Boolean}   `true` if array; `false` otherwise.
	 */
	isArray(v) {
		return Object.prototype.toString.call(v) === '[object Array]';
	},

	isNil(v) {
		return v === undefined || v === null;
	},

	/**
	 * @summary Checks if `v` is an object (`true`) or not (`false`).
	 * @param   {Any}     v The value to check.
	 * @return  {Boolean}   `true` if object; `false` otherwise.
	 */
	isObject(v) {
		return Object.prototype.toString.call(v) === '[object Object]';
	},

	/**
	 * @summary Checks if `v` is a string (`true`) or not (`false`).
	 * @param   {Any}     v The value to check.
	 * @return  {Boolean}   `true` if string; `false` otherwise.
	 */
	isString(v) {
		return (typeof v === 'string');
	},

	/**
	 * @summary Calculates the grayscale representation of luminance for `hexColor`.
	 * @param   {String} hexColor The full hexadecimal color (inc. leading shebang).
	 * @return  {Number}          The grayscale representation of luminance.
	 * @author  kirilloid <https://stackoverflow.com/questions/9733288/#answer-9733420>
	 */
	luminance(hexColor) {
		const color = utils.hexToRgb(hexColor);
		var l = [color.r, color.g, color.b].map((v) => {
			v /= 255;
			return v <= 0.03928  ? v / 12.92 : Math.pow( (v + 0.055) / 1.055, 2.4 );
		});
		return l[0] * 0.2126 + l[1] * 0.7152 + l[2] * 0.0722;
	},

	mapEnvCsvVar(clFlag, defaults = []) {
		return new Map(utils.envHas(clFlag) ? process.env[clFlag].split(',') : defaults);
	},

	matchAll(haystack, needle, flags = 'g') {
		let match;
		const matches = new Array();
		const rgx = new RegExp(needle, flags);
		while (match = rgx.exec(haystack)) {
			matches.push(match);
		}
		return matches;
	},

	oneOf(allowed, value) {
		return allowed.some(valid => (valid === value));
	},

	/**
	 * @summary Lightens `hexColor` the specified `percent` if positive; otherwise darkens it.
	 * @param   {String} color   Hexadecimal color to shade (light/darken) with '#' prepended.
	 * @param   {Float}  percent Percentage between -1 (darken) and 1 (lighten).
	 * @return  {String}         The shaded color.
	 * @author  Pimp Trizkit <https://stackoverflow.com/questions/5560248/#answer-13542669> (v2-hex);
	 */
	shadeColor(hexColor, percent) {
	    const f = parseInt(hexColor.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
	    return '#'+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
	},

	stringify(item, prettify = false, pads = '') {
		const type = Object.prototype.toString.call(item);
		switch (type) {
			case '[object Array]':
			case '[object Object]': {
				const isObject = (type === '[object Object]');
				let keys = Object.keys(item);
				if (isObject) {
					keys.sort();
				}

				let v = '';
				if (keys.length === 0) {
					v = isObject ? '{}' : '[]';
					return prettify ? chalk.gray(v) : v;
				}

				const maxLength = keys.reduce(utils._calcMaxLength, 0) + 1;
				let [opening, ending] = isObject ? ['{', '}'] : ['[', ']'];
				if (pads) {
					ending = pads + ending;
				}

				const childPads = pads + text.blank.repeat(maxLength) + text.blank + text.indent;
				keys.forEach(key => {
					const paddedKey = pads + text.indent + `${key}:`.padStart(maxLength);
					v += (prettify ? chalk.gray(paddedKey) : paddedKey) + text.blank
						+ utils.stringify(item[key], prettify, childPads) + text.lf;
				});

				return prettify
					? (chalk.gray(opening) + text.lf + v + chalk.gray(ending))
					: (opening + text.lf + v + ending);
			}

			case '[object Boolean]': {
				return prettify ? chalk.cyan(`${item}`) : `${item}`;
			}

			// NaN, integer, float
			case '[object Number]': {
				return prettify ? chalk.blue(`${item}`) : `${item}`;
			}

			case '[object String]': {
				return prettify ? chalk.green(`${item}`) : `${item}`;
			}

			case '[object Null]':
			case '[object Undefined]': {
				return prettify ? chalk.yellow(`${item}`) : `${item}`;
			}

			// TODO [object Date], [object Error], [object Function], [object Map], [object Promise]
			// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
		}
	},

	/**
	 * Adapts a (captured) message from the browser console to be printed to the
	 * main console (which uses `chalk`). Since it could contain any custom CSS, we
	 * will strip every present custom CSS, since transforming every possible,
	 * custom, random CSS into chalk styles is a titanic, unfeasible work!
	 *
	 * @param [Any[]] args The browser console args.
	 * NOTE: Mutates `args`.
	 */
	stripCSS(args) {
		const numArgs = args.length - 1;

		if (numArgs < 1) {
			return;
		}

		for (let i = numArgs; i > 0; i -= 1) {
			if (utils.isString(args[i]) && args[i].endsWith(';')) {
				args.splice(i, 1);
			}
		}

		if (numArgs > args.length - 1) {
			args[0] = args[0].replace(/%[oOdisfc]/g, '');
		}

		return args;
	},
};

module.exports = utils;
