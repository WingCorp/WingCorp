const express = require('express')
const path = require('path')
const process = require('process')

//Load config and change directory
const config = require('./config')
process.chdir(config.path)

const app = express()

const main = async () => {
    app.use(express.static('./'))
    app.listen(config.port, config.address, () => console.log(`Listening on port ${config.port} at ${config.address}`))
}

main()
