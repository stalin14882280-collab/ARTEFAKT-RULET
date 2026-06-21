(function() {
    "use strict";

    // DOM элементы
    const selfVideo = document.getElementById('selfVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const selfPlaceholder = document.getElementById('selfPlaceholder');
    const remotePlaceholder = document.getElementById('remotePlaceholder');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const complainBtn = document.getElementById('complainBtn');
    const permissionOverlay = document.getElementById('permissionOverlay');
    const permissionBtn = document.getElementById('permissionBtn');
    const serverDot = document.getElementById('serverDot');
    const serverText = document.getElementById('serverText');
    const onlineCount = document.getElementById('onlineCount');
    const partnerIdElement = document.getElementById('partnerId');
    const modeVideo = document.getElementById('modeVideo');
    const modeAudio = document.getElementById('modeAudio');
    const modeHint = document.getElementById('modeHint');
    const selfBadge = document.getElementById('selfBadge');
    const timerDisplay = document.getElementById('timerDisplay');

    // Чат элементы
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatStatus = document.getElementById('chatStatus');

    // Состояние
    let localStream = null;
    let peer = null;
    let socket = null;
    let currentCall = null;
    let isConnected = false;
    let isSearching = false;
    let isPermissionGranted = false;
    let myPeerId = null;
    let currentPartnerId = null;
    let currentMode = 'video';
    let searchTimeout = null;
    const SEARCH_TIMEOUT = 7000;

    // Таймер
    let timerInterval = null;
    let seconds = 0;

    // Звуки
    let audioCtx = null;

    // ============ КОНФИГУРАЦИЯ ============
    const SERVER_URL = 'https://artefakt-rulet-server.onrender.com';

    // ============ ЗВУКИ ============
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playSound(type) {
        try {
            initAudio();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            if (type === 'connect') {
                oscillator.frequency.value = 880;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.15;
                oscillator.start();
                setTimeout(() => oscillator.stop(), 200);
                setTimeout(() => {
                    const osc2 = audioCtx.createOscillator();
                    const gain2 = audioCtx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(audioCtx.destination);
                    osc2.frequency.value = 1100;
                    osc2.type = 'sine';
                    gain2.gain.value = 0.1;
                    osc2.start();
                    setTimeout(() => osc2.stop(), 150);
                }, 150);
            } else if (type === 'disconnect') {
                oscillator.frequency.value = 400;
                oscillator.type = 'sawtooth';
                gainNode.gain.value = 0.08;
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
                setTimeout(() => oscillator.stop(), 400);
            } else if (type === 'fail') {
                oscillator.frequency.value = 300;
                oscillator.type = 'square';
                gainNode.gain.value = 0.06;
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
                setTimeout(() => oscillator.stop(), 300);
            } else if (type === 'message') {
                oscillator.frequency.value = 1200;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.05;
                oscillator.start();
                setTimeout(() => oscillator.stop(), 80);
            }
        } catch (e) {}
    }

    // ============ ПОДКЛЮЧЕНИЕ К СЕРВЕРУ ============
    function connectToServer() {
        serverText.textContent = 'Подключение к серверу...';
        serverDot.className = 'status-dot';
        
        socket = io(SERVER_URL, {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('✅ Socket.IO подключён');
            serverText.textContent = '✅ Сервер подключён';
            serverDot.className = 'status-dot connected';
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Ошибка подключения к серверу:', err);
            serverText.textContent = '⚠️ Ошибка подключения';
            serverDot.className = 'status-dot';
        });

        socket.on('online-count', (count) => {
            onlineCount.textContent = count;
        });

        socket.on('registered', (data) => {
            console.log('✅ Зарегистрирован на сервере:', data);
            onlineCount.textContent = data.online;
        });

        socket.on('waiting', (data) => {
            console.log('⏳ Ожидание собеседника...');
            setStatus('⏳ ОЖИДАНИЕ...', 'searching');
        });

        socket.on('partner-found', (data) => {
            console.log('🎯 Найден собеседник:', data.partnerId);
            if (searchTimeout) {
                clearTimeout(searchTimeout);
                searchTimeout = null;
            }
            currentPartnerId = data.partnerId;
            callPartner(data.partnerId);
        });

        socket.on('disconnect', () => {
            console.warn('⚠️ Сервер отключился');
            serverText.textContent = '⚠️ Сервер отключён';
            serverDot.className = 'status-dot';
        });

        // ЧАТ: получение сообщений
        socket.on('chat-message', (data) => {
            console.log('💬 Получено сообщение от', data.from, ':', data.text);
            if (data.from === currentPartnerId) {
                addMessage(data.text, 'other', data.time);
                playSound('message');
            }
        });
    }

    // ============ PEERJS ============
    function connectToPeer() {
        peer = new Peer(undefined, {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true
        });

        peer.on('open', (id) => {
            myPeerId = id;
            console.log('✅ PeerJS подключён, ID:', id);
            if (socket && socket.connected) {
                socket.emit('register', id);
            }
        });

        peer.on('error', (err) => {
            console.error('❌ Ошибка PeerJS:', err);
        });

        peer.on('call', (call) => {
            console.log('📞 Входящий вызов от:', call.peer);
            if (isConnected) {
                call.close();
                return;
            }
            currentPartnerId = call.peer;
            acceptCall(call);
        });
    }

    // ============ ЗВОНОК ============
    function callPartner(partnerId) {
        if (!localStream) {
            console.error('❌ Нет локального потока');
            return;
        }

        console.log(`📞 Звоним ${partnerId}...`);
        setStatus('📞 СОЕДИНЕНИЕ...', 'searching');
        
        const call = peer.call(partnerId, localStream);
        currentCall = call;

        call.on('stream', (remoteStream) => {
            console.log('✅ Стрим получен от:', partnerId);
            showRemoteVideo(remoteStream);
            isConnected = true;
            isSearching = false;
            setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
            startBtn.disabled = true;
            stopBtn.disabled = false;
            complainBtn.disabled = true;
            complainBtn.classList.remove('active');
            partnerIdElement.textContent = partnerId;
            partnerIdElement.className = 'id connected';
            
            enableChat(true);
            startTimer();
            timerDisplay.classList.add('active');
            playSound('connect');
            clearChat();
        });

        call.on('close', () => {
            console.log('🔴 Звонок закрыт');
            if (isConnected) {
                disconnectCall();
            }
        });
    }

    // ============ ПРИНЯТЬ ЗВОНОК ============
    function acceptCall(call) {
        if (!localStream) {
            call.close();
            return;
        }

        currentCall = call;
        currentPartnerId = call.peer;
        
        call.answer(localStream);
        partnerIdElement.textContent = call.peer;
        partnerIdElement.className = 'id connected';

        call.on('stream', (remoteStream) => {
            console.log('✅ Входящий стрим от:', call.peer);
            showRemoteVideo(remoteStream);
            isConnected = true;
            isSearching = false;
            setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
            startBtn.disabled = true;
            stopBtn.disabled = false;
            complainBtn.disabled = true;
            complainBtn.classList.remove('active');
            
            enableChat(true);
            startTimer();
            timerDisplay.classList.add('active');
            playSound('connect');
            clearChat();
        });

        call.on('close', () => {
            console.log('🔴 Входящий звонок закрыт');
            if (isConnected) {
                disconnectCall();
            }
        });
    }

    // ============ ПОИСК ============
    function findPartner() {
        if (!socket || !socket.connected) {
            alert('❌ Нет подключения к серверу');
            return;
        }
        if (isSearching) return;
        
        isSearching = true;
        setStatus('🔍 ПОИСК... 7с', 'searching');
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        searchTimeout = setTimeout(() => {
            if (isSearching) {
                isSearching = false;
                setStatus('⏱️ ВРЕМЯ ВЫШЛО', 'idle');
                startBtn.disabled = false;
                stopBtn.disabled = true;
                
                if (socket && socket.connected) {
                    socket.emit('cancel-search');
                }
                
                showNotification('⏱️ Собеседник не найден', 'Повторите попытку');
                playSound('fail');
            }
        }, SEARCH_TIMEOUT);
        
        socket.emit('find-partner');
    }

    // ============ РАЗЪЕДИНЕНИЕ ============
    function disconnectCall() {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        hideRemoteVideo();
        isConnected = false;
        isSearching = false;
        setStatus('⏹ РАЗЪЕДИНЕНО', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        complainBtn.disabled = false;
        complainBtn.classList.add('active');
        
        partnerIdElement.textContent = '—';
        partnerIdElement.className = 'id';
        currentPartnerId = null;
        
        enableChat(false);
        clearChat();
        
        stopTimer();
        timerDisplay.classList.remove('active');
        playSound('disconnect');
        
        if (socket && socket.connected) {
            socket.emit('end-call');
        }
    }

    // ============ ЗАПУСК ============
    function startSession() {
        if (isConnected || isSearching) return;
        if (!isPermissionGranted || !localStream) {
            alert('Сначала активируй доступ к камере/микрофону');
            return;
        }
        if (!peer) {
            alert('⏳ Подключение к PeerJS... Подожди');
            return;
        }

        complainBtn.disabled = true;
        complainBtn.classList.remove('active');
        clearChat();
        findPartner();
    }

    // ============ ОСТАНОВКА ============
    function stopSession() {
        if (!isConnected && !isSearching) return;
        disconnectCall();
    }

    // ============ ЧАТ ============
    function clearChat() {
        if (!chatMessages) return;
        chatMessages.innerHTML = '';
        const placeholder = document.createElement('div');
        placeholder.className = 'chat-placeholder';
        placeholder.textContent = 'Начни общение...';
        chatMessages.appendChild(placeholder);
    }

    function enableChat(enabled) {
        if (!chatInput || !chatSendBtn || !chatStatus) return;
        chatInput.disabled = !enabled;
        chatSendBtn.disabled = !enabled;
        if (enabled) {
            chatStatus.textContent = '✅ В чате';
            chatStatus.className = 'chat-status active';
            chatInput.placeholder = 'Напиши сообщение...';
            chatInput.focus();
        } else {
            chatStatus.textContent = '⛔ Не в чате';
            chatStatus.className = 'chat-status';
            chatInput.placeholder = 'Чат недоступен';
        }
    }

    function sendMessage() {
        if (!chatInput) return;
        const text = chatInput.value.trim();
        if (!text || !isConnected || !currentPartnerId) return;
        
        if (socket && socket.connected) {
            socket.emit('chat-message', {
                to: currentPartnerId,
                text: text,
                time: getCurrentTime()
            });
        }
        
        addMessage(text, 'self', getCurrentTime());
        chatInput.value = '';
        playSound('message');
    }

    function addMessage(text, type, time) {
        if (!chatMessages) return;
        const placeholder = chatMessages.querySelector('.chat-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        const msg = document.createElement('div');
        msg.className = `chat-message ${type}`;
        msg.innerHTML = `${text} <span class="msg-time">${time || getCurrentTime()}</span>`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function getCurrentTime() {
        const now = new Date();
        return now.getHours().toString().padStart(2, '0') + ':' + 
               now.getMinutes().toString().padStart(2, '0');
    }

    // ============ ВИДЕО ============
    function showSelfVideo(stream) {
        selfVideo.srcObject = stream;
        selfVideo.onloadedmetadata = () => {
            selfVideo.play().catch(() => {});
        };
        selfPlaceholder.style.display = 'none';
    }

    function showRemoteVideo(stream) {
        remoteVideo.srcObject = stream;
        remoteVideo.onloadedmetadata = () => {
            remoteVideo.play().catch(() => {});
        };
        remotePlaceholder.style.display = 'none';
    }

    function hideRemoteVideo() {
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(t => t.stop());
        }
        remoteVideo.srcObject = null;
        remotePlaceholder.style.display = 'block';
        remotePlaceholder.textContent = '⚡ ожидание';
    }

    // ============ СТАТУС ============
    function setStatus(text, type = 'idle') {
        statusText.textContent = text;
        statusDot.className = 'dot';
        if (type === 'active') statusDot.classList.add('active');
        else if (type === 'searching') statusDot.classList.add('searching');
    }

    // ============ ТАЙМЕР ============
    function startTimer() {
        seconds = 0;
        updateTimerDisplay();
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        timerInterval = setInterval(() => {
            seconds++;
            updateTimerDisplay();
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        seconds = 0;
        updateTimerDisplay();
    }

    function updateTimerDisplay() {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerDisplay.textContent = `⏱️ ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // ============ ВЫБОР РЕЖИМА ============
    function selectMode(mode) {
        currentMode = mode;
        modeVideo.classList.toggle('active', mode === 'video');
        modeAudio.classList.toggle('active', mode === 'audio');
        
        if (mode === 'video') {
            modeHint.textContent = '⚠️ Браузер запросит доступ к камере и микрофону';
            selfBadge.textContent = 'ВЫ 📹';
        } else {
            modeHint.textContent = '🎧 Только аудио (камера не нужна)';
            selfBadge.textContent = 'ВЫ 🎧';
        }
        
        if (isPermissionGranted && localStream) {
            updateStream();
        }
    }

    // ============ ОБНОВЛЕНИЕ ПОТОКА ============
    async function updateStream() {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        const stream = await requestMedia();
        if (stream) {
            localStream = stream;
            showSelfVideo(stream);
        }
    }

    // ============ РАЗРЕШЕНИЯ ============
    async function requestMedia() {
        try {
            const constraints = { audio: true };
            if (currentMode === 'video') {
                constraints.video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };
            }
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            alert('❌ Нет доступа к камере или микрофону');
            return null;
        }
    }

    async function handlePermissionGrant() {
        const stream = await requestMedia();
        if (!stream) return;

        localStream = stream;
        showSelfVideo(stream);
        isPermissionGranted = true;
        permissionOverlay.classList.add('hidden');
        startBtn.disabled = false;
        setStatus('ГОТОВ К ПОИСКУ', 'idle');
        
        if (!peer) {
            connectToPeer();
        }
    }

    // ============ УВЕДОМЛЕНИЯ ============
    function showNotification(title, message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `
            <div class="notification-icon">${title.includes('✅') ? '✅' : '⏱️'}</div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">✕</button>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    // ============ ЖАЛОБА ============
    function openComplainModal() {
        if (isConnected || isSearching) {
            showNotification('⚠️ Нельзя пожаловаться', 'Сначала заверши разговор');
            return;
        }
        showNotification('✅ Жалоба отправлена', 'Мы рассмотрим вашу жалобу');
        complainBtn.disabled = true;
        complainBtn.classList.remove('active');
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        selectMode('video');
        permissionOverlay.classList.remove('hidden');
        startBtn.disabled = true;
        complainBtn.disabled = true;
        
        connectToServer();

        permissionBtn.addEventListener('click', handlePermissionGrant);
        startBtn.addEventListener('click', startSession);
        stopBtn.addEventListener('click', stopSession);
        complainBtn.addEventListener('click', openComplainModal);
        
        if (chatSendBtn) {
            chatSendBtn.addEventListener('click', sendMessage);
        }
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        window.addEventListener('beforeunload', () => {
            if (localStream) localStream.getTracks().forEach(t => t.stop());
            if (socket && socket.connected) socket.disconnect();
            if (peer && !peer.destroyed) peer.destroy();
        });

        console.log('✦ ARTEFAKT RULET ✦');
    }

    init();
})();
