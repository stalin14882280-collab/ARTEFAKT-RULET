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
    let socket = null;
    let isActive = false;
    let isConnected = false;
    let isPermissionGranted = false;
    let myPeerId = null;
    let isSearching = false;
    let searchTimeout = null;
    let currentMode = 'video';
    let currentPartnerId = null;
    const SEARCH_TIMEOUT = 7000;

    // WebRTC
    let pc = null;
    let isOfferer = false; // Кто создаёт OFFER

    // Таймер общения
    let timerInterval = null;
    let seconds = 0;

    // Звуки
    let audioCtx = null;

    // ============ КОНФИГУРАЦИЯ ============
    const SERVER_URL = 'https://artefakt-rulet-server.onrender.com';

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    };

    // ============ СОЗДАНИЕ ID ============
    function generateId() {
        return Math.random().toString(36).substring(2, 10) + 
               Math.random().toString(36).substring(2, 10);
    }

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
            myPeerId = generateId();
            socket.emit('register', myPeerId);
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

        // ============ НАЙДЕН СОБЕСЕДНИК ============
        socket.on('partner-found', (data) => {
            console.log('🎯 Найден собеседник:', data.partnerId);
            if (searchTimeout) {
                clearTimeout(searchTimeout);
                searchTimeout = null;
            }
            currentPartnerId = data.partnerId;
            
            // ⭐ МЫ СОЗДАЁМ OFFER (мы - инициатор)
            isOfferer = true;
            createOffer();
        });

        // ============ ПОЛУЧЕН OFFER (МЫ ОТВЕЧАЕМ) ============
        socket.on('webRTC-offer', (data) => {
            console.log('📞 Получен OFFER от:', data.from);
            if (isConnected || isSearching) {
                console.log('⚠️ Уже в разговоре, игнорируем');
                return;
            }
            currentPartnerId = data.from;
            isOfferer = false; // МЫ НЕ СОЗДАЁМ OFFER, мы отвечаем
            handleOffer(data.offer);
        });

        socket.on('webRTC-answer', (data) => {
            console.log('📞 Получен ANSWER от:', data.from);
            handleAnswer(data.answer);
        });

        socket.on('webRTC-candidate', (data) => {
            console.log('📞 Получен CANDIDATE от:', data.from);
            handleCandidate(data.candidate);
        });

        socket.on('partner-disconnected', (data) => {
            console.log('🔴 Собеседник отключился');
            if (isConnected) {
                disconnectCall();
            }
        });

        socket.on('disconnect', () => {
            console.warn('⚠️ Сервер отключился');
            serverText.textContent = '⚠️ Сервер отключён';
            serverDot.className = 'status-dot';
        });

        // Чат
        socket.on('chat-message', (data) => {
            console.log('💬 Получено сообщение от', data.from, ':', data.text);
            if (data.from === currentPartnerId) {
                addMessage(data.text, 'other', data.time);
                playSound('message');
            }
        });
    }

    // ============ WEBRTC: СОЗДАНИЕ OFFER (МЫ ИНИЦИАТОР) ============
    function createOffer() {
        if (!localStream) {
            console.error('❌ Нет локального потока');
            return;
        }
        if (pc) {
            console.log('⚠️ PeerConnection уже существует');
            return;
        }

        console.log('📞 СОЗДАЁМ OFFER для:', currentPartnerId);
        setStatus('📞 СОЕДИНЕНИЕ...', 'searching');

        pc = new RTCPeerConnection(ICE_SERVERS);

        // Добавляем все треки
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`✅ Добавлен трек: ${track.kind}`);
        });

        pc.ontrack = (event) => {
            console.log('✅ Получен трек от собеседника:', event.track.kind);
            if (event.track.kind === 'video' || event.track.kind === 'audio') {
                const stream = new MediaStream();
                stream.addTrack(event.track);
                if (event.track.kind === 'video') {
                    showRemoteVideo(stream);
                }
                if (!isConnected) {
                    onConnected();
                }
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                socket.emit('webRTC-candidate', {
                    to: currentPartnerId,
                    candidate: event.candidate
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('🔄 ICE состояние:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected' || 
                pc.iceConnectionState === 'failed') {
                disconnectCall();
            }
            if (pc.iceConnectionState === 'connected') {
                console.log('✅ ICE соединение установлено!');
            }
        };

        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                console.log('📤 Отправка OFFER');
                socket.emit('webRTC-offer', {
                    to: currentPartnerId,
                    offer: pc.localDescription
                });
            })
            .catch(err => {
                console.error('Ошибка создания OFFER:', err);
                disconnectCall();
            });
    }

    // ============ WEBRTC: ОБРАБОТКА OFFER (МЫ ОТВЕЧАЕМ) ============
    function handleOffer(offer) {
        if (!localStream) {
            console.error('❌ Нет локального потока');
            return;
        }
        if (pc) {
            console.log('⚠️ PeerConnection уже существует');
            return;
        }

        console.log('📞 ОБРАБОТКА OFFER от:', currentPartnerId);
        setStatus('📞 СОЕДИНЕНИЕ...', 'searching');

        pc = new RTCPeerConnection(ICE_SERVERS);

        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`✅ Добавлен трек: ${track.kind}`);
        });

        pc.ontrack = (event) => {
            console.log('✅ Получен трек от собеседника:', event.track.kind);
            if (event.track.kind === 'video' || event.track.kind === 'audio') {
                const stream = new MediaStream();
                stream.addTrack(event.track);
                if (event.track.kind === 'video') {
                    showRemoteVideo(stream);
                }
                if (!isConnected) {
                    onConnected();
                }
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📤 Отправка ICE кандидата');
                socket.emit('webRTC-candidate', {
                    to: currentPartnerId,
                    candidate: event.candidate
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('🔄 ICE состояние:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected' || 
                pc.iceConnectionState === 'failed') {
                disconnectCall();
            }
            if (pc.iceConnectionState === 'connected') {
                console.log('✅ ICE соединение установлено!');
            }
        };

        pc.setRemoteDescription(offer)
            .then(() => pc.createAnswer())
            .then(answer => pc.setLocalDescription(answer))
            .then(() => {
                console.log('📤 Отправка ANSWER');
                socket.emit('webRTC-answer', {
                    to: currentPartnerId,
                    answer: pc.localDescription
                });
            })
            .catch(err => {
                console.error('Ошибка обработки OFFER:', err);
                disconnectCall();
            });
    }

    // ============ WEBRTC: ОБРАБОТКА ANSWER ============
    function handleAnswer(answer) {
        if (!pc) {
            console.warn('⚠️ Нет PeerConnection для ANSWER');
            return;
        }
        console.log('📞 Обработка ANSWER');
        pc.setRemoteDescription(answer)
            .catch(err => console.error('Ошибка установки ANSWER:', err));
    }

    // ============ WEBRTC: ОБРАБОТКА CANDIDATE ============
    function handleCandidate(candidate) {
        if (!pc) {
            console.warn('⚠️ Нет PeerConnection для CANDIDATE');
            return;
        }
        console.log('📞 Добавление ICE кандидата');
        pc.addIceCandidate(candidate)
            .catch(err => console.error('Ошибка добавления кандидата:', err));
    }

    // ============ ПОДКЛЮЧЕНИЕ УСТАНОВЛЕНО ============
    function onConnected() {
        if (isConnected) return;
        isConnected = true;
        isSearching = false;
        setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
        startBtn.disabled = true;
        stopBtn.disabled = false;
        complainBtn.disabled = true;
        complainBtn.classList.remove('active');
        partnerIdElement.textContent = currentPartnerId;
        partnerIdElement.className = 'id connected';
        
        enableChat(true);
        startTimer();
        timerDisplay.classList.add('active');
        playSound('connect');
        clearChat();
        console.log('🎉 СОЕДИНЕНИЕ УСТАНОВЛЕНО!');
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
        if (pc) {
            pc.close();
            pc = null;
        }
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        if (socket && socket.connected && currentPartnerId) {
            socket.emit('end-call', { to: currentPartnerId });
        }
        
        hideRemoteVideo();
        isConnected = false;
        isActive = false;
        isSearching = false;
        isOfferer = false;
        setStatus('⏹ РАЗЪЕДИНЕНО', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        complainBtn.disabled = false;
        complainBtn.classList.add('active');
        
        partnerIdElement.textContent = '—';
        partnerIdElement.className = 'id';
        currentPartnerId = null;
        
        enableChat(false);
        chatStatus.textContent = '⛔ Не в чате';
        clearChat();
        
        stopTimer();
        timerDisplay.classList.remove('active');
        playSound('disconnect');
        console.log('🔴 Разъединение');
    }

    // ============ ЗАПУСК СЕССИИ ============
    async function startSession() {
        if (isActive || isSearching) return;
        if (isConnected) {
            disconnectCall();
            return;
        }
        if (!isPermissionGranted || !localStream) {
            alert('Сначала активируй доступ к камере/микрофону');
            return;
        }
        if (!socket || !socket.connected) {
            alert('⏳ Подключение к серверу... Подожди');
            return;
        }

        complainBtn.disabled = true;
        complainBtn.classList.remove('active');
        clearChat();
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
            clearChat();
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
        
        overlay.querySelectorAll('.complain-reason').forEach(el => {
            el.addEventListener('click', () => {
                overlay.querySelectorAll('.complain-reason').forEach(r => r.classList.remove('selected'));
                el.classList.add('selected');
                selectedReason = el.dataset.reason;
                document.getElementById('complainSend').disabled = false;
            });
        });
        
        document.getElementById('complainCancel').addEventListener('click', () => {
            overlay.remove();
        });
        
        document.getElementById('complainSend').addEventListener('click', () => {
            if (!selectedReason) return;
            
            const partnerId = partnerIdElement.textContent;
            console.log(`📨 Жалоба на ${partnerId}: ${selectedReason}`);
            
            showNotification('✅ Жалоба отправлена', 'Мы рассмотрим вашу жалобу в ближайшее время');
            playSound('message');
            
            overlay.remove();
            complainBtn.disabled = true;
            complainBtn.classList.remove('active');
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // ============ ЧАТ ============
    function clearChat() {
        chatMessages.innerHTML = '';
        const placeholder = document.createElement('div');
        placeholder.className = 'chat-placeholder';
        placeholder.textContent = 'Начни общение...';
        chatMessages.appendChild(placeholder);
    }

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
        if (!text || !isConnected || !currentPartnerId) {
            return;
        }
        
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
        console.log('📷 Своё видео отображается');
    }

    function showRemoteVideo(stream) {
        const videoTracks = stream.getVideoTracks();
        console.log(`📹 Видео-треков в стриме: ${videoTracks.length}`);
        
        if (videoTracks.length === 0) {
            console.warn('⚠️ В стриме нет видео-треков!');
            remotePlaceholder.textContent = '🎧 Только аудио';
            remotePlaceholder.style.color = '#ffbb44';
            remotePlaceholder.style.textShadow = '0 0 30px #ffbb4455';
            remotePlaceholder.style.display = 'block';
            return;
        }
        
        remotePlaceholder.style.display = 'none';
        remoteVideo.srcObject = stream;
        
        remoteVideo.onloadedmetadata = () => {
            remoteVideo.play().catch(() => {
                console.warn('⚠️ Не удалось воспроизвести видео собеседника');
            });
            console.log('📷 Видео собеседника загружено');
        };
        
        setTimeout(() => {
            if (remoteVideo.paused) {
                remoteVideo.play().catch(() => {});
            }
        }, 1000);
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
        console.log('📷 Видео собеседника скрыто');
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
            
            console.log('📷 Запрос медиа:', constraints);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ Медиа получено:', {
                video: stream.getVideoTracks().length,
                audio: stream.getAudioTracks().length
            });
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
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            if (pc) {
                pc.close();
            }
        });

        console.log('✦ ARTEFAKT RULET ✦');
        console.log('📡 Подключение к серверу...');
        console.log('🎥 Используется НАТИВНЫЙ WebRTC');
    }

    init();
})();
