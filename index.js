const path = require('path')
const { EventEmitter } = require('events')
const chokidar = require('chokidar')
const matched = require('matched')
const uniq = require('@arr/unique')

function walk(children, parentIndex, parentChildren, ids, register, visited = []) {
  for (const { id, children: childs } of children) {
    // push to all files
    if (!ids.includes(id)) ids.push(id)

    const index = ids.indexOf(id)

    // push to previous parent's children
    if (!parentChildren.includes(index)) parentChildren.push(index)

    // set module values
    if (!register[id]) register[id] = { roots: [], children: [] } // setup
    if (!register[id].roots.includes(parentIndex)) register[id].roots.push(parentIndex) // set roots

    // recurse, but only if we haven't walked these children yet
    if (Boolean(childs.length && !visited.includes(id))) {
      visited.push(id)
      walk(childs, parentIndex, register[id].children, ids, register, visited)
    }
  }
}

module.exports = function graph(...inputs) {
  const events = new EventEmitter()
  const files = uniq(
    inputs.flat(2).map(matched.sync).flat(2).map(f => require.resolve(path.resolve(process.cwd(), f)))
  )

  // required, load this module.children
  files.map(require)

  const ids = []
  const register = {}
  const entries = module.children.filter(c => files.includes(c.id))

  // kick it off
  for (const { id, children } of entries) {
    ids.push(id)

    const index = ids.indexOf(id)

    register[id] = {
      roots: [index],
      children: [],
    }

    if (children) walk(children, index, register[id].children, ids, register)
  }

  const watcher = chokidar.watch(ids, { ignoreInitial: true })

  watcher
    .on('all', (e, f) => {
      const updatedFilepath = require.resolve(f)
      const { roots: parentsToUpdate } = register[updatedFilepath]

      const prev = require.cache[updatedFilepath]
      delete require.cache[updatedFilepath]
      require(updatedFilepath)
      const next = require.cache[updatedFilepath]

      // diff prev/next
      const removedModules = prev.children
        .filter(c => !next.children.find(_c => _c.id === c.id))
      const addedModules = next.children
        .filter(c => !prev.children.find(_c => _c.id === c.id))

      for (const removedModule of removedModules) {
        let isModuleStillInUse = false
        const removedModuleIndex = ids.indexOf(removedModule.id)

        for (const filepath of Object.keys(register)) {
          if (filepath === updatedFilepath) {
            const localChildren = register[filepath].children
            const localIndex = localChildren.indexOf(removedModuleIndex)

            /*
             * for any roots of the file that changed, remove them from childen
             * of this file
             */
            for (const rootIndex of register[filepath].roots) {
              for (const localChildIndex of localChildren) {
                const localChildFile = ids[localChildIndex]
                const localChildFileRoots = register[localChildFile].roots
                localChildFileRoots.splice(localChildFileRoots.indexOf(rootIndex), 1)
              }
            }

            // clean up the children of this file last
            register[filepath].children.splice(localIndex, 1)
          } else {
            // don't accidentally reset back to false on another iteration
            if (isModuleStillInUse) continue

            isModuleStillInUse = register[filepath].children.includes(removedModuleIndex)
          }
        }

        if (!isModuleStillInUse) {
          ids.splice(removedModuleIndex, 1)
          delete register[removedModule.id]
          watcher.unwatch(removedModule.id)
        }
      }

      watcher.add(addedModules.map(a => a.id))

      for (const parentIndex of parentsToUpdate) {
        const parentFile = ids[parentIndex]
        walk(next.children, parentIndex, register[parentFile].children, ids, register)
        events.emit('update', ids[parentIndex])
      }
    })

  return {
    ids,
    register,
    on(ev, fn) {
      events.on(ev, fn)
      return () => events.removeListener(ev, fn)
    },
    async close() {
      return watcher.close()
    }
  }
}
