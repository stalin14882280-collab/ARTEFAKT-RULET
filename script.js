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
    const serverStatus = document.getElementById('serverStatus');
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
    let isActive = false;
    let isConnected = false;
    let isPermissionGranted = false;
    let myPeerId = null;
    let isSearching = false;
    let searchTimeout = null;
    let currentMode = 'video';
    const SEARCH_TIMEOUT = 7000;

    // Таймер общения
    let timerInterval = null;
    let seconds = 0;

    // Звуки
    let audioCtx = null;

    // ============ КОНФИГУРАЦИЯ ============
    const SERVER_URL = 'https://artefakt-rulet-server.onrender.com';
    // const SERVER_URL = 'http://localhost:3000';

    const PEER_CONFIG = {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:relay1.expressturn.com:3478',
                    username: 'efZRVVVFCWXWUOQCUJ',
                    credential: 'sZ6BVVUYSXJEVNKY'
                }
            ]
        }
    };

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
            } else if (type === 'complain') {
                oscillator.frequency.value = 600;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.1;
                oscillator.start();
                setTimeout(() => {
                    oscillator.frequency.value = 800;
                }, 100);
                setTimeout(() => {
                    oscillator.frequency.value = 1000;
                }, 200);
                setTimeout(() => oscillator.stop(), 350);
            }
        } catch (e) {}
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

    modeVideo.addEventListener('click', () => selectMode('video'));
    modeAudio.addEventListener('click', () => selectMode('audio'));

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

    // ============ ПОДКЛЮЧЕНИЕ К SOCKET.IO ============
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
            if (myPeerId) {
                socket.emit('register', myPeerId);
            }
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
            callPartner(data.partnerId);
        });

        socket.on('disconnect', () => {
            console.warn('⚠️ Сервер отключился');
            serverText.textContent = '⚠️ Сервер отключён';
            serverDot.className = 'status-dot';
        });

        socket.on('chat-message', (data) => {
            console.log('💬 Сообщение от', data.from, ':', data.text);
            addMessage(data.text, 'other', data.time);
            playSound('message');
        });
    }

    // ============ PEERJS ============
    function connectToPeerServer() {
        peer = new Peer(undefined, PEER_CONFIG);

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
            acceptCall(call);
        });

        peer.on('disconnected', () => {
            console.log('🔴 Peer отключился');
            if (isConnected) {
                disconnectCall();
            }
        });
    }

    // ============ ЗВОНОК ПАРТНЁРУ ============
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

        isActive = true;
        currentCall = call;
        
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
        });

        call.on('close', () => {
            console.log('🔴 Входящий звонок закрыт');
            if (isConnected) {
                disconnectCall();
            }
        });
    }

    // ============ ПОИСК СОБЕСЕДНИКА ============
    function findPartner() {
        if (!socket || !socket.connected) {
            alert('❌ Нет подключения к серверу');
            return;
        }
        if (isSearching) return;
        
        isSearching = true;
        isActive = true;
        setStatus('🔍 ПОИСК... 7с', 'searching');
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        searchTimeout = setTimeout(() => {
            if (isSearching) {
                isSearching = false;
                isActive = false;
                setStatus('⏱️ ВРЕМЯ ВЫШЛО', 'idle');
                startBtn.disabled = false;
                stopBtn.disabled = true;
                complainBtn.disabled = true;
                complainBtn.classList.remove('active');
                
                if (socket && socket.connected) {
                    socket.emit('cancel-search');
                }
                
                showNotification('⏱️ Собеседник не найден', 'Повторите попытку через несколько секунд');
                playSound('fail');
                
                if (navigator.vibrate) {
                    navigator.vibrate([200, 100, 200]);
                }
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
        isActive = false;
        isSearching = false;
        setStatus('⏹ РАЗЪЕДИНЕНО', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        // АКТИВИРУЕМ КНОПКУ ЖАЛОБЫ!
        complainBtn.disabled = false;
        complainBtn.classList.add('active');
        
        partnerIdElement.textContent = '—';
        partnerIdElement.className = 'id';
        
        enableChat(false);
        chatStatus.textContent = '⛔ Не в чате';
        
        stopTimer();
        timerDisplay.classList.remove('active');
        playSound('disconnect');
        
        if (socket && socket.connected) {
            socket.emit('end-call');
        }
    }

    // ============ ЗАПУСК СЕССИИ ============
    async function startSession() {
        if (isActive || isSearching) return;
        if (!isPermissionGranted || !localStream) {
            alert('Сначала активируй доступ к камере/микрофону');
            return;
        }
        if (!peer || peer.destroyed) {
            alert('⏳ Подключение к PeerJS... Подожди');
            return;
        }
        if (!socket || !socket.connected) {
            alert('⏳ Подключение к серверу... Подожди');
            return;
        }

        // Деактивируем кнопку жалобы при новом поиске
        complainBtn.disabled = true;
        complainBtn.classList.remove('active');
        
        findPartner();
    }

    // ============ ОСТАНОВКА ============
    function stopSession() {
        if (!isActive && !isConnected) return;
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        document.querySelectorAll('.notification').forEach(el => el.remove());
        
        if (isSearching) {
            isSearching = false;
            if (socket && socket.connected) {
                socket.emit('cancel-search');
            }
            setStatus('⏹ ОСТАНОВЛЕНО', 'idle');
            startBtn.disabled = false;
            stopBtn.disabled = true;
            complainBtn.disabled = true;
            complainBtn.classList.remove('active');
            return;
        }
        
        disconnectCall();
    }

    // ============ ЖАЛОБА ============
    function openComplainModal() {
        if (isConnected || isActive || isSearching) {
            showNotification('⚠️ Нельзя пожаловаться', 'Сначала заверши разговор');
            return;
        }
        
        playSound('complain');
        
        // Создаём модалку
        const overlay = document.createElement('div');
        overlay.className = 'complain-modal-overlay show';
        overlay.innerHTML = `
            <div class="complain-modal">
                <span class="modal-icon">⚠️</span>
                <h2>ПОЖАЛОВАТЬСЯ</h2>
                <p>Выберите причину жалобы на собеседника:</p>
                <div class="complain-reasons">
                    <div class="complain-reason" data-reason="Неприемлемое поведение">🔞 Неприемлемое поведение</div>
                    <div class="complain-reason" data-reason="Спам">📨 Спам</div>
                    <div class="complain-reason" data-reason="Оскорбления">😡 Оскорбления</div>
                    <div class="complain-reason" data-reason="Мошенничество">💸 Мошенничество</div>
                    <div class="complain-reason" data-reason="Другое">📝 Другое</div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-cancel" id="complainCancel">ОТМЕНА</button>
                    <button class="btn btn-send-complain" id="complainSend" disabled>ОТПРАВИТЬ</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        let selectedReason = null;
        
        // Выбор причины
        overlay.querySelectorAll('.complain-reason').forEach(el => {
            el.addEventListener('click', () => {
                overlay.querySelectorAll('.complain-reason').forEach(r => r.classList.remove('selected'));
                el.classList.add('selected');
                selectedReason = el.dataset.reason;
                document.getElementById('complainSend').disabled = false;
            });
        });
        
        // Отмена
        document.getElementById('complainCancel').addEventListener('click', () => {
            overlay.remove();
        });
        
        // Отправка
        document.getElementById('complainSend').addEventListener('click', () => {
            if (!selectedReason) return;
            
            const partnerId = partnerIdElement.textContent;
            console.log(`📨 Жалоба на ${partnerId}: ${selectedReason}`);
            
            // Показываем уведомление
            showNotification('✅ Жалоба отправлена', 'Мы рассмотрим вашу жалобу в ближайшее время');
            playSound('message');
            
            overlay.remove();
            complainBtn.disabled = true;
            complainBtn.classList.remove('active');
        });
        
        // Клик вне модалки
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // ============ ЧАТ ============
    function enableChat(enabled) {
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
        const text = chatInput.value.trim();
        if (!text || !isConnected) return;
        
        if (socket && socket.connected) {
            socket.emit('chat-message', {
                to: partnerIdElement.textContent,
                text: text,
                time: getCurrentTime()
            });
        }
        
        addMessage(text, 'self', getCurrentTime());
        chatInput.value = '';
        playSound('message');
    }

    function addMessage(text, type, time) {
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
        remotePlaceholder.style.color = '#3f6a5e';
        remotePlaceholder.style.textShadow = 'none';
    }

    // ============ СТАТУС ============
    function setStatus(text, type = 'idle') {
        statusText.textContent = text;
        statusDot.className = 'dot';
        if (type === 'active') statusDot.classList.add('active');
        else if (type === 'searching') statusDot.classList.add('searching');
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
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
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

    // ============ РАЗРЕШЕНИЯ ============
    async function requestMedia() {
        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            if (currentMode === 'video') {
                constraints.video = {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                };
            }
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            return stream;
        } catch (err) {
            console.warn('Ошибка доступа к медиа:', err);
            
            let message = '❌ Нет доступа к ';
            if (currentMode === 'video') {
                message += 'камере или микрофону.';
            } else {
                message += 'микрофону.';
            }
            message += '\nРазреши доступ в браузере.';
            
            alert(message);
            return null;
        }
    }

    async function handlePermissionGrant() {
        try {
            const stream = await requestMedia();
            if (!stream) return;

            localStream = stream;
            showSelfVideo(stream);
            isPermissionGranted = true;
            permissionOverlay.classList.add('hidden');
            startBtn.disabled = false;
            setStatus('ГОТОВ К ПОИСКУ', 'idle');
            
            if (!peer) {
                connectToPeerServer();
            }
            
        } catch (err) {
            console.error('Ошибка:', err);
            alert('❌ Что-то пошло не так. Попробуй обновить страницу.');
        }
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    function init() {
        selectMode('video');
        
        permissionOverlay.classList.remove('hidden');
        startBtn.disabled = true;
        complainBtn.disabled = true;
        
        connectToServer();
        connectToPeerServer();

        permissionBtn.addEventListener('click', handlePermissionGrant);
        startBtn.addEventListener('click', startSession);
        stopBtn.addEventListener('click', stopSession);
        complainBtn.addEventListener('click', openComplainModal);
        
        chatSendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !startBtn.disabled) startBtn.click();
            if (e.key === 'Escape' && !stopBtn.disabled) stopBtn.click();
        });

        window.addEventListener('beforeunload', () => {
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
            }
            if (socket && socket.connected) {
                socket.disconnect();
            }
            if (peer && !peer.destroyed) {
                peer.destroy();
            }
            if (timerInterval) {
                clearInterval(timerInterval);
            }
        });

        console.log('✦ ARTEFAKT RULET ✦');
        console.log('📡 Подключение к серверу...');
    }

    init();
})();
