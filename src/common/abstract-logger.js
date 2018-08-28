'use strict';

const {performance} = global.performance ? global : require('perf_hooks');
const {is} = require('electron-util');
const autoBind = require('auto-bind');
const chalk = require('chalk');
const Randoma = require('randoma');
const split = require('split2');

const {css, defaults, env, hookableMethods, noop, side, text} = require('./constants');
const {capitalize, contrastRatio, getPackageName, getTransports, has, hasMethod, isNil, isObject,
	isString, luminance, mapEnvCsvVar, shadeColor, stringify, stripCSS} = require('./utils');

const ignoreLoggers = mapEnvCsvVar(env.TIMBER_LOGGERS);

// This class is loaded ALWAYS on both, main/renderer, and `timber [main]` is
// ALWAYS created first, so we can make this check here and init defaults only once.
if (is.main && !has(global, defaults.nameSpace)) {
	const defLevels = defaults.levels;
	global[defaults.nameSpace] = {
		collector: 'main', // Allowed: false|main|renderer|ID
		devToolsDarkTheme: false, // Allowed: boolean
		ignore: [], // Allowed: string[]
		logLevel: is.development ? defLevels.info.priority : defLevels.warn.priority,
		muteElectronInspector: false, // Allowed: boolean|non-negative int (priority)
		prettify: 'context', // Allowed: all|context|none
		separator: '›', // Any custom string
		shouldHookConsole: false, // Allowed: boolean
		timestamp: false, // Allowed: false|iso|time
		transports: ['console'] // Allowed: Array<string|object>
	};
}

// Only default logger (`timber`) can capture the native console.
function toggleHook(capture = false) {
	const consoleTransport = this._transports.find(t => (t.type === 'console'));
	const backup = consoleTransport.getNativeConsoleBackup();
	const randomMethod = hookableMethods[0];

	if (capture) { // Enable ~> replace native console methods.
		// WARNING Do not avoid overwriting the methods here, because on any
		//   update (triggered by a new max name length, new defaults or new
		//   levels), the log helpers may be recreated, and the hooked methods
		//   become obsolete and need to point to the new methods.
		hookableMethods.forEach(fn => {
			console[fn] = (...args) => {
				if (this._is.renderer) {
					stripCSS(args);
				}
				this[fn](...args);
			};
		});
	} else { // Disable ~> restore native console methods.
		if (console[randomMethod] === backup[randomMethod]) {
			return; // Already unhooked (native ones).
		}
		Object.keys(backup).forEach(fn => {
			console[fn] = backup[fn];
		});
	}
}

class AbstractTimberLogger {
	/**
	* @param {Object} options            The logger options.
	* @param {String} [options.name]     The logger name. Defaults to package name.
	* @param {String} [options.logLevel] The maximum log level of messages that will be logged.
	* @param {String} loggerSide         The logger side: "main" or "renderer".
	* @param {String} loggerPath         The path to the child class (`TimberMain` or `TimberRenderer`).
	*/
	constructor(options, loggerSide, loggerPath) {
		if (this.constructor === AbstractTimberLogger) {
			throw new Error('Can\'t instantiate abstract class `AbstractTimberLogger`!');
		}

		this._initOnce();

		this.name = options.name || getPackageName();
		if (!this.name) {
			throw new Error('You must provide a name for your logger!');
		}

		// Pre-cache some widely used flags.
		this._is = {
			defaultLogger: options.name === defaults.logger,
			enabled: !ignoreLoggers.has(options.name),
			renderer: loggerSide === side.RENDERER
		};

		autoBind(this);

		this._loggerPath = loggerPath;
		this._side = loggerSide;
		this._timers = new Map();

		// Purge global options from logger options before saving them.
		// NOTE: The only allowed is `logLevel`.
		[
			'collector',
			'devToolsDarkTheme',
			'ignore',
			'muteElectronInspector',
			'prettify',
			'separator',
			'shouldHookConsole',
			'timestamp',
			'transports'
		].forEach(opt => delete options[opt]);

		this._initialOptions = Object.assign({}, options);
		this._mapLogLevelToPriority(options);

		// Inherit options from existing loggers with same name.
		let shared = this._getSharedSettings();
		const {maxNameLength} = shared;
		if (!shared.options) {
			shared = null;
		}

		// Calc final options, config transports/levels.
		this._computeOptions(shared && shared.options);
		this._setTransports();
		if (shared) {
			this._setLevels(shared.levels, shared, false);
		} else {
			this._setLevels(undefined, undefined, false);
		}

		// Update max logger name length (when apply) before checking
		// to avoid triggering unneccessary contexts regeneration(s).
		if (maxNameLength > AbstractTimberLogger._maxNameLength) {
			AbstractTimberLogger._maxNameLength = maxNameLength;
		}
		this._checkNameLength(true);

		this._init();
		this._bindLevelHelpers();

		if (this._is.defaultLogger) {
			// Configure stuff specific to `timber [main/renderer]`.
			this._toggleHook = toggleHook.bind(this);
			this._toggleHook(this._options.shouldHookConsole);
			// TODO this._catchUnhandledExceptions();
		}
	}

