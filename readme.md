# electron-timber [![Build Status](https://travis-ci.org/sindresorhus/electron-timber.svg?branch=master)](https://travis-ci.org/sindresorhus/electron-timber)

> Pretty logger for Electron apps

<img src="screenshot.png" width="1100">

By default, logs from the renderer process don't show up in the terminal. Now they do.

You can use this module directly in both the main and renderer process.


## Install

```
$ npm install electron-timber
```

<a href="https://www.patreon.com/sindresorhus">
	<img src="https://c5.patreon.com/external/logo/become_a_patron_button@2x.png" width="160">
</a>


## Usage

Main process:

```js
const {app, BrowserWindow} = require('electron');
const logger = require('electron-timber');

let mainWindow;
app.on('ready', () => {
	mainWindow = new BrowserWindow();
	mainWindow.loadURL(…);

	logger.log('Main log');
	logger.error('Main error');

	const customLogger = logger.create({prefix: 'custom'});
	customLogger.log('Custom log');
});
```

Renderer process:

```js
const logger = require('timber');

logger.log('Renderer log');
logger.error('Renderer error');
```


## API

## logger

Logging will be prefixed with either `main` or `renderer` depending on where it comes from.

Logs from the renderer process only show up if you have required `electron-timber` in the main process.

### log(…values)

Like `console.log`.

### error(…values)

Like `console.error`.

### streamLog(stream)

Log each line in a [`stream.Readable`](https://nodejs.org/api/stream.html#stream_readable_streams). For example, `child_process.spawn(…).stdout`.

### streamError(stream)

Same as `streamLog`, but logs using `console.error` instead.

### create([options])

Create a custom logger instance.

You should initialize this on module load so prefix padding is consistent with the other loggers.

#### options

Type: `Object`

##### prefix

Type: `string`

Prefix to use for the logs. Don't use `main` or `renderer`.

##### ignore

Type `RegExp`

Ignore lines matching the given regex.


## Toggle loggers

You can show the output of only a subset of the loggers using the environment variable `TIMBER_LOGGERS`. Here we show the output of the default `renderer` logger and a custom `unicorn` logger, but not the default `main` logger:

```sh
TIMBER_LOGGERS=renderer,unicorn electron .
```


## Related

- [electron-util](https://github.com/sindresorhus/electron-util) - Useful utilities for developing Electron apps and modules
- [electron-reloader](https://github.com/sindresorhus/electron-reloader) - Simple auto-reloading for Electron apps during development
- [electron-serve](https://github.com/sindresorhus/electron-serve) - Static file serving for Electron apps
- [electron-debug](https://github.com/sindresorhus/electron-debug) - Adds useful debug features to your Electron app
- [electron-context-menu](https://github.com/sindresorhus/electron-context-menu) - Context menu for your Electron app
- [electron-dl](https://github.com/sindresorhus/electron-dl) - Simplified file downloads for your Electron app
- [electron-unhandled](https://github.com/sindresorhus/electron-unhandled) - Catch unhandled errors and promise rejections in your Electron app


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
