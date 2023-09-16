#!/usr/bin/env node
const main = require('./src/main')
;(async () => {
  const args = require('./src/args')
  main(await args()).catch((error) => console.error(error) || process.exit(1))
})()
