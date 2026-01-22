export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface ErrorEntry {
  message: string;
  error?: string;
  timestamp: number;
}

class Logger {
  private static isDevelopment = __DEV__;
  private static errorsQueue: ErrorEntry[] = [];

  static debug(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.debug(message, ...args);
    }
  }

  static info(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.log(message, ...args);
    }
  }

  static warn(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.warn(message, ...args);
    }
  }

  static error(message: string, error?: Error | unknown, ...args: any[]) {
    if (this.isDevelopment) {
      console.error(message, error, ...args);
    }

    // In production, enqueue error for later sending to error tracking service
    if (!this.isDevelopment) {
      const errorStr = error instanceof Error ? error.message : String(error);
      this.errorsQueue.push({
        message,
        error: errorStr,
        timestamp: Date.now(),
      });
      console.error(`[ERROR] ${message}`);
    }
  }

  static flushErrors(): ErrorEntry[] {
    const errors = [...this.errorsQueue];
    this.errorsQueue = [];
    return errors;
  }

  static getErrorsCount(): number {
    return this.errorsQueue.length;
  }
}

export default Logger;
