/**
 * Simple logger implementation
 */

import type { Logger, LogLevel } from '../types/index.js';

const LogLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class SimpleLogger implements Logger {
  private logLevel: LogLevel;
  private readonly name: string;

  constructor(name: string, logLevel: LogLevel = 'info') {
    this.name = name;
    this.logLevel = logLevel;
  }

  private formatTime(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    return LogLevels[level] >= LogLevels[this.logLevel];
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = this.formatTime();
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}] [${this.name}] ${level.toUpperCase()}: ${message}${dataStr}`;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog('error')) {
      const errorStr = error instanceof Error ? error.message : String(error);
      console.error(this.formatMessage('error', message, errorStr));
    }
  }
}

export default SimpleLogger;