	/**
	 * @todo Create global setting to enable/disable.
	 * @todo Check https://github.com/sindresorhus/electron-unhandled to see how Sindre Sorhus handle it.
	 * @see {@link https://www.npmjs.com/package/pretty-exceptions|pretty-exceptions}
	 * @see {@link https://www.npmjs.com/package/pretty-error|pretty-error}
	 * @see {@link https://github.com/sindresorhus/electron-unhandled|electron-unhandled}
	 */
	/*
	_catchUnhandledExceptions() {
		process.on('uncaughtException', function (error) {
			console.log('AQUI UNCAUGHT EXCEPTION:', error);
			console.log(Object.keys(error));
			process.exit(1);
		});
	}
	*/

	/**
	 * @summary Dynamically creates helper methods for each log level (inc. streams and timers).
	 */
	_bindLevelHelpers() {
		const {ignore, logLevel, prettify} = this._options;

		const composeArgs = (messageLevel, shouldPrettify, cache, args) => {
			if (shouldPrettify) {
				cache.pretty = this._transformPretty(messageLevel, args);
				return cache.pretty;
			}

			cache.plain = this._transformPlain(messageLevel, args);
			return cache.plain;
		};

		const logTransports = (messageLevel, args) => {
			const cache = {};
			this._transports.forEach(t => {
				const shouldPrettify = t.supportsPrettify && prettify !== 'none';
				const finalArgs = cache[shouldPrettify ? 'pretty' : 'plain'] ||
					composeArgs(messageLevel, shouldPrettify, cache, args);
				t.report(messageLevel, finalArgs);
			});
		};

		const streamLogTransports = (messageLevel, stream) => {
			const cache = {};
			stream.setEncoding('utf8');

			stream.pipe(split()).on('data', (...data) => {
				if (!this._shouldLog(data)) {
					return;
				}
				this._transports.forEach(t => {
					const shouldPrettify = t.supportsPrettify && prettify !== 'none';
					const finalData = cache[shouldPrettify ? 'pretty' : 'plain'] ||
						composeArgs(messageLevel, shouldPrettify, cache, data);
					t.report(messageLevel, finalData);
				});
			});
		};

		Object.keys(this._priority).forEach(level => {
			if (level === 'log') {
				return;
			}

			const messageLevel = this._priority[level];
			let helper;
			let streamHelper;

			// Logger disabled, do nothing!
			if (!this._is.enabled || messageLevel > logLevel) {
				[helper, streamHelper] = [noop, noop];
			// Considering patterns to ignore messages from being logged.
			} else if (ignore.length > 0) {
				helper = (...args) => {
					if (this._shouldLog(args)) {
						logTransports(messageLevel, args);
					}
				};
				streamHelper = stream => {
					streamLogTransports(messageLevel, stream);
				};
			// No patterns to ignore, so each transport can report directly.
			} else {
				helper = (...args) => {
					logTransports(messageLevel, args);
				};
				streamHelper = stream => {
					streamLogTransports(messageLevel, stream);
				};
			}

			this[level] = helper;
			this[`stream${capitalize(level)}`] = streamHelper;

			// Create `log` alias for `info` for backwards compatibility.
			if (level === 'info') {
				this.log = helper;
				this.streamLog = streamHelper;
			}
		});

		// Timing helper.
		const timerPriority = this._priority[defaults.timer.logLevel];
		if (!this._is.enabled || timerPriority > logLevel) {
			[this.time, this.timeEnd] = [noop, noop]; // Logger disabled, do nothing!
		} else {
			this.time = (label = defaults.timerLabel) => this._timers.set(label, performance.now());
			this.timeEnd = (label = defaults.timer.label) => {
				if (this._is.enabled && this._timers.has(label)) {
					const prev = this._timers.get(label);
					const args = [`${label}: ${performance.now() - prev}ms`];
					this._timers.delete(label);
					logTransports(timerPriority, args);
				}
			};
		}
	}

