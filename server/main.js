const express = require('express')
const config = require('./config')
const path = require('path')
const app = express()

const main = async () => {
    app.use(express.static(path.join(__dirname, '../app/')))
    app.listen(config.port, config.address, () => console.log(`Listening on port ${config.port} at ${config.address}`))
}

main()