const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const debug = require('debug')('wdg')
const filewatcher = require('filewatcher')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default

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
 * Read file, parse, traverse, resolve children modules IDs
 */
function getChildrenModuleIds ({ id, alias }) {
  const raw = fs.readFileSync(id, 'utf-8')
  const ast = parser.parse(raw, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript', 'dynamicImport']
  })

  const children = []

  traverse(ast, {
    enter (path) {
      if (path.node.type === 'CallExpression') {
        const callee = path.get('callee')
        const isDynamicImport = callee.isImport()
        if (callee.isIdentifier({ name: 'require' }) || isDynamicImport) {
          const arg = path.node.arguments[0]
          if (arg.type === 'StringLiteral') {
            children.push(arg.value)
          } else {
            children.push(src.slice(arg.start, arg.end))
          }
        }
      } else if (
        path.node.type === 'ImportDeclaration' ||
        path.node.type === 'ExportNamedDeclaration' ||
        path.node.type === 'ExportAllDeclaration'
      ) {
        const { source } = path.node
        if (source && source.value) {
          children.push(source.value)
        }
      }
    }
  })

  return children
    .map(moduleId => {
      const req = createRequire(id)
      let resolved

      try {
        resolved = req.resolve(moduleId)
      } catch (e1) {
        try {
          resolved = req.resolve(resolveAliases(moduleId, alias))
        } catch (e2) {
          resolved = require.resolve(moduleId)
        }
      }

      // same same, must be built-in module
      return resolved === moduleId ? undefined : resolved
    })
    .filter(Boolean)
}

