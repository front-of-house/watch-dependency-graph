const fs = require('fs')
const path = require('path')

const fixturesRoot = path.join(__dirname, 'fixtures')
const fixtures = {
  renameable: path.join(fixturesRoot, 'renameable.js'),
  childOfChildren: path.join(fixturesRoot, 'childOfChildren.js'),
  commonDep: path.join(fixturesRoot, 'commonDep.js'),
  childOfA: path.join(fixturesRoot, 'childOfA.js'),
  childOfB: path.join(fixturesRoot, 'childOfB.js'),
  A: path.join(fixturesRoot, 'A.entry.js'),
  B: path.join(fixturesRoot, 'B.entry.js'),
  renameableEntry: path.join(fixturesRoot, 'renameableEntry.entry.js'),
  addedEntry: path.join(fixturesRoot, 'addedEntry.entry.js'),

  // testing cache clearing
  cachedDeepChild: path.join(fixturesRoot, 'cachedDeepChild.js'),
  cachedChild: path.join(fixturesRoot, 'cachedChild.js'),
  cachedEntry: path.join(fixturesRoot, 'cachedEntry.js')
}

try {
  fs.mkdirSync(fixturesRoot)
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e
  }
}

fs.writeFileSync(fixtures.childOfChildren, `module.exports = {}`, 'utf-8')
fs.writeFileSync(fixtures.renameable, `module.exports = {}`, 'utf-8')
fs.writeFileSync(fixtures.commonDep, `module.exports = {}`, 'utf-8')
fs.writeFileSync(
  fixtures.childOfA,
  `require('${fixtures.childOfChildren}')`,
  'utf-8'
)
fs.writeFileSync(
  fixtures.childOfB,
  `require('${fixtures.childOfChildren}')`,
  'utf-8'
)
fs.writeFileSync(
  fixtures.A,
  `import * as A from '${fixtures.childOfA}';import * as commonDep from '${fixtures.commonDep}'`,
  'utf-8'
) // works with imports
fs.writeFileSync(
  fixtures.B,
  `require('${fixtures.childOfB}'); require('${fixtures.commonDep}')`,
  'utf-8'
)
fs.writeFileSync(
  fixtures.renameableEntry,
  `require('${fixtures.renameable}')`,
  'utf-8'
)

fs.writeFileSync(
  fixtures.cachedDeepChild,
  `module.exports = { value: 0 }`,
  'utf-8'
)
fs.writeFileSync(
  fixtures.cachedChild,
  `module.exports = require('./cachedDeepChild')`,
  'utf-8'
)
fs.writeFileSync(
  fixtures.cachedEntry,
  `module.exports = require('./cachedChild')`,
  'utf-8'
)

module.exports = {
  fixtures,
  fixturesRoot
}
