import {registerHooks} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserWindow, consoleUpdateFlags} from '../electron-stub.js';

const electronStubUrl = new URL('../electron-stub.js', import.meta.url).href;

// Registered before `lib/main.js` is imported below, so its import of `electron` resolves to the
// stub rather than to the real module, which needs a running Electron app.
registerHooks({
	resolve(specifier, context, nextResolve) {
		return specifier === 'electron'
			? {url: electronStubUrl, shortCircuit: true}
			: nextResolve(specifier, context);
	},
});

const {default: logger} = await import('../lib/main.js');

// A new window per test, and only that window is read, so the messages one test sent are not read
// as another's. Every open window receives the update, so the earlier ones keep filling up.
const openWindow = () => new BrowserWindow();

test('unhooking the renderers alone tells them to unhook', () => {
	const window = openWindow();

	const unhook = logger.hookConsole({renderer: true});
	assert.deepEqual(consoleUpdateFlags([window]), [true]);

	unhook();
	assert.deepEqual(consoleUpdateFlags([window]), [true, false]);
	assert.equal(logger.getDefaults().shouldHookConsole, false);
});

test('unhooking the main process alone leaves the renderers alone', () => {
	const window = openWindow();

	const unhook = logger.hookConsole({main: true});
	unhook();

	assert.deepEqual(consoleUpdateFlags([window]), []);
});

test('unhooking both tells the renderers to unhook', () => {
	const window = openWindow();

	const unhook = logger.hookConsole({main: true, renderer: true});
	unhook();

	assert.deepEqual(consoleUpdateFlags([window]), [true, false]);
	assert.equal(logger.getDefaults().shouldHookConsole, false);
});
