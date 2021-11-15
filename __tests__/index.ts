import fs from 'fs-extra'
import tap from 'tap'
import path from 'path'

import {
  create,
  walk,
  remove,
  findTopmostParents,
  createEmitter,
  resolveAliases,
  cleanCodeForParsing,
  getChildrenModuleIds,
  clearCacheUp,
} from '../'

const fixtures = path.join(__dirname, '../fixtures')

tap.teardown(() => fs.removeSync(fixtures))

tap.test('events', async (t) => {
  t.test('createEmitter', async (t) => {
    const emitter = createEmitter()

    t.plan(3)

    const remove = emitter.on('a', t.pass)

    emitter.emit('a')

    remove()

    emitter.emit('a')

    emitter.on('a', t.pass)

    emitter.emit('a')

    emitter.clear()

    emitter.emit('a')

    const emitter2 = createEmitter()

    emitter2.on('b', t.pass)

    t.ok(emitter2.listeners('b').length)
  })
})

tap.test('resolve alias', async (t) => {
  t.equal(resolveAliases('@/baz.js', { '@': 'foo/bar' }), 'foo/bar/baz.js')
  t.equal(resolveAliases('foo/bar/baz.js'), 'foo/bar/baz.js')
  t.equal(resolveAliases('@/baz.js', { '@': './' }), './baz.js')
})

tap.test('cleanCodeForParsing', async (t) => {
  t.equal(cleanCodeForParsing(`/*comment*/import foo from 'bar'// foo`), `import foo from 'bar'`)
  t.equal(cleanCodeForParsing(`(() => import('bar'))()`), `import('bar')`)
})

tap.test('getChildrenModuleIds', async (t) => {
  const dir = t.testdir({
    'shared.js': `export default 'shared'`,
    'a.js': `import shared from './shared';const c = 'hello'`,
    'a.jsx': `import shared from './shared';const c = <h1>hello</h1>;`,
    'alias.js': `import shared from '@/shared.js'`,
    'invalid.js': `import shared from '#/shared.js'`,
  })

  const shared = path.join(dir, 'shared.js')
  const js = path.join(dir, 'a.js')
  const jsx = path.join(dir, 'a.jsx')
  const alias = path.join(dir, 'alias.js')
  const invalid = path.join(dir, 'invalid.js')

  t.same(await getChildrenModuleIds(js), [shared])
  t.same(
    // throws, falls to cleanCodeForParsing
    await getChildrenModuleIds(jsx),
    [shared]
  )
  t.same(await getChildrenModuleIds(alias, { alias: { '@': './' } }), [shared])

  try {
    await getChildrenModuleIds(invalid, { alias: { '@': './' } })
    t.fail()
  } catch (e) {
    t.pass()
  }
})

tap.test('clearCacheUp', async (t) => {
  const dir = t.testdir({
    'a.js': `
      import aa from './aa'
      export default 'a'
    `,
    'aa.js': `
      import aaa from './aaa'
      export default 'aa'
    `,
    'aaa.js': `
      export default 'aaa'
    `,
  })

  const a = path.join(dir, 'a.js')
  const aaa = path.join(dir, 'aaa.js')

  const tree = {}
  await walk(a, tree)

  clearCacheUp(aaa, tree)
})

tap.test('base', async (t) => {
  const dir = t.testdir({
    'a.js': `
      import aa from './aa'
      import ab from './ab'
      import ac from './ac'
      export default 'a'
    `,
    'aa.js': `
      import aaa from './aaa'
      export default 'aa'
    `,
    'aaa.js': `
      export default 'aaa'
    `,
    'ab.js': `
      export default 'ab'
    `,
    'ac.js': `
      import aa from './aa'
      import ab from './ab'
      export default 'ac'
    `,
  })

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')
  const aaa = path.join(dir, 'aaa.js')
  const ab = path.join(dir, 'ab.js')
  const ac = path.join(dir, 'ac.js')

  const tree = await walk(a, {})

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [aa, ab, ac],
    },
    [aa]: {
      entry: false,
      parents: [a, ac],
      children: [aaa],
    },
    [aaa]: {
      entry: false,
      parents: [aa],
      children: [],
    },
    [ab]: {
      entry: false,
      parents: [a, ac],
      children: [],
    },
    [ac]: {
      entry: false,
      parents: [a],
      children: [aa, ab],
    },
  })
})

tap.test('circular', async (t) => {
  const dir = t.testdir({
    'a.js': `
      import aa from './aa'
      export default 'a'
    `,
    'aa.js': `
      import a from './a'
      export default 'aa'
    `,
  })

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')

  const tree = await walk(a, {})

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [aa],
      children: [aa],
    },
    [aa]: {
      entry: false,
      parents: [a],
      children: [a],
    },
  })
})

