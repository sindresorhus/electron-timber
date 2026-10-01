import {registerHooks} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserWindow} from '../electron-stub.js';
import {defaultsUpdatedChannel, logLevels} from '../lib/common.js';

const electronStubUrl = new URL('../electron-stub.js', import.meta.url).href;

// Registered before `lib/main.js` is imported below, so its import of `electron` resolves to the stub rather than to the real module, which needs a running Electron app.
registerHooks({
	resolve(specifier, context, nextResolve) {
		return specifier === 'electron'
			? {url: electronStubUrl, shortCircuit: true}
			: nextResolve(specifier, context);
	},
});

const {default: logger} = await import('../lib/main.js');

test('setDefaults stores the numeric log level, ignores the name, and notifies renderers', () => {
	const window = new BrowserWindow();

	logger.setDefaults({name: 'unicorn', logLevel: 'error'});

	const defaults = logger.getDefaults();
	assert.equal(defaults.logLevel, logLevels.error);
	assert.equal(Object.hasOwn(defaults, 'name'), false);

	const updates = window.webContents.sent.filter(({channel}) => channel === defaultsUpdatedChannel);
	assert.deepEqual(updates.map(({data}) => data.logLevel), [logLevels.error]);
});

test('setDefaults with no options keeps the current defaults', () => {
	const before = logger.getDefaults();
	logger.setDefaults();
	assert.deepEqual(logger.getDefaults(), before);
});
