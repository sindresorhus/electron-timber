/* eslint-disable import/no-extraneous-dependencies */
import electron from 'electron';
import {serial as test} from 'ava';
import {Application} from 'spectron';
import delay from 'delay';

test.beforeEach(async t => {
	t.context.app = new Application({
		path: electron,
		args: ['.']
	});
});

test.afterEach.always(async t => {
	await t.context.app.stop();
});

const cleanLogs = x => x.filter(x => !x.includes('INFO:CONSOLE'));

test.serial('main', async t => {
	const {app} = t.context;
	await app.start();
	await app.client.waitUntilWindowLoaded();

	const mainLogs = cleanLogs(await app.client.getMainProcessLogs());

	// FIXME: For some reason the main processes logs don't come in the same order
	// every time, see https://github.com/sindresorhus/electron-timber/pull/4
	mainLogs.sort();

	t.regex(mainLogs[0], /main › Main error/);
	t.regex(mainLogs[1], /main › Main log/);
	t.regex(mainLogs[2], /main › Main timer: (:?.+)ms/);
	t.regex(mainLogs[3], /main › Main warn/);
	t.regex(mainLogs[4], /custom › Custom log/);
	t.regex(mainLogs[5], /renderer › Renderer error/);
	t.regex(mainLogs[6], /renderer › Renderer log/);
	t.regex(mainLogs[7], /renderer › Renderer timer: (:?.+)ms/);
	t.regex(mainLogs[8], /renderer › Renderer warn/);

	let rendererLogs = await app.client.getRenderProcessLogs();
	rendererLogs = cleanLogs(rendererLogs.map(x => x.message));
	t.regex(rendererLogs[0], /Renderer log/);
	t.regex(rendererLogs[1], /Renderer warn/);
	t.regex(rendererLogs[2], /Renderer error/);
});

test.serial('toggle loggers', async t => {
	process.env.TIMBER_LOGGERS = 'renderer,custom';

	const {app} = t.context;
	await app.start();
	await app.client.waitUntilWindowLoaded();

	const mainLogs = cleanLogs(await app.client.getMainProcessLogs());
	t.regex(mainLogs[0], /custom › Custom log/);
	t.regex(mainLogs[1], /renderer › Renderer log/);
	t.regex(mainLogs[2], /renderer › Renderer warn/);
	t.regex(mainLogs[3], /renderer › Renderer error/);
	t.regex(mainLogs[4], /renderer › Renderer timer: (:?.+)ms/);

	delete process.env.TIMBER_LOGGERS;
});

test('logLevel', async t => {
	const {app} = t.context;
	await app.start();
	await app.client.waitUntilWindowLoaded();

	// Clear logs from starting the app.
	await app.client.getMainProcessLogs();
	await app.client.getRenderProcessLogs();

	app.electron.ipcRenderer.send('setDefaults', { logLevel: 'error' });

	// Send some logs to the main process.
	app.electron.ipcRenderer.send('logger', 'log', 'log');
	app.electron.ipcRenderer.send('logger', 'warn', 'warn');
	app.electron.ipcRenderer.send('logger', 'error', 'error');

	// Send some logs to the renderer process.
	app.browserWindow.send('logger', 'log', 'log');
	app.browserWindow.send('logger', 'warn', 'warn');
	app.browserWindow.send('logger', 'error', 'error');

	// Wait to ensure that all IPC messages and logs have completed.
	await delay(1000);
	const mainLogs = cleanLogs(await app.client.getMainProcessLogs());

	// FIXME: see above explanation in the "main" test.
	mainLogs.sort();

	t.is(mainLogs.length, 5);
	t.regex(mainLogs[0], /main › error/);
	t.regex(mainLogs[1], /custom › error/);
	t.regex(mainLogs[2], /custom › log/);
	t.regex(mainLogs[3], /custom › warn/);
	t.regex(mainLogs[4], /renderer › error/);

	let rendererLogs = await app.client.getRenderProcessLogs();
	rendererLogs = cleanLogs(rendererLogs.map(x => x.message));
	t.is(rendererLogs.length, 1);
	t.regex(rendererLogs[0], /error/);
});