tap.test('non-js file', async (t) => {
  const dir = t.testdir({
    'a.js': `
      import aa from './aa.png'
      export default 'a'
    `,
    'aa.png': `blob`,
  })

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.png')

  const tree = await walk(a, {})

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [aa],
    },
    [aa]: {
      entry: false,
      parents: [a],
      children: [],
    },
  })
})

tap.test('remove', async (t) => {
  const dir = t.testdir({
    'a.js': `
      import aa from './aa'
      import ab from './ab'
      export default 'a'
    `,
    'aa.js': `
      import ab from './ab'
      export default 'aa'
    `,
    'ab.js': `
      export default 'ab'
    `,
  })

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')
  const ab = path.join(dir, 'ab.js')

  const tree = await walk(a, {})

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [aa, ab],
    },
    [aa]: {
      entry: false,
      parents: [a],
      children: [ab],
    },
    [ab]: {
      entry: false,
      parents: [aa, a],
      children: [],
    },
  })

  remove(ab, tree)

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [aa],
    },
    [aa]: {
      entry: false,
      parents: [a],
      children: [],
    },
  })
})

tap.test('remove import removes files', async (t) => {
  const dir = t.testdir({
    'a.js': `
      import aa from './aa'
      export default 'a'
    `,
    'aa.js': `
      import aaa from './aaa'
      export default 'aa'
    `,
    'aaa.js': `
      import aaaa from './aaaa'
      export default 'aaa'
    `,
    'aaaa.js': `
      export default 'aaaa'
    `,
  })

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')
  const aaa = path.join(dir, 'aaa.js')
  const aaaa = path.join(dir, 'aaaa.js')

  const tree = await walk(a, {})

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [aa],
    },
    [aa]: {
      entry: false,
      parents: [a],
      children: [aaa],
    },
    [aaa]: {
      entry: false,
      parents: [aa],
      children: [aaaa],
    },
    [aaaa]: {
      entry: false,
      parents: [aaa],
      children: [],
    },
  })

  t.testdir({
    'a.js': `
      export default 'a'
    `,
  })

  await walk(a, tree)

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [],
    },
  })
})

tap.test('partial walk', async (t) => {
  const dir = t.testdir({
    'a.js': `
      import aa from './aa'
      export default 'a'
    `,
    'aa.js': `
      export default 'aa'
    `,
  })

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')

  const tree = await walk(a, {})

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [aa],
    },
    [aa]: {
      entry: false,
      parents: [a],
      children: [],
    },
  })

  t.testdir({
    'a.js': `
      import aa from './aa'
      export default 'a'
    `,
    'aa.js': `
      import aaa from './aaa'
      export default 'aa'
    `,
    'aaa.js': `
      import a from './a'
      export default 'aaa'
    `,
  })

  const aaa = path.join(dir, 'aaa.js')
  const updated = await walk(aa, tree, {})

  t.same(updated, {
    [a]: {
      entry: true,
      parents: [aaa],
      children: [aa],
    },
    [aa]: {
      entry: false,
      parents: [a],
      children: [aaa],
    },
    [aaa]: {
      entry: false,
      parents: [aa],
      children: [a],
    },
  })
})

tap.test('find top-most parents', async (t) => {
  const dir = t.testdir({
    'shared.js': `
      export default 'shared'
    `,
    'a.js': `
      import shared from './shared'
      export default 'a'
    `,
    'b.js': `
      import shared from './shared'
      export default 'b'
    `,
    'c.js': `
      import shared from './shared'
      export default 'c'
    `,
  })

  const shared = path.join(dir, 'shared.js')
  const a = path.join(dir, 'a.js')
  const b = path.join(dir, 'b.js')
  const c = path.join(dir, 'c.js')

  const tree = {}
  await walk(a, tree)
  await walk(b, tree)
  await walk(c, tree)

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [],
      children: [shared],
    },
    [b]: {
      entry: true,
      parents: [],
      children: [shared],
    },
    [c]: {
      entry: true,
      parents: [],
      children: [shared],
    },
    [shared]: {
      entry: false,
      parents: [a, b, c],
      children: [],
    },
  })

  t.same([a, b, c], findTopmostParents(shared, tree))

  t.testdir({
    'shared.js': `
      export default 'shared'
    `,
    'a.js': `
      import shared from './shared'
      export default 'a'
    `,
    'b.js': `
      import shared from './shared'
      import a from './a'
      export default 'b'
    `,
    'c.js': `
      import shared from './shared'
      import b from './b'
      export default 'c'
    `,
  })

  await walk(b, tree)
  await walk(c, tree)

  t.same(tree, {
    [a]: {
      entry: true,
      parents: [b],
      children: [shared],
    },
    [b]: {
      entry: true,
      parents: [c],
      children: [shared, a],
    },
    [c]: {
      entry: true,
      parents: [],
      children: [shared, b],
    },
    [shared]: {
      entry: false,
      parents: [a, b, c],
      children: [],
    },
  })

  t.same([a, b, c], findTopmostParents(shared, tree))
  t.same([a, b, c], findTopmostParents(a, tree))
  t.same([b, c], findTopmostParents(b, tree))
  t.same([c], findTopmostParents(c, tree))
})

