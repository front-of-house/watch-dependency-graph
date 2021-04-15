const path = require('path')

const graph = require('../')

const cwd = path.join(__dirname, '/fixture')
const w = graph({ cwd, alias: { '@': cwd } })

w.add([path.join(__dirname, '/fixture/index.js')])

console.log(w.ids.length)

w.on('change', ids => {
  console.log(w.ids.length)
})
