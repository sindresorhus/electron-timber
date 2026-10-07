import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
import {stripVTControlCharacters} from 'node:util';
import assert from 'node:assert/strict';
import {app, BrowserWindow, ipcMain} from '../electron-stub.js';
import {defaultsUpdatedChannel, errorChannel, logLevels} from '../lib/common.js';

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

test('the timestamp option prefixes the output with the local time', t => {
	const error = t.mock.method(console, 'error', () => {});

	logger.create({name: 'unicorn', timestamp: true}).error('Hello');
	logger.create({timestamp: true}).error('Hello');
	logger.create({name: 'unicorn'}).error('Hello');

	const lines = error.mock.calls.map(call => stripVTControlCharacters(call.arguments.join(' ')));
	t.assert.match(lines[0], /^\d{2}:\d{2}:\d{2} +unicorn › Hello$/v);
	t.assert.match(lines[1], /^\d{2}:\d{2}:\d{2} Hello$/v);
	t.assert.match(lines[2], /^ *unicorn › Hello$/v);
});

const temporaryDirectory = t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-timber-'));
	t.after(() => {
		fs.rmSync(directory, {recursive: true, force: true});
	});
	return directory;
};

test('the file option writes plain lines with the time, level, and name', t => {
	t.mock.method(console, 'log', () => {});
	t.mock.method(console, 'error', () => {});
	const file = path.join(temporaryDirectory(t), 'nested', 'app.log');

	const unicornLogger = logger.create({
		name: 'unicorn',
		file,
		logLevel: 'info',
		ignore: /secret/v,
	});
	unicornLogger.log('Hello', {count: 1});
	unicornLogger.log('A secret');
	unicornLogger.time('Timer');
	unicornLogger.timeEnd('Timer');
	// Colored, like the output of a child process.
	logger.create({file}).error('\u{1B}[31mFailure\u{1B}[39m');
	logger.create({file, logLevel: 'error'}).log('Below the log level');

	const lines = fs.readFileSync(file, 'utf8').split('\n');
	t.assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[info\] unicorn › Hello \{ count: 1 \}$/v);
	t.assert.match(lines[1], /^\S+ \[info\] unicorn › Timer: [\d.]+ms$/v);
	t.assert.match(lines[2], /^\S+ \[error\] Failure$/v);
	t.assert.strictEqual(lines.length, 4);
});

test('the file option set to true writes to main.log in the logs directory', t => {
	t.mock.method(console, 'warn', () => {});
	const logsDirectory = path.join(temporaryDirectory(t), 'logs');
	t.mock.method(app, 'getPath', name => {
		t.assert.strictEqual(name, 'logs');
		return logsDirectory;
	});

	logger.create({file: true, logLevel: 'warn'}).warn('Hello');

	t.assert.match(fs.readFileSync(path.join(logsDirectory, 'main.log'), 'utf8'), /\[warn\] Hello\n$/v);
});

test('renderer logs are written to the file set with setDefaults', t => {
	t.mock.method(console, 'error', () => {});
	const defaults = logger.getDefaults();
	t.after(() => {
		logger.setDefaults(defaults);
	});
	const file = path.join(temporaryDirectory(t), 'app.log');

	logger.setDefaults({file});
	const [logFromRenderer] = ipcMain.listeners.get(errorChannel);
	logFromRenderer({}, ['Renderer error']);

	t.assert.match(fs.readFileSync(file, 'utf8'), /^\S+ \[error\] renderer › Renderer error\n$/v);
});

test('the log file is renamed with .old when it reaches maxFileSize', t => {
	t.mock.method(console, 'error', () => {});
	const directory = temporaryDirectory(t);
	const file = path.join(directory, 'app.log');
	const oldFile = path.join(directory, 'app.old.log');

	const fileLogger = logger.create({file, maxFileSize: 1});
	fileLogger.error('First');
	t.assert.strictEqual(fs.existsSync(oldFile), false);

	fileLogger.error('Second');
	t.assert.match(fs.readFileSync(oldFile, 'utf8'), /^\S+ \[error\] First\n$/v);
	t.assert.match(fs.readFileSync(file, 'utf8'), /^\S+ \[error\] Second\n$/v);

	const unlimitedLogger = logger.create({file, maxFileSize: 0});
	unlimitedLogger.error('Third');
	unlimitedLogger.error('Fourth');
	t.assert.match(fs.readFileSync(file, 'utf8'), /Second\n.+Third\n.+Fourth\n$/v);
});

test('the log file keeps growing when it cannot be renamed', t => {
	t.mock.method(console, 'error', () => {});
	const directory = temporaryDirectory(t);
	const file = path.join(directory, 'app.log');
	// A non-empty directory where the old file goes makes the rename fail.
	fs.mkdirSync(path.join(directory, 'app.old.log', 'blocker'), {recursive: true});

	const fileLogger = logger.create({file, maxFileSize: 1});
	fileLogger.error('First');
	fileLogger.error('Second');
	fileLogger.error('Third');

	t.assert.match(fs.readFileSync(file, 'utf8'), /First\n.+Second\n.+Third\n$/v);
});
