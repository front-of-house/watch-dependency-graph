export declare type Alias = {
  [alias: string]: string
}
export declare type Options = {
  alias?: Alias
}
export declare type Tree = {
  [filename: string]: {
    entry: boolean
    parents: string[]
    children: string[]
  }
}
declare type EventHandler<T = unknown> = (data: T) => void
export declare function createEmitter(): {
  clear: () => void
  emit: <T>(event: string, data?: T | undefined) => void
  on: <T_1 = unknown>(event: string, handler: EventHandler<T_1>) => () => void
  listeners: (event: string) => EventHandler<any>[]
}
export declare function resolveAliases(filepath: string, alias?: Alias): string
/**
 * Lifted from snowpack, props to their team
 *
 * @see https://github.com/snowpackjs/snowpack/blob/f75de1375fe14155674112d88bf211ca3721ac7c/snowpack/src/scan-imports.ts#L119
 */
export declare function cleanCodeForParsing(code: string): string
export declare function getChildrenModuleIds(filepath: string, options?: Options): Promise<string[]>
export declare function walk(filepath: string, tree: Tree, options?: Options): Promise<Tree>
export declare function remove(filepath: string, tree: Tree): void
export declare function clearCacheUp(filepath: string, tree: Tree): void
export declare function findTopmostParents(filepath: string, tree: Tree, visited?: string[]): string[]
export declare function create(options?: Options): {
  readonly tree: Tree
  on(event: string, handler: EventHandler): () => void
  close(): void
  add(filepaths: string | string[]): Promise<void>
  remove(filepaths: string | string[]): void
}
export {}
