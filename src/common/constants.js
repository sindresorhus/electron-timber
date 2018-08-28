'use strict';

const blank = ' ';
const prefix = '__ELECTRON_TIMBER_';
const buildChannel = topic => `${prefix}${topic}__`;

module.exports = {
	appProjectFile: 'package.json',
	channel: {
		_prefix: prefix,

		// Used to collect messages on console at both sides, main/renderer.
		collector: buildChannel('COLLECTOR'),

		// Used to request & send the configuration from a logger instance.
		// When the instance is at renderer side, it gets appended with the
		// logger name and renderer ID.
		config: buildChannel('LOGGER_CONFIG'),

		// Used to allow setting new defaults from renderer loggers.
		defaults: buildChannel('DEFAULTS'),

		// Used by BrowserWindows that get closed to notify `timber [main]` that
		// it should remove all logger IDs binded to those windows from the
		// internal registry (`AbstractTimberLogger._loggers`).
		removeRendererLogger: buildChannel('REMOVE_RENDERER_LOGGER'),

		// Used by a logger with a given `name` to broadcast the new levels to
		// all the other logger instances with the same `name`.
		setLevels: buildChannel('SET_LEVELS'),

		// Used by any main logger that changes somethings that must be notified
		// to all existent logger(s), urging them to rebuild their stuff due to some
		// change in defaults, max (logger) name length, levels, colors, collector...
		update: buildChannel('UPDATE'),

		// Same as `channel.update`, but used to notify renderer loggers in
		// chromium devTools/extensions, because they don't have a browserWindow
		// ID to fetch it.
		updateExtensions: buildChannel('UPDATE_EXTENSIONS')
	},
	css: {
		dim: 'color:#696969;',
		placeholder: '%c',
		reset: 'color:#000000;'
	},
	defaults: {
		levels: {
			error: {color: '#FF0000', priority: 0},
			warn: {color: '#FFFF00', priority: 1},
			info: {color: '#0000FF', priority: 2},
			verbose: {color: '#FF00FF', priority: 3},
			debug: {color: '#008000', priority: 4},
			silly: {color: '#808080', priority: 5}
		},
		logger: 'timber',
		nameSpace: '__ELECTRON_TIMBER_DEFAULTS__',
		timer: {
			label: 'default',
			logLevel: 'info'
		}
	},
	env: {
		TIMBER_LOGGERS: 'TIMBER_LOGGERS'
	},
	hookableMethods: ['log', 'warn', 'error', 'time', 'timeEnd'],
	noop() {},
	padBwIdDigits: 2,
	side: {
		MAIN: 'main',
		RENDERER: 'renderer'
	},
	text: {
		blank,
		indent: blank.repeat(2),
		lf: '\n'
	}
};