module.exports = function graph ({ alias = {} } = {}) {
  debug('initialized with', { alias })

  // once instance
  const events = emitter()

  let ids = [] // list of all file IDs
  let tree = {} // graph of modules
  const watcher = filewatcher() // filewatcher instance
  let entryIds = [] // top level entry files

  /**
   * Clean tree by module ID, removing leafs and unwatching if de-referenced
   */
  function cleanById (id) {
    // target leaf
    const { pointer, parentPointers, childrenPointers } = tree[id]

    // de-reference this module from its parents
    for (const p of parentPointers) {
      const children = tree[ids[p]].childrenPointers
      children.splice(children.indexOf(pointer), 1)
    }

    for (const p of childrenPointers) {
      // de-reference this module from its children
      const parents = tree[ids[p]].parentPointers
      parents.splice(parents.indexOf(pointer), 1)

      // de-reference this module from its entries
      const entries = tree[ids[p]].entryPointers
      if (entries.includes(pointer)) {
        entries.splice(entries.indexOf(pointer), 1)
      }

      // if no longer referenced, clean again
      if (entries.length === 0 || parents.length === 0) {
        cleanById(ids[p])
      }
    }

    // delete target leaf and unwatch, DO THIS LAST
    delete tree[id]
    watcher.remove(id)
  }

  /*
   * Walk a file, creating trees and leafs as needed. If the file has
   * deps, find those and walk them too.
   *
   * Also used to walk a leaf directly, in which case bootstrapping will be false
   */
  function walk (id, context) {
    let { entryPointer, parentPointer, visitedIds, bootstrapping } = context

    // on first call of walk with a fresh entry
    const isEntry = entryPointer === undefined
    // non-js files can be indexed by not walked
    const isTraversable = /^\.(j|t)sx?$/.test(path.extname(id))

    // ignore any IDs that we've already walked from a given entrypoint
    if (!visitedIds.includes(id)) {
      // note that we've visited this ID while walking the current entry
      visitedIds.push(id)

      // watch any file we pass to watch, even if we can't traverse it
      watcher.add(id)

      // IDs should be unique
      if (!ids.includes(id)) ids.push(id)

      // current file
      const pointer = ids.indexOf(id)

      // if this is an entry, it should be self referential
      entryPointer = isEntry ? pointer : entryPointer
      // if this is an entry, set up the parentPointer for the next walk
      parentPointer = isEntry ? pointer : parentPointer

      // create tree leaf if not exists
      if (!tree[id]) {
        tree[id] = {
          pointer,
          entryPointers: [entryPointer],
          // entry has no parent
          parentPointers: isEntry ? [] : [parentPointer],
          childrenPointers: []
        }
      }

      // reference our new or old leaf, and its parent
      const leaf = tree[id]
      const parentLeaf = tree[ids[parentPointer]]

      // every leaf should point back to the entry that kicked it off
      if (!leaf.entryPointers.includes(entryPointer))
        leaf.entryPointers.push(entryPointer)

      if (!isEntry) {
        /*
         * Push parent pointer, if not an entry (no parent)
         */
        if (!leaf.parentPointers.includes(parentPointer))
          leaf.parentPointers.push(parentPointer)

        /*
         * Push current child to its parent, if not an entry (no parent)
         */
        if (!parentLeaf.childrenPointers.includes(pointer))
          parentLeaf.childrenPointers.push(pointer)
      }

      // if not walkable, we've done as much as we can
      if (!isTraversable) return

      try {
        const childModuleIds = isTraversable
          ? getChildrenModuleIds({ id, alias })
          : []

        // if this isn't the first time we've traversed this leaf, check for any removed modules
        if (!bootstrapping) {
          for (const _pointer of leaf.childrenPointers) {
            if (!childModuleIds.includes(ids[_pointer])) {
              cleanById(ids[_pointer])
            }
          }
        }

        // walk each child module if it hasn't already been done
        for (const _id of childModuleIds) {
          if (!parentLeaf.childrenPointers.includes(ids.indexOf(_id))) {
            walk(_id, {
              entryPointer,
              parentPointer: pointer,
              visitedIds,
              bootstrapping
            })
          }
        }
      } catch (e) {
        debug('walk error', e)

        // overwrite to localize error
        if (e instanceof SyntaxError) {
          e = new SyntaxError(e.message, id, e.lineNumber)
        }

        // if no error handler is configured, just stderr it
        if (!events.listeners('error').length) console.error(e)

        events.emit('error', e)
      }
    }
  }

  function handleChange (file) {
    const { entryPointers } = tree[file]

    // bust cache for all involved files up the tree
    clearUp(ids, tree, [ids.indexOf(file)])

    // only emit which entryIds changed
    events.emit(
      'change',
      entryPointers.map(p => ids[p]) // TODO pass source file
    )
  }

  /**
   * Validates that entry filepaths are absolute and notifies the user if they are not
   */
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

  /**
   * Main handler
   */
  watcher.on('change', async (file, stat) => {
    const { pointer, entryPointers } = tree[file]
    const isEntry = entryPointers.includes(pointer)

    if (stat.deleted) {
      debug('remove', file)

      // is an entry itself (self-referential)
      if (isEntry) {
        // only emit if an entry is removed
        events.emit('remove', [ids[pointer]])

        entryIds.splice(ids[pointer], 1)

        cleanById(file) // remove any references to removed file
      } else {
        handleChange(file)

        cleanById(file) // remove any references to removed file
      }
    } else {
      debug('change', file)

      handleChange(file)

      // fabricate entry/parent pointers if we're jumping into a leaf and not an entry
      walk(file, {
        visitedIds: [],
        entryPointer: isEntry ? undefined : tree[file].entryPointers[0],
        parentPointer: isEntry ? undefined : tree[file].parentPointers[0]
      })
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
        if (entryIds.includes(entry)) return false

        return isAbsoluteFilepath(entry)
      })

      events.emit('add', files)

      entryIds.push(...files)

      // walk each entry
      for (const id of entryIds) {
        walk(id, {
          visitedIds: [],
          bootstrapping: true
        })
      }
    },
    remove (files) {
      files = [].concat(files).filter(isAbsoluteFilepath)

      events.emit('remove', files)

      for (const file of files) {
        if (entryIds.includes(file)) {
          entryIds.splice(entryIds.indexOf(file), 1)

          cleanById(file)
        }
      }
    }
  }
}
