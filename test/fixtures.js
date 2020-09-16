const fs = require('fs-extra')
const path = require('path')

const root = path.join(__dirname, 'fixtures')

fs.ensureDirSync(root)
fs.outputFileSync(path.join(root, 'childOfChildren.js'), `module.exports = {}`)
fs.outputFileSync(path.join(root, 'childOfA.js'), `require('./childOfChildren')`)
fs.outputFileSync(path.join(root, 'childOfB.js'), `require('./childOfChildren')`)
fs.outputFileSync(path.join(root, 'A.js'), `require('./childOfA')`)
fs.outputFileSync(path.join(root, 'B.js'), `require('./childOfB')`)