tap.test('create - add non-abs path', async (t) => {
  t.plan(1)

  const watcher = create()

  watcher.on('error', () => {
    t.pass()
  })

  await watcher.add('./foo.js')

  watcher.close()
})

tap.test('create - add basic tree', async (t) => {
  t.plan(5)

  const dir = path.join(fixtures, 'create')

  fs.removeSync(dir)
  fs.mkdirpSync(dir)

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')
  const aaa = path.join(dir, 'aaa.js')
  const b = path.join(dir, 'b.js')

  fs.writeFileSync(a, `import aa from './aa';export default 'a'`, 'utf8')
  fs.writeFileSync(aa, `import aaa from './aaa';export default 'aa'`, 'utf8')
  fs.writeFileSync(aaa, `export default 'aaa'`, 'utf8')
  fs.writeFileSync(b, `import notFound from './not-found';export default 'b'`, 'utf8')

  const watcher = create()

  const removeAddListener = watcher.on('add', () => {
    t.pass()
  })

  await watcher.add(a)

  t.ok(watcher.tree[a])
  t.ok(watcher.tree[aa])
  t.ok(watcher.tree[aaa])

  removeAddListener()

  watcher.on('error', () => {
    t.pass()
  })

  await watcher.add(b)

  watcher.close()
})

tap.test('create - change handler', async (t) => {
  const dir = path.join(fixtures, 'create-change')

  fs.removeSync(dir)
  fs.mkdirpSync(dir)

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')
  const aaa = path.join(dir, 'aaa.js')

  fs.writeFileSync(a, `import aa from './aa';export default 'a'`, 'utf8')
  fs.writeFileSync(aa, `export default 'aa'`, 'utf8')
  fs.writeFileSync(aaa, `export default 'aaa'`, 'utf8')

  const watcher = create()
  await watcher.add(a)

  // add an import
  const aaChange = new Promise((r) => watcher.on('change', r))
  fs.writeFileSync(aa, `import aaa from './aaa';export default 'aa'`, 'utf8')
  const aaResult = await aaChange
  t.same(aaResult, [a]) // entry
  t.ok(watcher.tree[aaa]) // added

  // remove file that would causes error
  const aaaChange = new Promise((r) => watcher.on('change', r))
  fs.removeSync(aaa)
  const aaaResult = await aaaChange
  t.same(aaaResult, [a]) // entry
  t.notOk(watcher.tree[aaa]) // removed

  // remove file that reports 'remove'
  const aRemove = new Promise((r) => watcher.on('remove', r))
  fs.removeSync(a)
  const aResult = await aRemove
  t.same(aResult, [a]) // entry
  t.same(watcher.tree, {}) // cleaned up

  watcher.close()
})

tap.test('create - remove entry', async (t) => {
  const dir = path.join(fixtures, 'create-remove')

  fs.removeSync(dir)
  fs.mkdirpSync(dir)

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')
  const aaa = path.join(dir, 'aaa.js')

  fs.writeFileSync(a, `import aa from './aa';export default 'a'`, 'utf8')
  fs.writeFileSync(aa, `import aaa from './aaa';export default 'aa'`, 'utf8')
  fs.writeFileSync(aaa, `export default 'aaa'`, 'utf8')

  const watcher = create()

  await watcher.add(a)

  const listener = new Promise((r) => watcher.on('remove', r))

  watcher.remove(a)

  const files = await listener

  t.same(files, [a])

  watcher.close()
})

tap.test('create - remove children, entry-as-child', async (t) => {
  const dir = path.join(fixtures, 'create-remove-child')

  fs.removeSync(dir)
  fs.mkdirpSync(dir)

  const a = path.join(dir, 'a.js')
  const aa = path.join(dir, 'aa.js')
  const aaa = path.join(dir, 'aaa.js')
  const b = path.join(dir, 'b.js')

  fs.writeFileSync(a, `import aa from './aa';export default 'a'`, 'utf8')
  fs.writeFileSync(aa, `import aaa from './aaa';export default 'aa'`, 'utf8')
  fs.writeFileSync(aaa, `export default 'aaa'`, 'utf8')
  fs.writeFileSync(b, `import a from './a';export default 'b'`, 'utf8')

  const watcher = create()

  await watcher.add([a, b])

  const aaaRemovalListener = new Promise((r) => watcher.on('change', r))
  fs.writeFileSync(aa, `export default 'aa'`, 'utf8')
  await aaaRemovalListener
  // removed, not an entry and no longer referenced
  t.notOk(watcher.tree[aaa])

  const bChangeListener = new Promise((r) => watcher.on('change', r))
  fs.writeFileSync(b, `export default 'b'`, 'utf8')
  await bChangeListener
  // still there even though no longer referenced bc it's an entry
  t.ok(watcher.tree[a])

  watcher.close()
})
