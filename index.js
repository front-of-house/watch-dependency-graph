const { EventEmitter } = require('events')
const assert = require('assert')
const chokidar = require('chokidar')
const matched = require('matched')
const uniq = require('@arr/unique')
const debug = require('debug')('wdg')

function walk ({
  ids,
  register,
  entryPointer,
  currentPointer,
  childrenOfCurrent,
  nextChildren,
  visited = []
}) {
  for (const { id, children: childs } of nextChildren) {
    // push to all files
    if (!ids.includes(id)) ids.push(id)

    const pointer = ids.indexOf(id)

    // push to previous parent's children
    if (!childrenOfCurrent.includes(pointer)) childrenOfCurrent.push(pointer)

    // set module values
    if (!register[id])
      register[id] = { pointer, entries: [], children: [], parents: [] } // setup
    if (!register[id].entries.includes(entryPointer))
      register[id].entries.push(entryPointer) // set entries
    if (!register[id].parents.includes(currentPointer))
      register[id].parents.push(currentPointer) // set entries

    // recurse, but only if we haven't walked these children yet
    if (childs.length && !visited.includes(id)) {
      visited.push(id)

      walk({
        ids,
        register,
        entryPointer,
        currentPointer: pointer,
        childrenOfCurrent: register[id].children,
        nextChildren: childs,
        visited
      })
    }
  }
}

function clearParentTree ({ parentPointers, ids, register }) {
  for (const parentPointer of parentPointers) {
    const parentId = ids[parentPointer]

    delete require.cache[parentId]

    clearParentTree({
      parentPointers: register[parentId].parents,
      ids,
      register
    })
  }
}

function getEntries (globs) {
  const files = uniq(globs.map(matched.sync).flat(2))

  files.map(require) // load modules

  return module.children.filter(({ id }) => files.includes(id))
}

module.exports = function graph (...globbies) {
  const globs = globbies.flat(2)

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

    for (const { id, children } of entries) {
      ids.push(id)

      const entryPointer = ids.indexOf(id) // get pointer

      register[id] = {
        pointer: entryPointer,
        entries: [entryPointer], // self-referential
        parents: [],
        children: []
      }

      if (children) {
        walk({
          ids,
          register,
          entryPointer,
          currentPointer: entryPointer,
          childrenOfCurrent: register[id].children,
          nextChildren: children
        })
      }
    }

    watcher = chokidar.watch(globs.concat(ids), { ignoreInitial: true })

    watcher.on('all', async (e, f) => {
      debug('chokidar', e, f)

      const fullEmittedFilepath = require.resolve(f)

      debug('fullEmittedFilepath', fullEmittedFilepath)

      if (e === 'add') {
        await watcher.close()
        events.emit('add', [fullEmittedFilepath])
        init()
        // shouldn't ever happen
      } else if (e === 'unlink') {
        const removedModule = entries.find(e => e.id === f)
        // an *entry* was renamed or removed
        if (removedModule) {
          await watcher.close()
          events.emit('remove', [removedModule.id])
          init()
        } else {
          watcher.unwatch(f)
        }
      } else if (e === 'change') {
        const { entries, parents } = register[fullEmittedFilepath]

        const prev =
          require.cache[fullEmittedFilepath] || require(fullEmittedFilepath)
        delete require.cache[fullEmittedFilepath]
        require(fullEmittedFilepath)
        const next = require.cache[fullEmittedFilepath]

        // diff prev/next
        const removedModuleIds = (prev.children || [])
          .filter(c => !(next.children || []).find(_c => _c.id === c.id))
          .map(c => c.id)

        // add to watch instance
        next.children
          .filter(c => !(prev.children || []).find(_c => _c.id === c.id))
          .forEach(c => watcher.add(c.id))

        for (const removedModuleId of removedModuleIds) {
          let isModuleStillInUse = false
          const removedModulePointer = ids.indexOf(removedModuleId)

          for (const filepath of Object.keys(register)) {
            if (filepath === fullEmittedFilepath) {
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

        // clear modules that require this module
        clearParentTree({ parentPointers: parents, ids, register })

        for (const entryPointer of entries) {
          const fileId = ids[entryPointer]

          // clear entries so users can re-require
          delete require.cache[fileId]

          walk({
            ids,
            register,
            entryPointer,
            currentPointer: entryPointer,
            childrenOfCurrent: register[fileId].children,
            nextChildren: next.children
          })
        }

        events.emit(
          'update',
          entries.map(p => ids[p])
        )
      }
    })
  })()

  return {
    get ids () {
      return ids
    },
    get register () {
      return register
    },
    on (ev, fn) {
      events.on(ev, fn)
      return () => events.removeListener(ev, fn)
    },
    async close () {
      events.removeAllListeners('update')
      events.removeAllListeners('add')
      events.removeAllListeners('remove')
      return watcher.close()
    }
  }
}
