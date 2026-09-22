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

	 Defaults to `info` when `NODE_ENV` is `development` and `warn` otherwise.
	 */
	readonly logLevel?: LogLevelName;
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
};

export type HookConsoleOptions = {
	/**
	 Hook the console in the main process.

	 Only applies when called from the main process.

	 When `hookConsole()` is called with no arguments from the main process, the main console is hooked.
	 */
	readonly main?: boolean;

	/**
	 Hook the console in renderer processes.

	 Can be set from the main process to hook all current and future renderers, or from a renderer to hook itself.

	 When `hookConsole()` is called with no arguments from a renderer process, the renderer console is hooked.

	 @default false
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
	 */
	time(label?: string): void;

	/**
	 End a timer.

	 Like `console.timeEnd`.
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
	 */
	create(options?: TimberOptions): Timber;

	/**
	 Get the default options (across `main` and `renderer` processes).
	 */
	getDefaults(): TimberDefaults;

	/**
	 Set the default options (across `main` and `renderer` processes).

	 The `name` option is ignored.

	 Note: This method can only be called from the main process. It throws when called from a renderer.
	 */
	setDefaults(options: TimberOptions): void;
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

export default logger;
