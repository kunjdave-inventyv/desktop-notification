const users = new Map();

function addUser(socketId, userId) {
    users.set(userId, socketId);
}

function removeUserBySocketId(socketId) {
    for (let [userId, sId] of users.entries()) {
        if (sId === socketId) {
            users.delete(userId);
            break;
        }
    }
}

function getSocketId(userId) {
    return users.get(userId);
}

module.exports = { addUser, removeUserBySocketId, getSocketId };
