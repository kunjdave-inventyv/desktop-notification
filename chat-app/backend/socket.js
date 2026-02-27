const { addUser, removeUserBySocketId, getSocketId } = require('./users');
const { sendPushNotification } = require('./push');

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('join', (userId) => {
            addUser(socket.id, userId);
            socket.join(userId); // Join room for multi-tab sync
            console.log(`User ${userId} joined with socket ${socket.id}`);
        });

        socket.on('send-message', (data) => {
            const { to, from, text, id } = data;
            
            const message = {
                id: id || `soc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                from,
                to,
                text,
                timestamp: new Date()
            };

            // Emit to ALL sockets in the 'to' room (recipient)
            io.to(to).emit('receive-message', message);
            
            // Sync with other tabs of the sender
            if (to !== from) {
                socket.to(from).emit('sync-message', { ...message, to });
            }

            // Always attempt push
            sendPushNotification(to, {
                title: `New message from ${from}`,
                body: text,
                icon: '/favicon.ico',
                data: { ...message, to }
            });
        });

        socket.on('typing', ({ to, from, isTyping }) => {
            io.to(to).emit('typing', { from, isTyping });
        });

        socket.on('call-user', ({ to, from }) => {
            io.to(to).emit('incoming-call', { from });
            
            sendPushNotification(to, {
                title: `Incoming call from ${from}`,
                body: 'Tap to answer',
                icon: '/favicon.ico',
                data: { type: 'CALL', from, to }
            });
        });

        socket.on('call-response', ({ to, from, accepted }) => {
            io.to(to).emit('call-result', { from, accepted });
        });

        socket.on('disconnect', () => {
            removeUserBySocketId(socket.id);
            console.log('User disconnected:', socket.id);
        });
    });
};
