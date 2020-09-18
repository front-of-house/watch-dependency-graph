const fs = require('fs-extra')
const test = require('baretest')('presta')
const assert = require('assert')

const { fixtures, fixturesRoot } = require('./fixtures.js')

const wait = t => new Promise(r => setTimeout(r, t))

function subscribe (instance) {
  return new Promise(r => {
    const close = instance.on('update', ids => {
      close()
      r(ids)
    })
  })
}

test('update main entries', async () => {
  const instance = require('./')(fixtures.A, fixtures.B)

  const A = subscribe(instance)

  fs.outputFileSync(fixtures.A, fs.readFileSync(fixtures.A))

  assert((await A).includes(fixtures.A))

  const B = subscribe(instance)

  fs.outputFileSync(fixtures.B, fs.readFileSync(fixtures.B))

  assert((await B).includes(fixtures.B))

  await instance.close()
})

test('update single child', async () => {
  const instance = require('./')(fixtures.A, fixtures.B)

  const subscriber = subscribe(instance)

  fs.outputFileSync(fixtures.childOfA, fs.readFileSync(fixtures.childOfA))

  const updated = await subscriber

  assert(updated.length >= 1)
  assert(updated.includes(fixtures.A))

  await instance.close()
})

test('update common nested child', async () => {
  const instance = require('./')(fixtures.A, fixtures.B)

  const subscriber = subscribe(instance)

  fs.outputFileSync(
    fixtures.childOfChildren,
    fs.readFileSync(fixtures.childOfChildren)
  )

  const updated = await subscriber

  assert(updated.length >= 2)
  assert(updated.includes(fixtures.A))
  assert(updated.includes(fixtures.B))

  await instance.close()
})

test('update common nested child after ancestor removal', async () => {
  const instance = require('./')(fixtures.A, fixtures.B)

  const A = subscribe(instance)

  fs.outputFileSync(fixtures.childOfA, '') // remove child

  const updatedA = await A

  assert(updatedA.length === 1)
  assert(updatedA[0] === fixtures.A)

  const child = subscribe(instance)

  fs.outputFileSync(
    fixtures.childOfChildren,
    fs.readFileSync(fixtures.childOfChildren)
  )

  assert((await child).pop() === fixtures.B)

  await instance.close()
})

test('ensure shared deps are both mapped to entries', async () => {
  const { register, close } = require('./')(fixtures.A, fixtures.B)

  assert(register[fixtures.commonDep].entries.length === 2)

  await close()
})

test('handles circular deps', async () => {
  fs.outputFileSync(
    fixtures.childOfA,
    `require('${fixtures.childOfChildren}');require('${fixtures.commonDep}')`
  )

  await wait(500)

  const { register, close } = require('./')(fixtures.A, fixtures.B)

  assert(register[fixtures.commonDep].entries.length === 2)

  await close()
})

test('handles case rename as change', async () => {
  const instance = require('./')(fixtures.renameableEntry)

  const subscriber = subscribe(instance)

  fs.renameSync(
    fixtures.renameable,
    fixtures.renameable.replace('renameable', 'Renameable')
  )

  const ids = await subscriber

  assert(ids.includes(fixtures.renameableEntry))

  await instance.close()
})

test('handles file rename by unwatching', async () => {
  const instance = require('./')(fixtures.renameableEntry)

  const subscriber = subscribe(instance)

  const newFile = fixtures.renameable.replace('renameable', 'renameabl')
  fs.renameSync(fixtures.renameable, newFile)
  fs.outputFileSync(newFile, fs.readFileSync(newFile))

  // bump, otherwise ^ those won't fire
  fs.outputFileSync(
    fixtures.renameableEntry,
    fs.readFileSync(fixtures.renameableEntry)
  )

  const ids = await subscriber

  assert(ids.length === 1)
  assert(ids.includes(fixtures.renameableEntry))

  await instance.close()
})

test.skip('handles entry rename by restarting', async () => {
  const instance = require('./')('./fixtures/*.entry.js')

  const subscriber = subscribe(instance)

  const newFile = fixtures.renameableEntry.replace(
    'renameableEntry',
    'renameableEntr'
  )
  fs.renameSync(fixtures.renameableEntry, newFile)

  // bump a watched file, otherwise ^ those won't fire
  fs.outputFileSync(fixtures.A, fs.readFileSync(fixtures.A))

  await subscriber

  console.log(instance.ids)
  assert(instance.ids.includes(newFile))

  await instance.close()
})

!(async function () {
  console.time('test')
  await test.run()
  fs.removeSync(fixturesRoot)
  console.timeEnd('test')
})()
