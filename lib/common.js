// This module is imported by both the main process (Node.js) and renderers
// (plain ESM in the browser), so it must not use any Node.js-only imports.
// Use `globalThis.process` instead of `import process from 'node:process'`.

export const logChannel = '__ELECTRON_TIMBER_LOG__';
export const warnChannel = '__ELECTRON_TIMBER_WARN__';
export const errorChannel = '__ELECTRON_TIMBER_ERROR__';
// `updateChannel`, `defaultsRequestChannel`, `defaultsUpdatedChannel`, `defaultsNamespace`, and `bridgeNamespace` are duplicated in `preload.cjs`, which cannot import this file.
export const updateChannel = '__ELECTRON_TIMBER_UPDATE__';
export const defaultsRequestChannel = 'timber-get-defaults';
export const defaultsUpdatedChannel = 'timber-defaults-updated';
export const defaultsNamespace = '__ELECTRON_TIMBER_DEFAULTS__';
export const bridgeNamespace = '__ELECTRON_TIMBER_BRIDGE__';
export const preloadId = 'electron-timber';

// eslint-disable-next-line n/prefer-global/process -- `lib/common.js` must stay import-free so renderers can load it as plain browser ESM.
const timberLoggers = globalThis.process?.env?.TIMBER_LOGGERS;
export const filteredLoggers = timberLoggers ? new Set(timberLoggers.split(',')) : undefined;

export const logLevels = {
	info: 0,
	warn: 1,
	error: 2,
};

export function normalizeLogLevel(level) {
	return typeof level === 'string' ? logLevels[level] ?? logLevels.warn : level;
}

export const hookableMethods = [
	'log',
	'warn',
	'error',
	'time',
	'timeEnd',
];

let longestNameLength = 0;

export function updateLongestNameLength(length) {
	if (length > longestNameLength) {
		longestNameLength = length;
	}
}

export function getLongestNameLength() {
	return longestNameLength;
}
