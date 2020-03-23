const express = require('express')
const config = require('./config')
const path = require('path')
const app = express()
const port = config.port

const main = async () => {
    app.use(express.static(path.join(__dirname, '../app/')))
    app.listen(port, () => console.log(`Listening on port ${port}`))
}

main()