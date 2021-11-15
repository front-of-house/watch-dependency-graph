import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { parse } from 'es-module-lexer'
// @ts-ignore
import stripComments from 'strip-comments'
// @ts-ignore
import filewatcher from 'filewatcher'
import { difference } from 'lodash'

export type Alias = { [alias: string]: string }

export type Options = {
  alias?: Alias
}

export type Tree = {
  [filename: string]: {
    entry: boolean
    parents: string[]
    children: string[]
  }
}

type EventHandler<T = unknown> = (data: T) => void

const ESM_IMPORT_REGEX = /(?<![^;\n])[ ]*import(?:["'\s]*([\w*${}\n\r\t, ]+)\s*from\s*)?\s*["'](.*?)["']/gm
const ESM_DYNAMIC_IMPORT_REGEX = /(?<!\.)\bimport\((?:['"].+['"]|`[^$]+`)\)/gm

export function createEmitter() {
  let events: { [event: string]: EventHandler<any>[] } = {}

  function emit<T>(event: string, data?: T): void {
    if (events[event]) events[event].forEach((handler) => handler(data))
    if (events['*']) events['*'].forEach((handler) => handler(data))
  }

  function on<T = unknown>(event: string, handler: EventHandler<T>) {
    events[event] = events[event] ? events[event].concat(handler) : [handler]
    return () => {
      events[event].splice(events[event].indexOf(handler), 1)
    }
  }

  function clear() {
    events = {}
  }

  function listeners(event: string) {
    return events[event] || []
  }

  return {
    clear,
    emit,
    on,
    listeners,
  }
}

/*
 * Simple alias resolver i.e.
 *
 *    {
 *      '@': process.cwd()
 *    }
 */
export function resolveAliases(filepath: string, alias: Alias = {}) {
  for (const a of Object.keys(alias)) {
    if (filepath.indexOf(a) === 0) {
      // TODO support windows with path.sep()
      return (alias[a] + filepath.replace(a, '')).replace(/\/+/g, '/')
    }
  }

  return filepath
}

/**
 * Lifted from snowpack, props to their team
 *
 * @see https://github.com/snowpackjs/snowpack/blob/f75de1375fe14155674112d88bf211ca3721ac7c/snowpack/src/scan-imports.ts#L119
 */
export function cleanCodeForParsing(code: string) {
  code = stripComments(code)
  const allMatches = []
  let match
  const importRegex = new RegExp(ESM_IMPORT_REGEX)
  while ((match = importRegex.exec(code))) {
    allMatches.push(match)
  }
  const dynamicImportRegex = new RegExp(ESM_DYNAMIC_IMPORT_REGEX)
  while ((match = dynamicImportRegex.exec(code))) {
    allMatches.push(match)
  }
  return allMatches.map(([full]) => full).join('\n')
}

/*
 * Read file, parse, traverse, resolve children modules IDs
 */
export async function getChildrenModuleIds(filepath: string, options: Options = {}): Promise<string[]> {
  const raw = fs.readFileSync(filepath, 'utf-8')
  let children: string[] = []

  try {
    children = (await parse(raw))[0].map((i) => i.n) as string[]
  } catch (e) {
    children = (await parse(cleanCodeForParsing(raw)))[0].map((i) => i.n) as string[]
  }

  return children
    .map((childFilepath) => {
      const req = createRequire(filepath)
      let resolved

      try {
        resolved = req.resolve(childFilepath)
      } catch (e1) {
        try {
          resolved = req.resolve(resolveAliases(childFilepath, options.alias))
        } catch (e2) {
          resolved = require.resolve(childFilepath)
        }
      }

      // same same, must be built-in module
      return resolved === childFilepath ? undefined : resolved
    })
    .filter(Boolean) as string[]
}

export async function walk(filepath: string, tree: Tree, options: Options = {}) {
  const isWalkable = /^\.(j|t)sx?$/.test(path.extname(filepath))

  tree[filepath] = tree[filepath] || {
    entry: true,
    parents: [],
    children: [],
  }

  const prevChildren = tree[filepath].children
  const nextChildren = isWalkable ? await getChildrenModuleIds(filepath, options) : []
  const removedChildren = difference(prevChildren, nextChildren)

  for (const removedChild of removedChildren) {
    tree[removedChild].parents.splice(tree[removedChild].parents.indexOf(filepath), 1)

    // if no parents & not an entry, remove this file entirely
    if (!tree[removedChild].parents.length && !tree[removedChild].entry) {
      remove(removedChild, tree)
    }
  }

  tree[filepath].children = nextChildren

  for (const fp of tree[filepath].children) {
    // must create a leaf for each child so that entry = false
    tree[fp] = tree[fp] || {
      entry: false,
      parents: [],
      children: [],
    }

    // exits circular refs
    const alreadyVisitedFromParent = tree[fp].parents.includes(filepath)

    if (alreadyVisitedFromParent) {
      continue
    } else {
      tree[fp].parents.push(filepath)

      await walk(fp, tree, options)
    }
  }

  return tree
}

export function remove(filepath: string, tree: Tree) {
  const { parents, children } = tree[filepath]

  for (const fp of parents) {
    tree[fp].children.splice(tree[fp].children.indexOf(filepath), 1)
  }
  for (const fp of children) {
    tree[fp].parents.splice(tree[fp].parents.indexOf(filepath), 1)

    // if no parents, remove this file entirely
    if (!tree[fp].parents.length) {
      remove(fp, tree)
    }
  }

  delete tree[filepath]
}

export function clearCacheUp(filepath: string, tree: Tree) {
  delete require.cache[filepath]

  for (const fp of tree[filepath].parents) {
    clearCacheUp(fp, tree)
  }
}

export function findTopmostParents(filepath: string, tree: Tree, visited: string[] = []): string[] {
  if (visited.includes(filepath)) return visited

  const { entry, parents } = tree[filepath]

  if (entry) {
    visited.push(filepath)
  }

  for (const parent of parents) {
    findTopmostParents(parent, tree, visited)
  }

  return visited
}

export function create(options: Options = {}) {
  let tree: Tree = {}
  const watcher = filewatcher()
  const emitter = createEmitter()

  function handleError(e: any) {
    emitter.emit('error', e)
    if (!emitter.listeners('error').length) console.error(e)
  }

  function isAbsolutePath(filepath: string) {
    if (!path.isAbsolute(filepath)) {
      handleError(`Cannot add or remove relative path ${filepath}`)
      return false
    }

    return true
  }

  async function watchFilepath(filepath: string) {
    const watchedFiles = watcher.list()

    if (watchedFiles.includes(filepath)) return

    /**
     * this is an async function, but old enough that async wasn't commonly
     * handled in node, so we need to fake it
     *
     * @see https://github.com/fgnass/filewatcher/blob/master/index.js#L36
     */
    watcher.add(filepath)

    const then = Date.now()

    await new Promise((res, rej) => {
      const interval = setInterval(() => {
        /*
         * added files may b single entry, but have child modules so we're just
         * looking for an increase in the overall watched file count
         */
        if (watcher.list().length > watchedFiles.length) {
          clearInterval(interval)
          res(true)
        }

        // timeout after 2s
        if (Date.now() - then > 2000) rej(false)
      }, 10)
    })
  }

  watcher.on('change', async (file: string, stat: any) => {
    // first clear cache up the tree
    clearCacheUp(file, tree)

    if (stat.deleted) {
      const entry = tree[file].entry

      if (entry) {
        emitter.emit('remove', [file])
      } else {
        emitter.emit('change', findTopmostParents(file, tree))
      }

      watcher.remove(file)

      try {
        remove(file, tree)
      } catch (e) {
        handleError(e)
      }
    } else {
      const prev = Object.keys(tree)

      try {
        // on change, make sure to re-walk leaf
        await walk(file, tree, options)
      } catch (e) {
        handleError(e)
      }

      const next = Object.keys(tree)

      // remove anything that changed
      difference(prev, next).forEach((filepath) => watcher.remove(filepath))
      // watch all paths, watchFilepath & filewatcher dedupe
      await Promise.all(next.map(watchFilepath))

      // alert listeners of change AFTER all other processes
      emitter.emit('change', findTopmostParents(file, tree))
    }
  })

  return {
    get tree() {
      return Object.assign({}, tree)
    },
    on(event: string, handler: EventHandler) {
      return emitter.on(event, handler)
    },
    close() {
      emitter.clear()
      watcher.removeAll()
    },
    async add(filepaths: string | string[]) {
      const files = ([] as string[]).concat(filepaths).filter((fp) => !tree[fp] && isAbsolutePath(fp))

      if (!files.length) return

      for (const file of files) {
        try {
          await walk(file, tree, options)
        } catch (e) {
          handleError(e)
        }
      }

      await Promise.all(Object.keys(tree).map(watchFilepath))

      emitter.emit('add', files)
    },
    remove(filepaths: string | string[]) {
      const files = ([] as string[]).concat(filepaths).filter((fp) => tree[fp] && isAbsolutePath(fp))

      for (const file of files) {
        if (!tree[file].entry) continue

        remove(file, tree)
      }

      emitter.emit('remove', files)
    },
  }
}
