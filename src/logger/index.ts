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
    
    // ANSI color codes
    const colors: Record<string, string> = {
      debug: '\x1b[90m', // Gray
      info: '\x1b[36m',  // Cyan
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const color = colors[level.toLowerCase()] || reset;

    return `${color}[${timestamp}] [${this.name}] ${level.toUpperCase()}: ${message}${dataStr}${reset}`;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      process.stderr.write(this.formatMessage('debug', message, data) + '\n');
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      process.stderr.write(this.formatMessage('info', message, data) + '\n');
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      process.stderr.write(this.formatMessage('warn', message, data) + '\n');
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog('error')) {
      const errorStr = error instanceof Error ? error.message : String(error);
      process.stderr.write(this.formatMessage('error', message, errorStr) + '\n');
    }
  }
}

export default SimpleLogger;

