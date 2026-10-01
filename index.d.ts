export type LogLevelName = 'info' | 'warn' | 'error';

export type TimberOptions = {
	/**
	 Name of the logger. Used to prefix the log output.

	 Don't use `main` or `renderer`.
	 */
	readonly name?: string;

	/**
	 Ignore lines matching the given regex.
	 */
	readonly ignore?: RegExp | undefined;

	/**
	 Log level.

	 Can be `info` (log everything), `warn` (log warnings and errors), or `error` (log errors only).

	 Default: `'info'` when `NODE_ENV` is `'development'`, otherwise `'warn'`.
	 */
	readonly logLevel?: LogLevelName;

	/**
	 Prefix the output with the local time, for example `22:10:34 main › Log`.

	 Only applies to the terminal output. Renderer logs are printed in the terminal by the main process, so use `setDefaults()` in the main process to add timestamps to them. In DevTools, use the “Show timestamps” setting instead.

	 Default: `false`
	 */
	readonly timestamp?: boolean;
};

/**
 Defaults shared across main and renderer processes via the preload script.

 Note: `logLevel` is stored internally as a number (`0`, `1`, `2`).
 Pass a string (`'info'`, `'warn'`, `'error'`) to `setDefaults()` and `create()`.
 */
export type TimberDefaults = {
	readonly ignore: RegExp | undefined;
	readonly shouldHookConsole: boolean;
	readonly logLevel: number;
	readonly timestamp: boolean;
};

export type HookConsoleOptions = {
	/**
	 Hook the console in the main process.

	 Only applies when called from the main process.

	 Default: `true` when `hookConsole()` is called with no arguments from the main process, otherwise `false`.
	 */
	readonly main?: boolean;

	/**
	 Hook the console in renderer processes.

	 Can be set from the main process to hook all current and future renderers, or from a renderer to hook itself.

	 Default: `true` when `hookConsole()` is called with no arguments from a renderer process, otherwise `false`.
	 */
	readonly renderer?: boolean;
};

/**
 Function to unhook console methods.
 */
export type UnhookConsoleFunction = () => void;

declare class Timber {
	/**
	 Log a message.

	 Like `console.log`.
	 */
	log(...values: unknown[]): void;

	/**
	 Log a warning.

	 Like `console.warn`.
	 */
	warn(...values: unknown[]): void;

	/**
	 Log an error.

	 Like `console.error`.
	 */
	error(...values: unknown[]): void;

	/**
	 Start a timer.

	 Like `console.time`.

	 @param label - Timer label. Default: `'default'`.
	 */
	time(label?: string): void;

	/**
	 End a timer.

	 Like `console.timeEnd`. Does nothing when no timer with the label is running.

	 @param label - Timer label. Default: `'default'`.
	 */
	timeEnd(label?: string): void;

	/**
	 Log each line in a stream.

	 @param stream - Stream to log from. For example, `child_process.spawn(...).stdout`.
	 */
	streamLog(stream: NodeJS.ReadableStream): void;

	/**
	 Log each line in a stream as a warning.

	 Same as `streamLog`, but logs using `console.warn` instead.

	 @param stream - Stream to log from.
	 */
	streamWarn(stream: NodeJS.ReadableStream): void;

	/**
	 Log each line in a stream as an error.

	 Same as `streamLog`, but logs using `console.error` instead.

	 @param stream - Stream to log from.
	 */
	streamError(stream: NodeJS.ReadableStream): void;

	/**
	 Create a custom logger instance.

	 You should initialize this on module load so prefix padding is consistent with the other loggers.

	 Custom loggers do not have the `hookConsole()` method. Call it on the default export instead.

	 @example
	 ```
	 import logger from 'electron-timber';

	 const log = logger.create({name: 'unicorn'});

	 log.log('Hello from the unicorn logger');
	 ```
	 */
	create(options?: TimberOptions): Timber;

	/**
	 Get the default options (across `main` and `renderer` processes).

	 Note: `logLevel` is returned in its internal numeric form.
	 */
	getDefaults(): TimberDefaults;

	/**
	 Set the default options (across `main` and `renderer` processes). Renderer windows are notified automatically.

	 The `name` option is ignored.

	 Note: This method can only be called from the main process. It throws when called from a renderer.

	 @example
	 ```
	 import logger from 'electron-timber';

	 logger.setDefaults({
	   logLevel: 'error'
	 });
	 ```
	 */
	setDefaults(options?: Omit<TimberOptions, 'name'>): void;
}

declare class DefaultTimber extends Timber {
	/**
	 Hook console methods (`console.log`, `console.warn`, etc.) to use electron-timber instead.

	 When called with no arguments, hooks the console in the current process.
	 From the main process, pass `{renderer: true}` to also hook all renderer consoles (including future windows).

	 Only available on the default export. Custom loggers created with `create()` do not have this method.

	 @returns Function to unhook console methods.

	 @example
	 ```
	 import logger from 'electron-timber';

	 const unhook = logger.hookConsole({
	   main: true,
	   renderer: true
	 });

	 // Later...
	 unhook();
	 ```
	 */
	hookConsole(options?: HookConsoleOptions): UnhookConsoleFunction;
}

declare const logger: DefaultTimber;

export type {Timber, DefaultTimber};

export default logger;
