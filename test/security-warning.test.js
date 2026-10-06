import path from 'node:path';
import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify, stripVTControlCharacters} from 'node:util';
import electronPath from 'electron';

const fixture = path.join(import.meta.dirname, 'fixture', 'index-security-warning.js');

test('Electron security warnings in a hooked renderer console do not reach the terminal but are still shown in DevTools', async t => {
	const {stdout, stderr: rawStderr} = await promisify(execFile)(electronPath, [fixture], {timeout: 30_000});
	const stderr = stripVTControlCharacters(rawStderr);

	t.assert.match(stderr, /renderer › Renderer warn console/v);
	t.assert.doesNotMatch(stderr, /Electron Security Warning/v);

	// Matches only the fixture warning, not the real one Electron also shows in DevTools for the fixture page.
	t.assert.match(stdout, /DevTools: .*Electron Security Warning \(Insecure Content-Security-Policy\).* This renderer process has no Content Security Policy set\./v);
});
