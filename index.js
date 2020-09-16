const path = require('path')
const { EventEmitter } = require('events')
const chokidar = require('chokidar')
const matched = require('matched')
const { uniq } = require('lodash')

const cwd = process.cwd()

module.exports = function graph(command, inputs) {
  const events = new EventEmitter()

  const files = uniq(
    inputs.map(matched.sync).flat(2).map(f => require.resolve(path.join(cwd, f)))
  )

  files.map(require) // required, load this module.children

  const ids = []
  const register = {}
  const parents = module.children.filter(c => files.includes(c.id))

  function walk(children, parentIndex, parentChildren) {
    for (const { id, children: childs } of children) {
      // push to all files
      if (!ids.includes(id)) ids.push(id)

      const index = ids.indexOf(id)

      // push to previous parent's children
      if (!parentChildren.includes(index)) parentChildren.push(index)

      // set module values
      if (!register[id]) register[id] = { roots: [], children: [] } // setup
      if (!register[id].roots.includes(parentIndex)) register[id].roots.push(parentIndex) // set roots

      // recurse
      if (childs.length) walk(childs, parentIndex, register[id].children)
    }
  }

  for (const { id, children } of parents) {
    ids.push(id)

    const index = ids.indexOf(id)

    register[id] = {
      roots: [index],
      children: [],
    }

    if (children) walk(children, index, register[id].children)
  }

  const watcher = chokidar.watch(ids, { ignoreInitial: true })

  watcher
    .on('all', (e, f) => {
      const file = require.resolve(f)
      const { roots: parentsToUpdate } = register[file]

      const prev = require.cache[file]
      delete require.cache[file]
      require(file)
      const next = require.cache[file]
      const removedModules = prev.children
        .filter(c => !next.children.find(_c => _c.id === c.id))
      const addedModules = next.children
        .filter(c => !prev.children.find(_c => _c.id === c.id))

      // console.log('added', addedModules.map(r => r.id))
      // console.log('removed', removedModules.map(r => r.id))

      for (const removed of removedModules) {
        let isInUse = false
        const pointer = ids.indexOf(removed.id)

        for (const key of Object.keys(register)) {
          if (key === file) {
            // the file that updated
            register[key].children.splice(register[key].children.indexOf(pointer), 1)
          } else {
            if (isInUse) continue; // don't accidentally reset back to false on another iteration
            isInUse = register[key].children.includes(pointer)
          }
        }

        if (!isInUse) {
          ids.splice(pointer, 1)
          delete register[removed.id]
          watcher.unwatch(removed.id)
        }
      }

      for (const a of addedModules) {
        watcher.add(a.id)
      }

      for (const parentIndex of parentsToUpdate) {
        const parentFile = ids[parentIndex]
        walk(next.children, parentIndex, register[parentFile].children)
        events.emit('update', require.cache[ids[parentIndex]])
      }

      // console.log(ids)
      // console.log(register)
    })

  return {
    ids,
    register,
    on(ev, fn) {
      events.on(ev, fn)
      return () => events.removeListener(ev, fn)
    },
    close() {
      watcher.close()
    }
  }
}
