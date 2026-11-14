declare module 'better-sqlite3' {
  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: any;
    nativeBinding?: string;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement<T = any> {
    run(...params: any[]): RunResult;
    get(...params: any[]): T | undefined;
    all(...params: any[]): T[];
    iterate(...params: any[]): IterableIterator<T>;
  }

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    prepare<T = any>(source: string): Statement<T>;
    exec(source: string): this;
    pragma(source: string, options?: { simple?: boolean }): any;
    transaction<F extends (...args: any[]) => any>(fn: F): F;
    close(): this;
  }

  export = Database;
}
