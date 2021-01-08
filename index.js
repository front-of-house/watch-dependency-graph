const fs = require('fs')
const path = require('path')
const filewatcher = require('filewatcher')
const debug = require('debug')('wdg')
const acorn = require('acorn-loose')
const walker = require('acorn-walk')
const { createRequire } = require('module')

function clearUp (ids, tree, parentPointers) {
  for (const p of parentPointers) {
    const id = ids[p]

    delete require.cache[id]

    clearUp(ids, tree, tree[id].parentPointers)
  }
}

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

function getFileIdsFromAstNode (node, { workingDirectory }) {
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
      const req = createRequire(workingDirectory)
      let resolved

      try {
        resolved = req.resolve(id)
      } catch (e) {
        resolved = /^@/.test(id)
          ? req.resolve(path.join(process.cwd(), id.split('@')[1]))
          : require.resolve(id)
      }

      return resolved === id ? undefined : resolved
    })
    .filter(Boolean)
}

function walk (id, context) {
  const { ids, tree, entryPointer, parentPointer, visitedTree = {} } = context

  if (!ids.includes(id)) ids.push(id)

  const pointer = ids.indexOf(id)

  if (!tree[id]) {
    tree[id] = {
      pointer,
      entryPointers: [entryPointer],
      parentPointers: [parentPointer],
      childrenPointers: []
    }
  } else {
    const leaf = tree[id]
    if (!leaf.entryPointers.includes(entryPointer))
      leaf.entryPointers.push(entryPointer)
    if (!leaf.parentPointers.includes(parentPointer))
      leaf.parentPointers.push(parentPointer)
  }

  const parentLeaf = tree[ids[parentPointer]]

  if (!parentLeaf.childrenPointers.includes(pointer))
    parentLeaf.childrenPointers.push(pointer)

  const visitedLeaf = visitedTree[ids[entryPointer]]

  if (!visitedLeaf.includes(id)) {
    visitedLeaf.push(id)

    try {
      const ast = acorn.parse(fs.readFileSync(id, 'utf-8'), {
        ecmaVersion: 2015,
        sourceType: 'module'
      })
      const workingDirectory = id

      for (const node of ast.body) {
        for (const _id of getFileIdsFromAstNode(node, { workingDirectory })) {
          walk(_id, {
            ids,
            tree,
            entryPointer,
            parentPointer: pointer,
            visitedTree
          })
        }
      }
    } catch (e) {
      console.error(e)
    }
  }
}

module.exports = function graph (options = {}) {
  debug('initialized with', { options })

  // once instance
  const events = emitter()

  // all generated from factory
  let ids = []
  let tree = {}
  let watcher
  let entries = []

  function bootstrap () {
    debug('bootstrapping', entries)

    ids = []
    tree = {}

    const visitedTree = {}

    for (const id of entries) {
      if (!ids.includes(id)) ids.push(id)

      const pointer = ids.indexOf(id)

      if (!tree[id]) {
        tree[id] = {
          pointer,
          entryPointers: [pointer],
          parentPointers: [],
          childrenPointers: []
        }
      } else {
        if (!tree[id].entryPointers.includes(pointer))
          tree[id].entryPointers.push(pointer)
      }

      visitedTree[id] = []

      const workingDirectory = id
      const ast = acorn.parse(fs.readFileSync(id, 'utf-8'), {
        ecmaVersion: 2015,
        sourceType: 'module'
      })

      for (const node of ast.body) {
        for (const _id of getFileIdsFromAstNode(node, { workingDirectory })) {
          walk(_id, {
            ids,
            tree,
            entryPointer: pointer,
            parentPointer: pointer,
            visitedTree
          })
        }
      }
    }
  }

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
  function restart () {
    const prevIds = ids

    bootstrap()

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

    events.emit(
      'change',
      entryPointers.map(p => ids[p])
    )
  }

  watcher = filewatcher()

  watcher.on('change', async (file, stat) => {
    if (stat.deleted) {
      debug('remove', file)

      const { pointer, entryPointers } = tree[file]

      // is an entry itself
      if (entryPointers.includes(pointer)) {
        events.emit('remove', [ids[pointer]])

        entries.splice(ids[pointer], 1)

        restart()
      } else {
        handleChange(file)
        cleanById(file)
      }
    } else {
      debug('change', file)

      handleChange(file)

      restart()
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

        const isAbs = path.isAbsolute(entry)

        if (!isAbs) {
          events.emit(
            'error',
            new Error(
              `Watched file must be an absolute path, you passed ${entry}. Ignoring...`
            )
          )
        }

        return isAbs
      })

      entries.push(...files)

      restart()
    },
    remove (files) {
      files = [].concat(files).filter(entry => {
        const isAbs = path.isAbsolute(entry)

        if (!isAbs) {
          events.emit(
            'error',
            new Error(
              `Files to remove must be absolute paths, you passed ${entry}. Ignoring...`
            )
          )
        }

        return isAbs
      })

      events.emit('remove', files)

      for (const file of files) {
        if (entries.includes(file)) entries.splice(file, 1)
        restart()
      }
    }
  }
}
