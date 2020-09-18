const path = require('path')
const { EventEmitter } = require('events')
const assert = require('assert')
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

function getEntries (globs) {
  const files = uniq(
    globs
      .flat(2)
      .map(matched.sync)
      .flat(2)
      .map(f => require.resolve(path.resolve(process.cwd(), f)))
  )

  files.map(require) // load modules

  return module.children.filter(({ id }) => files.includes(id))
}

module.exports = function graph (...globs) {
  // once instance
  const events = new EventEmitter()

  // all generated from factory
  let ids = []
  let register = {}
  let entries = []
  let watcher

  // kick it off
  ;(function init () {
    ids = []
    register = {}
    entries = getEntries(globs)

    assert(entries.length, 'No entries found')

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

    watcher = chokidar.watch(ids, { ignoreInitial: true })

    watcher.on('all', async (e, f) => {
      if (e === 'add') {
        // shouldn't ever happen
      } else if (e === 'unlink') {
        // an *entry* was renamed or removed
        if (entries.find(e => e.id === f)) {
          await watcher.close()
          init()
          // const pointer = ids.indexOf(f)

          // // delete from ids and register
          // ids.splice(pointer, 1)
          // delete register[f]

          // // remove any references
          // for (const filepath of Object.keys(register)) {
          //   const { entries, children } = register[filepath]
          //   entries.splice(entries.indexOf(pointer), 1)
          //   children.splice(children.indexOf(pointer), 1)
          // }
        } else {
          watcher.unwatch(f)
        }
      } else if (e === 'change') {
        const updatedFilepath = require.resolve(f)
        const { entries } = register[updatedFilepath]

        const prev = require.cache[updatedFilepath]
        delete require.cache[updatedFilepath]
        require(updatedFilepath)
        const next = require.cache[updatedFilepath]

        // diff prev/next
        const removedModuleIds = prev.children
          .filter(c => !next.children.find(_c => _c.id === c.id))
          .map(c => c.id)

        // add to watch instance
        next.children
          .filter(c => !prev.children.find(_c => _c.id === c.id))
          .forEach(c => watcher.add(c.id))

        for (const removedModuleId of removedModuleIds) {
          let isModuleStillInUse = false
          const removedModulePointer = ids.indexOf(removedModuleId)

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
            delete register[removedModuleId]
            watcher.unwatch(removedModuleId)
          }
        }

        for (const entryPointer of entries) {
          const parentFile = ids[entryPointer]
          walk(
            next.children,
            entryPointer,
            register[parentFile].children,
            ids,
            register
          )
        }

        events.emit(
          'update',
          entries.map(p => ids[p])
        )
      }
    })
  })()

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
