const persistence = require('./persistence')

async function setFlash(session, message) { // Sets a flash message for a session.

    let data = await persistence.getSession(session)
    data.flash = message
    await persistence.updateSession(session,data)
}

async function getFlash(session) { // Retrieves and deletes the flash message from a session.
    let data = await persistence.getSession(session)
    if (!data) {
        return undefined
    }
    let result = data.flash
    delete data.flash
    await persistence.updateSession(session,data)
    return result
}

module.exports = {
    setFlash, getFlash
}