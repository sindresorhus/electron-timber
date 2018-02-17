/* eslint-disable import/no-extraneous-dependencies */
import electron from 'electron';
import {serial as test} from 'ava';
import {Application} from 'spectron';

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

test('main', async t => {
	const {app} = t.context;
	await app.start();
	await app.client.waitUntilWindowLoaded();

	const mainLogs = cleanLogs(await app.client.getMainProcessLogs());
	t.regex(mainLogs[0], /main › Main log/);
	t.regex(mainLogs[1], /main › Main timer: (:?.+)ms/);
	t.regex(mainLogs[2], /custom › Custom log/);
	t.regex(mainLogs[3], /main › Main warn/);
	t.regex(mainLogs[4], /main › Main error/);
	t.regex(mainLogs[5], /renderer › Renderer log/);
	t.regex(mainLogs[6], /renderer › Renderer warn/);
	t.regex(mainLogs[7], /renderer › Renderer error/);

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
