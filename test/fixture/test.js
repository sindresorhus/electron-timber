/* eslint-disable import/no-extraneous-dependencies */
import electron from 'electron';
import {serial as test} from 'ava';
import {Application} from 'spectron';

test.beforeEach(async t => {
	t.context.app = new Application({
		path: electron,
		args: ['.']
	});
	await t.context.app.start();
});

test.afterEach.always(async t => {
	await t.context.app.stop();
});

const cleanLogs = x => x.filter(x => !x.includes('INFO:CONSOLE'));

test('main', async t => {
	const {app} = t.context;
	await app.client.waitUntilWindowLoaded();

	const mainLogs = cleanLogs(await app.client.getMainProcessLogs());
	t.deepEqual(mainLogs, [
		'    main › Main log',
		'  custom › Custom log',
		'    main › Main error',
		'renderer › Renderer log',
		'renderer › Renderer error'
	]);

	let rendererLogs = await app.client.getRenderProcessLogs();
	rendererLogs = cleanLogs(rendererLogs.map(x => x.message));
	t.regex(rendererLogs[0], /Renderer log/);
	t.regex(rendererLogs[1], /Renderer error/);
});
