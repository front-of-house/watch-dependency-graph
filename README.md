# watch-dependency-graph

[![npm version](https://img.shields.io/npm/v/watch-dependency-graph?style=flat&colorA=4488FF&colorB=4488FF)](https://www.npmjs.com/package/watch-dependency-graph) [![test coverage](https://img.shields.io/coveralls/github/sure-thing/watch-dependency-graph?style=flat&colorA=223355&colorB=223355)](https://coveralls.io/github/sure-thing/watch-dependency-graph?branch=main) [![npm bundle size](https://badgen.net/packagephobia/install/watch-dependency-graph?color=223355&labelColor=223355)](https://packagephobia.com/result?p=watch-dependency-graph)

A small Node.js file watcher that watches dependency trees instead of globs or
directories.

```js
import { create } from 'watch-dependency-graph'

const files = [path.resolve(__dirname, './my-file.js')]

const watcher = create()

watcher.on('change', (files) => {}) // string[]
watcher.on('remove', (files) => {}) // string[]
watcher.on('error', (error) => {}) // string[]

watcher.add(files) // string or string[], must be absolute
watcher.remove(files) // string or string[], must be absolute

const removeListener = watcher.on('change', (files) => {})
removeListener()
```

### License

MIT License © [Sure Thing](https://github.com/sure-thing)