	/**
	 * @summary Builds the logger context for both sides (main/renderer).
	 * @param   {Number} newMaxLength The maximum length of all (registered) logger names.
	 */
	_buildContexts(newMaxLength) {
		// Update max name length when provided.
		if (!isNil(newMaxLength)) {
			AbstractTimberLogger._maxNameLength = newMaxLength;
		}

		// Re-compute options with (possibly new) re-fetched global defaults.
		this._computeOptions();

		this._calcPads();
		const {name, _id: id, _pads: pads, _side} = this;
		const {devToolsDarkTheme: darkTheme} = this._options;
		const sideContext = _side + ((this._is.renderer && id) ? ` ${id}` : '');

		// `plain` styles for `prettify="none"`.
		const context = `${pads.left}${name} [${sideContext}]${pads.right}`;
		this._context = {
			plain: {
				main: [context],
				renderer: [context]
			}
		};

		// `pretty` only covers `prettify="context"`, since the separator (and
		// optionally the message) colorize based on the message log level,
		// which is not available at this point.
		const ph = css.placeholder;
		const cssBrackets = `color:#${darkTheme ? 'FFFFFF' : '000000'};`;
		this._context.pretty = {
			// This one prints to terminal output (main process), so we use `chalk` to colorize text.
			main: [`${pads.left}${this._chalkStyle.logger(name)} [${this._chalkStyle.main(sideContext)}]${pads.right}`],
			// This another prints to browser console (renderer process), so we rely on CSS to colorize text.
			renderer: [`${pads.left}${ph}${name}${ph} [${ph}${sideContext}${ph}]${pads.right}`].concat(
				[`color:${this._color.logger};`, cssBrackets, `color:${this._color[_side]};`, cssBrackets])
		};

		// Leading blanks get stripped automatically when printed to a browser console.
		// Hackity hack: replace the first blank with an invisible Unicode character!
		['plain', 'pretty'].forEach(type => {
			if (this._context[type].renderer[0][0] === text.blank) {
				this._context[type].renderer[0] = '\u00A0' + this._context[type].renderer[0].substr(1);
			}
		});
	}

	/**
	 * @summary Computes the logger options by merging data of multiple sources (like `defaults`).
	 * @param   {Object} [shared] The options to share (from another existent logger instance).
	 */
	_computeOptions(shared) {
		// Map `ignore` pattern(s) into RegExps.
		const globalDefaults = this.getDefaults();
		const regexps = {ignore: []};
		globalDefaults.ignore.forEach(pattern => {
			regexps.ignore.push(new RegExp(pattern));
		});

		// Merge all!
		this._options = Object.assign({}, globalDefaults, regexps, shared || {}, this._initialOptions);
	}

	/**
	 * @summary Ensures a log level name exists and maps it to its priority.
	 * @param   {Object} options The logger options.
	 * NOTE: Mutate `options`.
	 */
	_mapLogLevelToPriority(options) {
		if (!Reflect.has(options, 'logLevel')) {
			return;
		}

		// Ensure that the requested minimum log level exists!
		if (isNil(this._priority[options.logLevel])) {
			throw new Error(`Unknown log level "${options.logLevel}"`);
		}
		options.logLevel = this._priority[options.logLevel];
	}

	/**
	 * @summary Prepends a timestamp to the logged message.
	 * @param   {Boolean|String} mode Falsy value if none; 'iso' or 'time' otherwise.
	 * @param   {Object}         args The args being prettified.
	 * @param   {Boolean}        [shouldPrettify=false] Whether prettify the timestamp (`true`) or not.
	 * NOTE: mutates `args`.
	 */
	_prependTimestamp(mode, args, shouldPrettify = false) {
		// Prepend timestamp on demand. Exclude console transport on renderer processes, since
		// the user can activate 'Show timestamps' on 'Console settings' inside devTools.
		let ts;
		switch (mode) {
			case 'iso': {
				ts = new Date().toISOString();
				break;
			}
			case 'time': {
				ts = new Date().toLocaleTimeString();
				break;
			}
			default:
				throw new Error(`Unsupported value provided for option \`timestamp\`: ${mode}`);
		}
		ts = `[${ts}]`;
		args.main[0] = (shouldPrettify ? chalk.dim(ts) : ts) + text.blank + args.main[0];
	}

