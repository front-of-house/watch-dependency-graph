// require('chokidar').watch('.', { ignoreInitial: true }).on('all', (e, f) => {
//   console.log(e, f)
// })

const instance = require('./')('./test/*.page.js')

instance.on('update', files => {
  console.log(files)
})
