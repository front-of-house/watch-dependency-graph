# TBD

```js
const graph = require('tbd-name')

const instance = graph('./pages/**/*.js')

// edit any file within the dependency tree
// say, a dep of /pages/About.js

instance.on('update', module => {
  console.log(module.id) // => /pages/About.js
})
```
