const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const debug = require('debug')('wdg')
const filewatcher = require('filewatcher')
const acorn = require('acorn-loose')
const walker = require('acorn-walk')
const { transformSync } = require('@babel/core')

function emitter () {
  let events = {}

  return {
    emit (ev, ...args) {
      return events[ev] ? events[ev].map(fn => fn(...args)) : []
    },
    on (ev, fn) {
      events[ev] = events[ev] ? events[ev].concat(fn) : [fn]
      return () => events[ev].slice(events[ev].indexOf(fn), 1)
    },
    clear () {
      events = {}
    },
    listeners (ev) {
      return events[ev] || []
    }
  }
}

/*
 * Simple alias resolver i.e.
 *
 *    {
 *      '@': process.cwd()
 *    }
 */
function resolveAliases (id, alias) {
  for (const a of Object.keys(alias)) {
    if (id.indexOf(a) === 0) {
      return path.join(alias[a], id.replace(a, ''))
    }
  }

  return id
}

/*
 * Walks up the tree, clearing require cache as it goes
 */
function clearUp (ids, tree, parentPointers) {
  for (const p of parentPointers) {
    const id = ids[p]

    delete require.cache[id]

    clearUp(ids, tree, tree[id].parentPointers)
  }
}

/*
 * Walk AST node for imports/requires, then resolve those dependencies
 */
function getFileIdsFromAstNode (node, { parentFileId, alias }) {
  const ids = []

  walker.simple(node, {
    ImportDeclaration (node) {
      ids.push(node.source.value)
    },
    CallExpression (node) {
      if (node.callee.name === 'require') {
        ids.push(node.arguments[0].value)
      }
    }
  })

  return ids
    .map(id => {
      const req = createRequire(parentFileId)
      let resolved

      try {
        resolved = req.resolve(id)
      } catch (e) {
        try {
          resolved = req.resolve(resolveAliases(id, alias))
        } catch (e) {
          resolved = require.resolve(id)
        }
      }

      // same same, must be built-in module
      return resolved === id ? undefined : resolved
    })
    .filter(Boolean)
}

/*
 * Walk an entry file, creating trees and leafs as needed. If the file has
 * deps, find those and walk them too
 */
function walk (id, context) {
  let {
    ids,
    tree,
    entryPointer,
    parentPointer,
    visitedLeaf,
    events,
    alias
  } = context

  /*
   * Some files may be included by multiple entries, and ids[] should be a
   * unique array
   */
  if (!ids.includes(id)) ids.push(id)

  const pointer = ids.indexOf(id)

  // on first call of walk with a fresh entry
  const isEntry = entryPointer === undefined
  // if this is an entry, it should be self referential
  entryPointer = isEntry ? pointer : entryPointer
  // if this is an entry, set up the parentPointer for the next walk
  parentPointer = isEntry ? pointer : parentPointer

  if (!tree[id]) {
    tree[id] = {
      pointer,
      entryPointers: [entryPointer],
      // entry has no parent
      parentPointers: isEntry ? [] : [parentPointer],
      childrenPointers: []
    }
  } else {
    const leaf = tree[id]

    /*
     * On deeper walks, push entry and parent pointers to leaf
     */

    if (!leaf.entryPointers.includes(entryPointer))
      leaf.entryPointers.push(entryPointer)

    if (!leaf.parentPointers.includes(parentPointer))
      leaf.parentPointers.push(parentPointer)
  }

  /*
   * Push current child to its parent, if not an entry (no parent)
   */
  if (!isEntry) {
    const parentLeaf = tree[ids[parentPointer]]
    if (!parentLeaf.childrenPointers.includes(pointer))
      parentLeaf.childrenPointers.push(pointer)
  }

  if (!visitedLeaf.includes(id)) {
    // note that we've visited this ID while walking the current entry
    visitedLeaf.push(id)

    const extension = path.extname(id)

    // don't walk non-js files
    if (!/^\.(j|t)sx?$/.test(extension)) return

    try {
      const raw = fs.readFileSync(id, 'utf-8')
      const { code } = transformSync(raw, {
        presets: [require.resolve('@babel/preset-env')]
      })
      const ast = acorn.parse(code, {
        ecmaVersion: 2015,
        sourceType: 'module'
      })

      for (const node of ast.body) {
        // get deps of current file
        const nextIds = getFileIdsFromAstNode(node, {
          parentFileId: id,
          alias
        })

        // walk each dep
        for (const _id of nextIds) {
          walk(_id, {
            ids,
            tree,
            entryPointer,
            parentPointer: pointer,
            visitedLeaf,
            events,
            alias
          })
        }
      }
    } catch (e) {
      // on syntax errors, just watch file and exit walk
      if (e instanceof SyntaxError) return
      // if we can't resolve then we don't walk
      if (e.message.includes('Cannot find module')) return

      // overwrite to localize error
      if (e instanceof SyntaxError) {
        e = new SyntaxError(e.message, id, e.lineNumber)
      }

      events.emit('error', e)

      // if no error handler is configured, just stderr it
      if (!events.listeners('error').length) console.error(e)
    }
  }
}

