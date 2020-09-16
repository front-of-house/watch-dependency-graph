const { h } = require('hyposcript')
const { Box } = require('hypobox')

module.exports = function () {
  return (
    h(Box, {}, 'hello')
  )
}
