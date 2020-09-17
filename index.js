const path = require('path')
const { EventEmitter } = require('events')
const chokidar = require('chokidar')
const matched = require('matched')
const uniq = require('@arr/unique')

function walk (
  children,
  entryPointer,
  parentChildren,
  ids,
  register,
  visited = []
) {
  for (const { id, children: childs } of children) {
    // push to all files
    if (!ids.includes(id)) ids.push(id)

    const pointer = ids.indexOf(id)

    // push to previous parent's children
    if (!parentChildren.includes(pointer)) parentChildren.push(pointer)

    // set module values
    if (!register[id]) register[id] = { entries: [], children: [] } // setup
    if (!register[id].entries.includes(entryPointer))
      register[id].entries.push(entryPointer) // set entries

    // recurse, but only if we haven't walked these children yet
    if (Boolean(childs.length && !visited.includes(id))) {
      visited.push(id)
      walk(childs, entryPointer, register[id].children, ids, register, visited)
    }
  }
}

module.exports = function graph (...inputs) {
  const ids = []
  const register = {}
  const events = new EventEmitter()
  const files = uniq(
    inputs
      .flat(2)
      .map(matched.sync)
      .flat(2)
      .map(f => require.resolve(path.resolve(process.cwd(), f)))
  )

  // required, load this module.children
  files.map(require)

  // get module references for the inputs files
  const entries = module.children.filter(c => files.includes(c.id))

  // kick it off
  for (const { id, children } of entries) {
    ids.push(id)

    const entryPointer = ids.indexOf(id) // get pointer

    register[id] = {
      entries: [entryPointer], // self-referential
      children: []
    }

    if (children)
      walk(children, entryPointer, register[id].children, ids, register)
  }

  const watcher = chokidar.watch(ids, { ignoreInitial: true })

  watcher.on('all', (e, f) => {
    const updatedFilepath = require.resolve(f)
    const { entries } = register[updatedFilepath]

    const prev = require.cache[updatedFilepath]
    delete require.cache[updatedFilepath]
    require(updatedFilepath)
    const next = require.cache[updatedFilepath]

    // diff prev/next
    const removedModules = prev.children.filter(
      c => !next.children.find(_c => _c.id === c.id)
    )
    const addedModules = next.children.filter(
      c => !prev.children.find(_c => _c.id === c.id)
    )

    for (const removedModule of removedModules) {
      let isModuleStillInUse = false
      const removedModulePointer = ids.indexOf(removedModule.id)

      for (const filepath of Object.keys(register)) {
        if (filepath === updatedFilepath) {
          const localChildren = register[filepath].children
          const localPointer = localChildren.indexOf(removedModulePointer)

          /*
           * for any entries of the file that changed, remove them from childen
           * of this file
           */
          for (const entryPointer of register[filepath].entries) {
            for (const localChildPointer of localChildren) {
              const localChildFile = ids[localChildPointer]
              const localChildEntries = register[localChildFile].entries
              localChildEntries.splice(
                localChildEntries.indexOf(entryPointer),
                1
              )
            }
          }

          // clean up the children of this file last
          register[filepath].children.splice(localPointer, 1)
        } else {
          // don't accidentally reset back to false on another iteration
          if (isModuleStillInUse) continue

          isModuleStillInUse = register[filepath].children.includes(
            removedModulePointer
          )
        }
      }

      if (!isModuleStillInUse) {
        ids.splice(removedModulePointer, 1)
        delete register[removedModule.id]
        watcher.unwatch(removedModule.id)
      }
    }

    watcher.add(addedModules.map(a => a.id))

    for (const entryPointer of entries) {
      const parentFile = ids[entryPointer]
      walk(
        next.children,
        entryPointer,
        register[parentFile].children,
        ids,
        register
      )
      events.emit('update', ids[entryPointer])
    }
  })

  return {
    ids,
    register,
    on (ev, fn) {
      events.on(ev, fn)
      return () => events.removeListener(ev, fn)
    },
    async close () {
      return watcher.close()
    }
  }
}
