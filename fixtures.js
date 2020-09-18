const fs = require('fs-extra')
const path = require('path')

const fixturesRoot = path.join(__dirname, 'fixtures')
const fixtures = {
  childOfChildren: path.join(fixturesRoot, 'childOfChildren.js'),
  commonDep: path.join(fixturesRoot, 'commonDep.js'),
  childOfA: path.join(fixturesRoot, 'childOfA.js'),
  childOfB: path.join(fixturesRoot, 'childOfB.js'),
  A: path.join(fixturesRoot, 'A.js'),
  B: path.join(fixturesRoot, 'B.js')
}

fs.ensureDirSync(fixturesRoot)
fs.ensureDirSync(fixturesRoot)
fs.outputFileSync(fixtures.childOfChildren, `module.exports = {}`)
fs.outputFileSync(fixtures.commonDep, `module.exports = {}`)
fs.outputFileSync(fixtures.childOfA, `require('${fixtures.childOfChildren}')`)
fs.outputFileSync(fixtures.childOfB, `require('${fixtures.childOfChildren}')`)
fs.outputFileSync(
  fixtures.A,
  `import * as A from '${fixtures.childOfA}';import * as commonDep from '${fixtures.commonDep}'`
) // works with imports
fs.outputFileSync(
  fixtures.B,
  `require('${fixtures.childOfB}');require('${fixtures.commonDep}')`
)

module.exports = {
  fixtures,
  fixturesRoot
}
