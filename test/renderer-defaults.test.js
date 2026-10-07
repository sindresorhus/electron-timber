import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultsNamespace, logLevels} from '../lib/common.js';
import rendererLogger from '../lib/renderer.js';

// With no preload (renderer loaded outside a window electron-timber set up), `getDefaults()` falls back to these. The shape has to match what the preload would have provided, so callers see the same keys either way.
test('renderer defaults match the shape the preload provides', () => {
	assert.deepEqual(rendererLogger.getDefaults(), {
		ignore: undefined,
		shouldHookConsole: false,
		logLevel: logLevels.info,
		timestamp: false,
		file: false,
		maxFileSize: 1024 * 1024,
	});
});

test('renderer defaults set by the preload are read back', () => {
	const defaults = {
		ignore: /debug/v,
		shouldHookConsole: true,
		logLevel: logLevels.error,
		timestamp: true,
	};
	globalThis[defaultsNamespace] = defaults;

	try {
		assert.deepEqual(rendererLogger.getDefaults(), defaults);
	} finally {
		delete globalThis[defaultsNamespace];
	}
});

test('setDefaults is main-process only', () => {
	assert.throws(() => {
		rendererLogger.setDefaults({logLevel: 'error'});
	}, {message: 'setDefaults can only be called from the main process'});
});
