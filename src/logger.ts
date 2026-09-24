/**
 * Minimal framework-agnostic logger with the @nestjs/common Logger API subset
 * the harness code uses. Swappable: pass `logger` to `createAgent()` to plug in
 * your own (winston, pino, console).
 */

export type LogLevel = 'debug' | 'verbose' | 'log' | 'warn' | 'error';

export interface LoggerLike {
  debug(message: string, context?: string): void;
  verbose(message: string, context?: string): void;
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Prefix every line with this string (default none). */
  prefix?: string;
  /** Override the sink; defaults to console. */
  sink?: Pick<Console, 'debug' | 'log' | 'warn' | 'error'>;
}

const RANK: Record<LogLevel, number> = { debug: 10, verbose: 20, log: 30, warn: 40, error: 50 };
const DEFAULT_LEVEL: LogLevel = (process.env.HARNESS_LOG_LEVEL as LogLevel) || 'log';

export function setLogLevel(level: LogLevel): void {
  _level = level;
}

let _level: LogLevel = DEFAULT_LEVEL;
const sink = { debug: console.debug, log: console.log, warn: console.warn, error: console.error };

function format(ctx: string | undefined, message: string): string {
  return ctx ? `[${ctx}] ${message}` : message;
}

function shouldLog(level: LogLevel): boolean {
  return RANK[level] >= RANK[_level];
}

export class Logger {
  private readonly ctx: string | undefined;

  constructor(context?: string) {
    this.ctx = context;
  }

  static debug(message: string, context?: string): void {
    if (shouldLog('debug')) sink.debug(format(context, message));
  }
  static verbose(message: string, context?: string): void {
    if (shouldLog('verbose')) sink.log(format(context, message));
  }
  static log(message: string, context?: string): void {
    if (shouldLog('log')) sink.log(format(context, message));
  }
  static warn(message: string, context?: string): void {
    if (shouldLog('warn')) sink.warn(format(context, message));
  }
  static error(message: string, context?: string): void {
    if (shouldLog('error')) sink.error(format(context, message));
  }

  debug(message: string): void {
    if (shouldLog('debug')) sink.debug(format(this.ctx, message));
  }
  verbose(message: string): void {
    if (shouldLog('verbose')) sink.log(format(this.ctx, message));
  }
  log(message: string): void {
    if (shouldLog('log')) sink.log(format(this.ctx, message));
  }
  warn(message: string): void {
    if (shouldLog('warn')) sink.warn(format(this.ctx, message));
  }
  error(message: string): void {
    if (shouldLog('error')) sink.error(format(this.ctx, message));
  }
}

/** No-op NestJS-style decorator so @Injectable() classes port unchanged. */
export function Injectable(): any {
  return (target: any) => target;
}