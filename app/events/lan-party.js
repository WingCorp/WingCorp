
let table = null
let keyField = null
let userField = null
let titleField = null


let games = []

const get_key = () => keyField.value

const get_user = () => userField.value

const populate_table = async () => {
    games = Array.from(await (await fetch('./lan-party/games')).json())
    games = games.sort((a, b) => b.votes - a.votes)
    console.log(games)
    const fragment = document.createDocumentFragment()
    games
        .forEach(game => {
            const tr = document.createElement('tr')
            const fields = [game.title, game.owner.name, game.votes]
            fields.forEach(f => {
                const td = document.createElement('td')
                td.innerHTML = `${f}`
                tr.appendChild(td)
            })
            const upvote = document.createElement('td')
            upvote.textContent = '+'
            upvote.classList.add('clickable')
            upvote.onclick = vote_delegate(game, true)
            tr.appendChild(upvote)
            const downvote = document.createElement('td')
            downvote.textContent = '-'
            downvote.classList.add('clickable')
            downvote.onclick = vote_delegate(game, false)

            tr.appendChild(downvote)
            fragment.appendChild(tr)
        });
    table.appendChild(fragment)
}

const clear_rows = () => {
    document
        .querySelectorAll('#game-table>tr')
        .forEach(e => table.removeChild(e))
}

const vote_delegate = (game, up) => {
    const url = (up) ? './lan-party/upvote' : './lan-party/downvote'
    return async (_event) => {
        const user = get_user()
        const key = get_key()
        if (!user && !key) {
            alert('Udfyld koden fra discord og dit navn for at stemme!')
            return
        }
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                key: key,
                user: user,
                game_id: game.id
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        })
        if (res.status === 401) {
            alert('Den indtastede kode er forkert...')
            return
        }
        clear_rows()
        await populate_table()
    }
}

const suggest_game = async (event) => {
    if (event.keyCode != 13) {
        return
    }
    const already_exists = async () => {
        alert(`Spillet '${title}' findes allerede!`)
        clear_rows()
        await populate_table()
    }
    const user = get_user()
    const key = get_key()
    if (!user && !key) {
        alert('Udfyld koden fra discord og dit navn for at stemme!')
        return
    }
    const title = `${titleField.value}`
    if (!!games.find(g => g.title.trim() === title.trim())) {
        await already_exists()
    }
    const res = await fetch('./lan-party/game', {
        method: 'POST',
        body: JSON.stringify({
            key: key,
            user: user,
            title: title
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    })
    if (res.status == 400) {
        await already_exists()
    }
    titleField.value = ""
    clear_rows()
    await populate_table()
}

const init = async () => {
    table = document.getElementById('game-table')
    keyField = document.getElementById('key')
    userField = document.getElementById('user')
    titleField = document.getElementById('title')

    titleField.onkeyup = suggest_game
    await populate_table()
}



document.addEventListener('DOMContentLoaded', init)
