const path = require('path')
const filewatcher = require('filewatcher')
const debug = require('debug')('wdg')

function clearUp (ids, tree, parentPointers) {
  for (const p of parentPointers) {
    const id = ids[p]

    delete require.cache[id]

    clearUp(ids, tree, tree[id].parentPointers)
  }
}

function loadEntries (entries, { cwd }) {
  const files = entries.map(entry => path.resolve(cwd, entry))

  files.forEach(require) // load modules

  const mostRecentChildren = []

  /**
   * children[] keeps growing, so we need to grab the latest
   * modules that match the entries
   *
   * reverse the children, pick the first that match
   */
  for (const c of module.children.reverse()) {
    if (files.includes(c.id)) mostRecentChildren.push(c)
  }

  return mostRecentChildren
}

function walk (modules, context) {
  const { ids, tree, visitedIds = [], entryPointer, parentPointer } = context

  for (const mod of modules) {
    if (!ids.includes(mod.id)) ids.push(mod.id)

    const selfPointer = ids.indexOf(mod.id)

    // setup
    if (!tree[mod.id]) {
      tree[mod.id] = {
        pointer: selfPointer,
        entryPointers: [],
        parentPointers: [],
        childrenPointers: []
      }
    }

    const leaf = tree[mod.id]

    if (entryPointer === undefined) {
      // must be an entry itself
      leaf.entryPointers = [selfPointer]
    } else if (
      entryPointer !== undefined &&
      !leaf.entryPointers.includes(entryPointer)
    ) {
      leaf.entryPointers.push(entryPointer)
    }

    if (
      parentPointer !== undefined &&
      !leaf.parentPointers.includes(parentPointer)
    ) {
      leaf.parentPointers.push(parentPointer)
    }

    const parentLeaf = tree[ids[parentPointer]]

    if (parentLeaf && !parentLeaf.childrenPointers.includes(selfPointer)) {
      parentLeaf.childrenPointers.push(selfPointer)
    }

    if (mod.children.length && !visitedIds.includes(mod.id)) {
      visitedIds.push(mod.id)

      walk(mod.children, {
        ids,
        tree,
        visitedIds,
        entryPointer: entryPointer === undefined ? selfPointer : entryPointer,
        parentPointer: selfPointer
      })
    }
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

module.exports = function graph (options) {
  debug('initialized with', { options })

  const { cwd = process.cwd() } = options

  // once instance
  const events = emitter()

  // all generated from factory
  let ids = []
  let tree = {}
  let watcher
  let modules = []
  let entries = []

  function bootstrap () {
    ids = []
    tree = {}

    try {
      modules = loadEntries(entries, { cwd })
    } catch (e) {
      events.emit('error', e)
      if (!events.listeners('error').length) console.error(e)
    }

    walk(modules, {
      ids,
      tree
    })
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
