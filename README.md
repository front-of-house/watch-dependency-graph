# watch-dependency-graph

A Node file watcher, but instead of scanning the filesystem for files to be
watched, it monitors only specified entry files and their dependency trees.

```js
const path = require('path')
const watch = require('watch-dependency-graph')

const files = [path.resolve(__dirname, './my-file.js')]

const watcher = watch({ cwd: __dirname }) // defaults to process.cwd()

watcher.on('change', (files) => {}) // string[]
watcher.on('remove', (files) => {}) // string[]
watcher.on('error', (files) => {}) // string[]

watcher.add(files) // string or string[], must be absolute
watcher.remove(files) // string or string[], must be absolute

const removeListener = watcher.on('change', (files) => {})
removeListener()
```

### License

MIT License © [Sure Thing](https://github.com/sure-thing)