	/**
	 * @summary Set new levels for the current logger instance and re-creates its helpers.
	 * @param   {Object}  [levels=defaults.levels] The levels config.
	 * @param   {Object}  [shared=null]            The options shared from another existent instance.
	 * @param   {Boolean} [bindHelpers=true]       Whether to bind the log helpers (`true`) or not.
	 */
	_setLevels(levels = defaults.levels, shared = null, bindHelpers = true) {
		if (!isObject(levels) || Object.keys(levels).length === 0) {
			throw new Error('Invalid value provided to `setLevels()`');
		}

		// Purge previous level stuff (priority, color, style, helper)...
		if (this._priority) {
			Object.keys(this._priority).forEach(levelName => {
				const priority = this._priority[levelName];
				delete this[`stream${capitalize(levelName)}`];
				delete this._color[priority];
				delete this._chalkStyle[priority];
				delete this._priority[levelName];
			});
		} else {
			this._chalkStyle = {};
			this._color = shared ? Object.assign({}, shared.color) : {};
			this._priority = {};
		}

		// Generate colors/styles for [logger + main/renderer] context on main console.
		const privateColors = {
			main: (new Randoma({seed: 'MAIN'})).color().hex().toString(),
			renderer: (new Randoma({seed: 'RENDERER'})).color().hex().toString(),
			logger: (new Randoma({seed: this.name})).color().hex().toString()
		};
		Object.keys(privateColors).forEach(item => {
			this._chalkStyle[item] = chalk.hex(privateColors[item]);
		});
		if (!shared) {
			Object.assign(this._color, privateColors);
		}

		// Save separately the priority, color and chalk transform for each level.
		Object.keys(levels).forEach(levelName => {
			const priority = parseInt(levels[levelName].priority, 10);
			if (isNaN(priority)) {
				throw new TypeError(`Invalid priority provided for log level "${levelName}": ${levels[levelName].priority}`);
			}

			if (!/^#[0-9a-fA-F]{6}$/i.test(levels[levelName].color)) {
				throw new Error(`Invalid color provided for log level "${levelName}": ${levels[levelName].color}`);
			}

			this._priority[levelName] = priority;
			if (levelName === 'info') {
				this._priority.log = this._priority.info; // Alias.
			}

			this._chalkStyle[priority] = chalk.hex(levels[levelName].color);

			// Do not overwrite pre-calc, shared colors (if provided!).
			if (!this._color[priority]) {
				this._color[priority] = levels[levelName].color;
			}
		});

		// `chalk` automatically manages providing a good contrast ratio on main (terminal) console,
		// so we only need to ensure that we have a good contrast ratio on renderer console colors.
		if (!shared) {
			const {devToolsDarkTheme} = this._options;
			const bgColor = devToolsDarkTheme ? '#242424' : '#FFFFFF';
			const bgColorLuminance = luminance(bgColor);
			const deltaPercent = devToolsDarkTheme ? 0.1 : -0.1;
			Object.keys(this._color).forEach(priority => {
				let levelColor = this._color[priority];
				let levelColorLuminance = luminance(levelColor);

				const contrast = {
					current: contrastRatio(bgColorLuminance, levelColorLuminance),
					previous: null
				};
				if (contrast.current >= 4.5) {
					return; // No lighten/darken needed.
				}

				do {
					// Lighten/darken the level color until having a good contrast ratio.
					levelColor = shadeColor(levelColor, deltaPercent);
					levelColorLuminance = luminance(levelColor);
					this._color[priority] = levelColor;
					contrast.previous = contrast.current;
					contrast.current = contrastRatio(levelColorLuminance, bgColorLuminance);
				} while (contrast.current < 4.5 || (contrast.current - contrast.previous) < 0.001);
			});
		}

		if (bindHelpers) {
			this._bindLevelHelpers();
		}

		// Keep an internal reference for sharing purposes.
		this._levels = levels;
	}

	_setTransports() {
		const mapTransport = getTransports(this._loggerPath);
		this._transports = [];
		this._options.transports.forEach(transport => {
			const hasCustomOptions = !isString(transport);
			const opts = hasCustomOptions ? transport : {};
			const type = hasCustomOptions ? opts.type : transport;
			this._transports.push(new mapTransport[type](
				opts,
				this.name,
				this._is.defaultLogger,
				AbstractTimberLogger._id
			));
		});
	}

