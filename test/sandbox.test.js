import path from 'node:path';
import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify, stripVTControlCharacters} from 'node:util';
import electronPath from 'electron';

const fixture = path.join(import.meta.dirname, 'fixture', 'index-sandbox.js');

test('renderer logs reach the terminal from a sandboxed renderer', async t => {
	const {stdout: rawStdout} = await promisify(execFile)(electronPath, [fixture], {timeout: 30_000});
	const stdout = stripVTControlCharacters(rawStdout);

	t.assert.match(stdout, /renderer › Renderer log/v);
	t.assert.match(stdout, /renderer › Renderer defaults \{.*"logLevel":0,"timestamp":true\}/v);
});
