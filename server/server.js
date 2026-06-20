const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Хранилище
const onlineUsers = new Map();
const waitingUsers = [];

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
    console.log(`🟢 Новое подключение: ${socket.id}`);

    socket.on('register', (peerId) => {
        console.log(`📝 Регистрация: ${peerId}`);
        onlineUsers.set(peerId, socket.id);
        socket.data.peerId = peerId;
        
        io.emit('online-count', onlineUsers.size);
        socket.emit('registered', { 
            peerId, 
            online: onlineUsers.size 
        });
    });

    socket.on('find-partner', () => {
        const peerId = socket.data.peerId;
        console.log(`🔍 ${peerId} ищет собеседника`);
        
        if (waitingUsers.length > 0) {
            const partnerSocketId = waitingUsers.shift();
            const partnerPeerId = io.sockets.sockets.get(partnerSocketId)?.data?.peerId;
            
            if (partnerPeerId) {
                console.log(`✅ Соединяем ${peerId} с ${partnerPeerId}`);
                
                io.to(socket.id).emit('partner-found', { partnerId: partnerPeerId });
                io.to(partnerSocketId).emit('partner-found', { partnerId: peerId });
                return;
            }
        }
        
        waitingUsers.push(socket.id);
        socket.emit('waiting', { message: 'Ожидание собеседника...' });
        console.log(`⏳ ${peerId} добавлен в очередь (${waitingUsers.length})`);
    });

    socket.on('cancel-search', () => {
        const index = waitingUsers.indexOf(socket.id);
        if (index !== -1) {
            waitingUsers.splice(index, 1);
            console.log(`❌ Поиск отменён: ${socket.data.peerId}`);
        }
    });

    socket.on('disconnect', () => {
        const peerId = socket.data.peerId;
        if (peerId) {
            onlineUsers.delete(peerId);
            console.log(`🔴 ${peerId} отключился`);
            io.emit('online-count', onlineUsers.size);
        }
        
        const index = waitingUsers.indexOf(socket.id);
        if (index !== -1) {
            waitingUsers.splice(index, 1);
        }
    });

    socket.on('end-call', () => {
        const peerId = socket.data.peerId;
        console.log(`📞 ${peerId} завершил разговор`);
        const index = waitingUsers.indexOf(socket.id);
        if (index !== -1) {
            waitingUsers.splice(index, 1);
        }
    });
});

// ============ HTTP ENDPOINTS ============
app.get('/online', (req, res) => {
    res.json({ online: onlineUsers.size });
});

app.get('/users', (req, res) => {
    res.json({ 
        online: onlineUsers.size,
        users: Array.from(onlineUsers.keys()),
        waiting: waitingUsers.length 
    });
});

// ============ ЗАПУСК ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📡 Socket.IO готов к подключениям`);
});
