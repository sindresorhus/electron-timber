import {Readable} from 'node:stream';
import {expectType, expectError} from 'tsd';
import logger, {
	type Timber,
	type DefaultTimber,
	type LogLevelName,
	type TimberOptions,
	type TimberDefaults,
	type HookConsoleOptions,
	type UnhookConsoleFunction,
} from './index.js';

expectType<DefaultTimber>(logger);

declare const logLevel: LogLevelName;
expectType<'info' | 'warn' | 'error'>(logLevel);

expectType<void>(logger.log('Hello', {world: 'earth'}));
expectType<void>(logger.warn('Careful'));
expectType<void>(logger.error(new Error('Boom')));
expectType<void>(logger.time());
expectType<void>(logger.time('load'));
expectType<void>(logger.timeEnd());
expectType<void>(logger.timeEnd('load'));
expectError(logger.time(1));

const stream = Readable.from(['line']);
expectType<void>(logger.streamLog(stream));
expectType<void>(logger.streamWarn(stream));
expectType<void>(logger.streamError(stream));
expectError(logger.streamLog('line'));

// The default export carries `hookConsole()`; loggers from `create()` do not.
const hookOptions: HookConsoleOptions = {main: true, renderer: true};
expectType<UnhookConsoleFunction>(logger.hookConsole());
expectType<UnhookConsoleFunction>(logger.hookConsole(hookOptions));
expectType<UnhookConsoleFunction>(logger.hookConsole({renderer: true}));

expectError(logger.hookConsole({main: 'yes'}));
expectError(logger.hookConsole({renderer: 'yes'}));
expectError(logger.hookConsole({main: true, unknown: true}));

const options: TimberOptions = {
	name: 'unicorn',
	logLevel: 'info',
	ignore: /debug/v,
	timestamp: true,
};
const custom = logger.create(options);
expectType<Timber>(custom);
expectType<Timber>(logger.create());
expectType<Timber>(custom.create());
expectType<void>(custom.log('Hello'));
expectType<void>(custom.streamLog(stream));
expectError(custom.hookConsole());

expectType<TimberDefaults>(logger.getDefaults());
expectType<RegExp | undefined>(logger.getDefaults().ignore);
expectType<number>(logger.getDefaults().logLevel);
expectType<boolean>(logger.getDefaults().shouldHookConsole);

expectType<void>(logger.setDefaults());
expectType<void>(logger.setDefaults({ignore: /debug/v, logLevel: 'warn'}));
expectType<void>(logger.setDefaults({timestamp: true}));
expectError(logger.setDefaults({logLevel: 'verbose'}));

// `setDefaults()` ignores `name`, so the type does not accept it.
expectError(logger.setDefaults({name: 'unicorn'}));

expectError(logger.create({logLevel: 'verbose'}));
expectError(logger.create({name: 123}));
expectError(logger.create({ignore: 'debug'}));
expectError(logger.create({timestamp: 'yes'}));
