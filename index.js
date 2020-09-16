#! /usr/bin/env node

const path = require('path')
const chokidar = require('chokidar')
const matched = require('matched')
const { uniq } = require('lodash')

const cwd = process.cwd()

const [ command, ...inputs ] = process.argv.slice(2)
const files = uniq(
  inputs.map(matched.sync).flat(2).map(f => require.resolve(path.join(cwd, f)))
)
const modules = files.map(require)
const allFiles = new Set()
const register = { allFiles: new Set(), parents: [] } // TODO SET
const parents = module.children.filter(c => files.includes(c.id))

function walk(children, parent) {
  for (const { id, children: childs } of children) {
    allFiles.add(id)

    if (!register[id]) register[id] = []
    if (!register[id].includes(parent)) register[id].push(parent)
    if (childs) walk(childs, parent)
  }
}

for (const { id, children } of parents) {
  allFiles.add(id)
  register.parents.push(id)
  const index = register.parents.indexOf(id)
  register[id] = [index]
  walk(children, index)
}

const watcher = chokidar.watch(Array.from(allFiles), { ignoreInitial: true })

watcher
  .on('all', (e, f) => {
    const file = require.resolve(f)
    const parentsToUpdate = register[file]

    const prev = require.cache[file]
    delete require.cache[file]
    require(file)
    const next = require.cache[file]
    const removedModules = prev.children
      .filter(c => !next.children.find(_c => _c.id === c.id))
    const addedModules = next.children
      .filter(c => !prev.children.find(_c => _c.id === c.id))

    /**
     * Removing a dep of a nested child module shouldn't remove the parents because it might be used elsewhere in the tree. Can I keep a hash of all modules to see if it's used, similar to parents but a list of all modules?
     */
    for (const r of removedModules) {
      for (const parent of parentsToUpdate) {
        register[r.id].splice(register[r.id].indexOf(parent), 1)
      }

      const isStillUsed = Boolean(register[r.id].length)

      if (!isStillUsed) {
        allFiles.delete(r.id)
        delete register[r.id]
        watcher.unwatch(r.id)
      }
    }

    for (const a of addedModules) {
      watcher.add(a.id)
    }

    for (const parent of parentsToUpdate) {
      for (const a of addedModules) {
        walk([a], parent)
      }

      console.log('page', register.parents[parent])
    }

    console.log('register', register)
    console.log('files', allFiles.size)
  })
