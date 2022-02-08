const express = require('express')
const process = require('process')
const WebSocket = require('ws')
const { v4: uuidv4 } = require('uuid')
const Database = require('better-sqlite3')

//Load config and change directory
const config = require('./config')
const db_file = config.database
const db = new Database(db_file)
const bodyParser = require('body-parser')
process.chdir(config.path)

const app = express()
let master_key = null

const setup_db = () => {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            identity TEXT NOT NULL UNIQUE
        )`).run()
    db.prepare(`
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            title TEXT UNIQUE NOT NULL,
            owner_id INTEGER NOT NULL,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )`).run()
    db.prepare(
        `CREATE TABLE IF NOT EXISTS votes (
            game_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            charge INTEGER NOT NULL,
            FOREIGN KEY(game_id) REFERENCES games(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            PRIMARY KEY(game_id, user_id)
        )`
    ).run()
}

const sanitize = (str) => {
    if (typeof str != typeof "") {
        return str
    }
    return str
        .replace(/;/g, '&semi;')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

}

const expand_game = (game_result) => {
    if (!!game_result) {
        const owner_stmt = db.prepare(`SELECT * FROM users WHERE id = ?`)
        const owner = owner_stmt.get(game_result.owner_id)
        const votes_stmt = db.prepare(`SELECT SUM(charge) as votes FROM votes WHERE game_id = ?`)
        const votes = votes_stmt.get(game_result.id).votes
        game_result.owner = owner
        game_result.votes = !!votes ? votes : 0
        return game_result
    }
    return null
}

const get_game = (id) => {
    const stmt = db.prepare(`SELECT * FROM games WHERE id = ?`)
    const result = stmt.get(sanitize(id))
    return expand_game(result)
}

const get_game_by_title = (title) => {
    const stmt = db.prepare(`SELECT * FROM games WHERE title = ?`)
    const result = stmt.get(sanitize(title))
    return expand_game(result)
}

const persist_game = (title, owner_id) => {
    console.log(`Trying to add ${title} from ${owner_id}!`)
    const stmt = db.prepare(`INSERT INTO games (title, owner_id) VALUES(?, ?)`)
    stmt.run(sanitize(title), sanitize(owner_id))
    const id = db.prepare(`SELECT last_insert_rowid() as id`).get().id
    console.log(`Added ${title} and got id: ${id}!`)
    return expand_game(get_game(id))
}

const get_all_games = () => {
    const stmt = db.prepare(`SELECT * FROM games`)
    return stmt.all().map(expand_game)
}

const get_user = (user, identity) => {
    const stmt = db.prepare(`SELECT * FROM users WHERE name = ? AND identity = ?`)
    const candidates = stmt.all(user, identity)
    return candidates.length == 0 ? null : candidates[0]
}

const persist_user = (user, identity) => {
    const stmt = db.prepare(`INSERT INTO users (name, identity) VALUES (?, ?)`)
    stmt.run(sanitize(user), identity)
    console.log(`Added '${user}' with identity: ${identity}`)
    return db.prepare(`SELECT last_insert_rowid() as id`).get().id
}

const get_user_identity = (user, req) => {
    return `${user}:${req.headers['user-agent']}`
}

const upvote = (game_id, user_id) => {
    const update_stmt = db.prepare(`UPDATE votes SET charge = (charge + 1) % 2 WHERE user_id = ? and game_id = ?`)
    const changes = update_stmt.run(user_id, game_id).changes
    if (changes == 0) {
        const insert_stmt = db.prepare(`INSERT INTO votes (game_id, user_id, charge) VALUES (?, ?, 1)`)
        insert_stmt.run(game_id, user_id)
    }
}

const downvote = (game_id, user_id) => {
    const update_stmt = db.prepare(`UPDATE votes SET charge = (charge - 1) % 2 WHERE user_id = ? and game_id = ?`)
    const changes = update_stmt.run(user_id, game_id).changes
    if (changes == 0) {
        const insert_stmt = db.prepare(`INSERT INTO votes (game_id, user_id, charge) VALUES (?, ?, -1)`)
        insert_stmt.run(game_id, user_id)
    }
}


const unauthorized = (res, key) => {
    if (master_key !== key) {
        console.log(`Someone tried to access with key: ${key}`)
        res.status(401)
        res.send({
            error: true,
            message: "Unauthorized."
        })
        console.log('UNAUTHORIZED!')
        return true
    }
    return false
}

const suggestions = [
    'Counter Strike (1.6, Source, GO)',
    'Call of Duty: Modern 420blazeit™ WW2 Edition',
    'Rocket League (3v3)',
    'OG Half-Life'
]

const seed_db = () => {
    const seed_uname = "-"
    const seed_uid = "root"
    const existing_user = get_user(seed_uname, seed_uid)
    const user_id = !!existing_user ? existing_user.id : persist_user(seed_uname, seed_uid);

    suggestions.forEach((title) => {
        const game = get_game_by_title(title)
        if (!game) {
            persist_game(title, user_id)
        }
    })
}

const main = async () => {
    master_key = uuidv4().split('-')[0]
    console.log(`Pre-shared key: '${master_key}'`)

    setup_db()

    app.use(express.static('./'))
    app.listen(config.port, config.address, () => console.log(`Listening on port ${config.port} at ${config.address}`))
    app.use(bodyParser.json())
    app.get('/events/lan-party/games', async (_, res) => {
        const games = get_all_games()
        res.send(games)
    })
    app.post('/events/lan-party/upvote', async (req, res) => {
        const data = req.body
        const key = data.key
        if (unauthorized(res, key)) return
        const user_identity = get_user_identity(data.user, req)
        const existing_user = get_user(data.user, user_identity)
        const user_id = !!existing_user ? existing_user.id : persist_user(data.user, user_identity);
        upvote(data.game_id, user_id)
        res.status(200)
        res.send()
    })
    app.post('/events/lan-party/downvote', async (req, res) => {
        const data = req.body
        const key = data.key
        if (unauthorized(res, key)) return
        const user_identity = get_user_identity(data.user, req)
        const existing_user = get_user(data.user, user_identity)
        const user_id = !!existing_user ? existing_user.id : persist_user(data.user, user_identity);
        downvote(data.game_id, user_id)
        res.status(200)
        res.send()
    })
    app.post('/events/lan-party/game', async (req, res) => {
        const data = req.body
        const key = data.key
        if (unauthorized(res, key)) return
        const title = data.title.slice(0, 10)
        const exists = !!get_game_by_title(title)
        if (exists) {
            res.status(400)
            res.send({
                error: true,
                message: "Game already present in the list!"
            })
            return
        }
        const user_identity = get_user_identity(data.user, req)
        const existing_user = get_user(data.user, user_identity)
        const user_id = !!existing_user ? existing_user.id : persist_user(data.user, user_identity);
        res.status(200)
        res.send(persist_game(title, user_id))
    })
}

main()
