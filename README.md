# watch-dependency-graph

Monitor entry files and their dependencies for changes.

```js
const graph = require('watch-dependency-graph')

const instance = graph(['./path/to/file.js'])

instance.on('update', filepaths => {
  console.log(filepaths) // => [ '/User/Eric/web/path/to/file.js' ]
})
```

### License

MIT License © [Eric Bailey](https://estrattonbailey.com)