module.exports = function graph ({ alias = {} } = {}) {
  debug('initialized with', { alias })

  // once instance
  const events = emitter()

  // all generated from factory
  let ids = []
  let tree = {}
  let watcher
  let entries = []

  function cleanById (id) {
    const { pointer, parentPointers, childrenPointers } = tree[id]

    delete tree[id]

    for (const p of parentPointers) {
      const children = tree[ids[p]].childrenPointers
      children.splice(children.indexOf(pointer), 1)
    }

    for (const p of childrenPointers) {
      const parents = tree[ids[p]].parentPointers
      parents.splice(parents.indexOf(pointer), 1)
    }

    ids.splice(pointer, 1)

    watcher.remove(id)
  }

  /**
   * Diff and update watch
   */
  function bootstrap () {
    debug('bootstrap', entries)

    const prevIds = ids // save for diff

    ids = [] // reset
    tree = {} // reset

    const visitedTree = {} // new on each walk

    // walk each entry
    for (const id of entries) {
      const visitedLeaf = (visitedTree[id] = [])

      walk(id, {
        ids,
        tree,
        visitedLeaf,
        events,
        alias
      })
    }

    /*
     * Diff and add/remove from watch
     */

    const nextIds = ids
    const addedIds = nextIds.filter(id => !prevIds.includes(id))
    const removedIds = prevIds.filter(id => !nextIds.includes(id))

    debug('diff', { addedIds, removedIds })

    for (const id of addedIds) {
      watcher.add(id)
    }

    for (const id of removedIds) {
      watcher.remove(id)
    }
  }

  function handleChange (file) {
    const { entryPointers } = tree[file]

    // bust cache for all involved files up the tree
    clearUp(ids, tree, [ids.indexOf(file)])

    // only emit which entries changed
    events.emit(
      'change',
      entryPointers.map(p => ids[p]) // TODO pass source file
    )
  }

  function isAbsoluteFilepath (id) {
    const isAbs = path.isAbsolute(id)

    if (!isAbs) {
      const e = new Error(
        `Paths added or removed must be absolute. You passed ${id}.`
      )

      events.emit('error', e)

      // if no error handler is configured, just stderr it
      if (!events.listeners('error').length) console.error(e)
    }

    return isAbs
  }

  watcher = filewatcher() // single watcher

  watcher.on('change', async (file, stat) => {
    if (stat.deleted) {
      debug('remove', file)

      const { pointer, entryPointers } = tree[file]

      // is an entry itself (self-referential)
      if (entryPointers.includes(pointer)) {
        // only emit if an entry is removed
        events.emit('remove', [ids[pointer]])

        entries.splice(ids[pointer], 1)

        bootstrap() // restart
      } else {
        handleChange(file)

        cleanById(file) // remove any references to removed file
      }
    } else {
      debug('change', file)

      handleChange(file)

      bootstrap() // restart
    }
  })

  return {
    get ids () {
      return ids
    },
    get tree () {
      return tree
    },
    on (ev, fn) {
      return events.on(ev, fn)
    },
    close () {
      events.clear()
      watcher.removeAll()
      watcher.removeAllListeners()
    },
    add (files) {
      files = [].concat(files).filter(entry => {
        // filter out any already watched files
        if (entries.includes(entry)) return false

        return isAbsoluteFilepath(entry)
      })

      entries.push(...files)

      bootstrap()
    },
    remove (files) {
      files = [].concat(files).filter(isAbsoluteFilepath)

      events.emit('remove', files)

      for (const file of files) {
        if (entries.includes(file)) entries.splice(file, 1)
        bootstrap() // just restart here, let diff remove tree
      }
    }
  }
}