	/**
	 * @summary Checks if a message should be logged or not based on `ignore` RegExp patterns.
	 * @param   {Any[]}   args The arguments to log.
	 * @return  {Boolean}      Whether the message should be logged (`true`) or not (`false`).
	 * NOTE Not all `args` will be strings, but other types are explicitly excluded from this check.
	 */
	_shouldLog(args) {
		const {ignore} = this._options;

		if (ignore.length > 0) {
			const msg = args.join(text.blank);
			for (const p of ignore) {
				if (p.test(msg)) {
					return false;
				}
			}
		}

		return true;
	}

	_transformPlain(levelPriority, args) {
		const {separator, timestamp} = this._options;

		const plain = {};
		const loggerSide = this._is.renderer ?
			{from: side.RENDERER, to: side.MAIN} :
			{from: side.MAIN, to: side.RENDERER};
		plain[loggerSide.from] = [`${this._context.plain[loggerSide.from][0]} ${separator}`];
		plain[loggerSide.to] = plain[loggerSide.from].slice(0);

		if (timestamp) {
			this._prependTimestamp(timestamp, plain);
		}

		plain.main.push(...args.map(arg => (isString(arg) ? arg : stringify(arg))));
		plain.renderer.push(...args);

		return plain;
	}

	_transformPretty(levelPriority, args) {
		const {prettify, separator, timestamp} = this._options;
		const ph = css.placeholder;

		const pretty = {};
		Object.values(side).forEach(side => {
			pretty[side] = this._context.pretty[side].slice(0);
		});

		if (timestamp) {
			this._prependTimestamp(timestamp, pretty, true);
		}

		// Next is common to both `prettify` modes: 'context' and 'all'.
		pretty.main[0] += ` ${this._chalkStyle[levelPriority](separator)}`;
		pretty.renderer[0] += ph + separator;
		pretty.renderer.push(`color:${this._color[levelPriority]};`);

		// Beware! warn/error levels already colorize the message by themselves on console.
		const hasNoOwnStyles = (levelPriority > this._priority.warn);

		// Specific stuff.
		if (prettify === 'all') {
			pretty.main.push(...args.map(arg => (isString(arg) ?
				this._chalkStyle[levelPriority](arg) :
				stringify(arg, true))));

			if (hasNoOwnStyles) {
				for (const arg of args) {
					if (isString(arg)) {
						pretty.renderer[0] += ` ${arg}`;
					} else {
						pretty.renderer[0] += ' %o';
						pretty.renderer.push(arg);
					}
				}
			} else {
				pretty.renderer.push(...args);
			}
		} else {
			pretty.main.push(...args.map(arg => stringify(arg)));
			pretty.renderer[0] += ph;
			pretty.renderer.push(css.reset, ...args);
		}

		return pretty;
	}

	/**
	 * @summary Updates the logger by rebuilding the necessary stuff.
	 * @param   {Object} needsUpdate   Flags that indicate which stuff must be rebuilt.
	 * @param   {Number} maxNameLength Maximum length of all (registered) logger names.
	 */
	_update(needsUpdate, maxNameLength) {
		this._computeOptions();
		if (needsUpdate.levels) {
			this._setLevels(this._levels, null, false);
		}
		if (needsUpdate.contexts || maxNameLength > AbstractTimberLogger._maxNameLength) {
			this._buildContexts(maxNameLength);
		}
		if (needsUpdate.helpers) {
			this._bindLevelHelpers();
		}
		if (this._is.defaultLogger && hasMethod(this, '_toggleHook') &&
			(needsUpdate.helpers || needsUpdate.shouldHookConsole)
		) {
			this._toggleHook(this._options.shouldHookConsole);
		}
		if (needsUpdate.transports) {
			this._setTransports(this._loggerPath);
		}
		if (needsUpdate.collector) {
			const consoleTransport = this._transports.find(t => (t.type === 'console'));
			consoleTransport._configCollect();
		}
	}

	getLevels() {
		return Object.assign({}, this._priority);
	}
}

/** *************
 * STATIC STUFF *
 * **************/
AbstractTimberLogger._id = null;
AbstractTimberLogger._loggers = new Map();
AbstractTimberLogger._maxNameLength = defaults.logger.length;

module.exports = AbstractTimberLogger;
