export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

class Logger {
  private static isDevelopment = __DEV__;

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

    // TODO: In production, send to error tracking service (e.g., Sentry)
    // This would strip sensitive fields before sending
  }
}

export default Logger;
