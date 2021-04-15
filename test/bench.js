const path = require('path')

const graph = require('../')

const cwd = path.join(__dirname, '/fixture')

console.time('bench')

const w = graph({ cwd, alias: { '@': cwd } })
w.add([path.join(__dirname, '/fixture/index.js')])
console.log('modules', w.ids.length)
w.close()

console.timeEnd('bench')
process.exit()

// w.on('change', ids => {
//   console.log('change', w.ids.length, w.tree)
// })
