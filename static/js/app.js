// AI Voice Platform: "Ai voice bu kero" JS Frontend Logic
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // --- State Management ---
    const state = {
        keys: {
            elevenlabs: localStorage.getItem('elevenlabs_key') || '',
            openai: localStorage.getItem('openai_key') || ''
        },
        voices: {
            default: [],
            cloned: []
        },
        // Active audio objects
        tts: {
            audio: null,
            playing: false
        },
        changer: {
            originalUrl: '',
            processedUrl: '',
            activeMode: 'processed', // 'original' or 'processed'
            audio: null,
            playing: false,
            file: null
        },
        enhancer: {
            originalUrl: '',
            processedUrl: '',
            activeMode: 'processed', // 'original' or 'processed'
            audio: null,
            playing: false,
            file: null
        },
        cloning: {
            file: null
        }
    };

    // --- UI Elements ---
    const el = {
        // Hero Image and animation states
        heroImgCard: document.getElementById('hero-img-card'),
        heroStatusText: document.getElementById('hero-status-text'),
        heroImgGlow: document.getElementById('hero-img-glow'),

        // Badge
        demoBadge: document.getElementById('demo-badge'),
        
        // Settings Modal
        openSettingsBtn: document.getElementById('open-settings-btn'),
        closeSettingsBtn: document.getElementById('close-settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        elevenlabsInput: document.getElementById('settings-elevenlabs-key'),
        openaiInput: document.getElementById('settings-openai-key'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),

        // TTS
        ttsText: document.getElementById('tts-text'),
        ttsVoice: document.getElementById('tts-voice'),
        ttsBtn: document.getElementById('tts-btn'),
        ttsPlayerWrapper: document.getElementById('tts-player-wrapper'),
        ttsPlayPauseBtn: document.getElementById('tts-play-pause-btn'),
        ttsProgressBg: document.getElementById('tts-progress-bg'),
        ttsProgressBar: document.getElementById('tts-progress-bar'),
        ttsCurrentTime: document.getElementById('tts-current-time'),
        ttsDuration: document.getElementById('tts-duration'),
        ttsDownload: document.getElementById('tts-download'),

        // Voice Cloning
        cloneName: document.getElementById('clone-name'),
        cloneDropzone: document.getElementById('clone-dropzone'),
        cloneFile: document.getElementById('clone-file'),
        cloneFileName: document.getElementById('clone-file-name'),
        cloneBtn: document.getElementById('clone-btn'),
        clonedVoicesList: document.getElementById('cloned-voices-list'),

        // Voice Changer
        changerDropzone: document.getElementById('changer-dropzone'),
        changerFile: document.getElementById('changer-file'),
        changerFileName: document.getElementById('changer-file-name'),
        changerPitch: document.getElementById('changer-pitch'),
        changerSpeed: document.getElementById('changer-speed'),
        changerTone: document.getElementById('changer-tone'),
        pitchVal: document.getElementById('pitch-val'),
        speedVal: document.getElementById('speed-val'),
        changerBtn: document.getElementById('changer-btn'),
        changerPlayerWrapper: document.getElementById('changer-player-wrapper'),
        changerToggleOriginal: document.getElementById('changer-toggle-original'),
        changerToggleProcessed: document.getElementById('changer-toggle-processed'),
        changerPlayBtn: document.getElementById('changer-play-btn'),
        changerProgressBg: document.getElementById('changer-progress-bg'),
        changerProgressBar: document.getElementById('changer-progress-bar'),
        changerCurrentTime: document.getElementById('changer-current-time'),
        changerDuration: document.getElementById('changer-duration'),
        changerVisualizer: document.getElementById('changer-visualizer'),
        changerDownload: document.getElementById('changer-download'),

        // AI Enhancer
        enhancerDropzone: document.getElementById('enhancer-dropzone'),
        enhancerFile: document.getElementById('enhancer-file'),
        enhancerFileName: document.getElementById('enhancer-file-name'),
        enhancerMasterToggle: document.getElementById('enhancer-master-toggle'),
        enhancerBtn: document.getElementById('enhancer-btn'),
        enhancerPlayerWrapper: document.getElementById('enhancer-player-wrapper'),
        enhancerToggleOriginal: document.getElementById('enhancer-toggle-original'),
        enhancerToggleProcessed: document.getElementById('enhancer-toggle-processed'),
        enhancerPlayBtn: document.getElementById('enhancer-play-btn'),
        enhancerProgressBg: document.getElementById('enhancer-progress-bg'),
        enhancerProgressBar: document.getElementById('enhancer-progress-bar'),
        enhancerCurrentTime: document.getElementById('enhancer-current-time'),
        enhancerDuration: document.getElementById('enhancer-duration'),
        enhancerVisualizer: document.getElementById('enhancer-visualizer'),
        enhancerDownload: document.getElementById('enhancer-download')
    };

    // --- Helper Functions ---
    function updateHeroAnimationState(isPlaying, sourceName = '') {
        if (!el.heroImgCard || !el.heroStatusText || !el.heroImgGlow) return;
        if (isPlaying) {
            el.heroImgCard.classList.add('playing-active');
            el.heroImgCard.classList.remove('animate-float');
            el.heroStatusText.textContent = `Active: ${sourceName}`;
            el.heroImgGlow.style.opacity = "0.45";
        } else {
            el.heroImgCard.classList.remove('playing-active');
            el.heroImgCard.classList.add('animate-float');
            el.heroStatusText.textContent = "Idle / Monitoring Audio";
            el.heroImgGlow.style.opacity = "0.15";
        }
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function updateBadge() {
        if (state.keys.elevenlabs || state.keys.openai) {
            el.demoBadge.classList.add('hidden');
        } else {
            el.demoBadge.classList.remove('hidden');
        }
    }

    // Load API Keys from State to Modal Inputs
    function loadKeysToInputs() {
        el.elevenlabsInput.value = state.keys.elevenlabs;
        el.openaiInput.value = state.keys.openai;
    }

    // --- Dynamic Voice Population ---
    async function loadVoices() {
        try {
            const res = await fetch('/api/voices');
            const data = await res.json();
            if (data.success) {
                state.voices.default = data.default;
                state.voices.cloned = data.cloned;
                populateVoiceDropdown();
                renderClonedVoicesList();
            }
        } catch (err) {
            console.error('Failed to load voices:', err);
        }
    }

    function populateVoiceDropdown() {
        // Clear previous options
        el.ttsVoice.innerHTML = '';
        
        // Default System Voices Group
        const systemGroup = document.createElement('optgroup');
        systemGroup.label = 'Standard Neural Voices';
        state.voices.default.forEach(voice => {
            const opt = document.createElement('option');
            opt.value = voice.id;
            opt.dataset.provider = voice.provider;
            opt.textContent = `${voice.name} (${voice.provider === 'openai' ? 'OpenAI' : 'ElevenLabs'})`;
            systemGroup.appendChild(opt);
        });
        el.ttsVoice.appendChild(systemGroup);

        // Cloned Voices Group
        if (state.voices.cloned.length > 0) {
            const cloneGroup = document.createElement('optgroup');
            cloneGroup.label = 'Your Cloned Voices';
            state.voices.cloned.forEach(voice => {
                const opt = document.createElement('option');
                opt.value = voice.id;
                opt.dataset.provider = voice.provider;
                opt.textContent = voice.name;
                cloneGroup.appendChild(opt);
            });
            el.ttsVoice.appendChild(cloneGroup);
        }
    }

    function renderClonedVoicesList() {
        if (state.voices.cloned.length === 0) {
            el.clonedVoicesList.innerHTML = '<p class="text-xs text-gray-600 italic">No cloned voices saved yet.</p>';
            return;
        }

        el.clonedVoicesList.innerHTML = '';
        state.voices.cloned.forEach(voice => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 text-xs';
            
            const info = document.createElement('div');
            info.innerHTML = `<span class="font-bold text-white">${voice.name}</span> <span class="text-[9px] text-violet-400 uppercase ml-1">${voice.is_mock ? 'Demo Clone' : 'ElevenLabs'}</span>`;
            
            const action = document.createElement('button');
            action.className = 'text-violet-400 hover:text-white flex items-center space-x-1';
            action.innerHTML = '<i data-lucide="play" class="h-3.5 w-3.5"></i><span>Use</span>';
            action.onclick = () => {
                el.ttsVoice.value = voice.id;
                el.ttsText.focus();
                el.ttsText.placeholder = `Type text for ${voice.name} here...`;
            };

            item.appendChild(info);
            item.appendChild(action);
            el.clonedVoicesList.appendChild(item);
        });
        
        if (window.lucide) {
            window.lucide.createIcons({ attrs: { class: 'h-3.5 w-3.5' } });
        }
    }

    // --- Drag & Drop Utilities ---
    function setupDragAndDrop(dropzone, fileInput, callback) {
        dropzone.addEventListener('click', () => fileInput.click());
        
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-indigo-500', 'bg-black/45');
        });
        
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-indigo-500', 'bg-black/45');
        });
        
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-indigo-500', 'bg-black/45');
            if (e.dataTransfer.files.length > 0) {
                callback(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                callback(fileInput.files[0]);
            }
        });
    }

    // --- Audio Player Controller (Custom Design) ---
    function setupCustomPlayer(audioObj, uiElements, sourceName = '') {
        const { audio } = audioObj;
        const { playBtn, progressBg, progressBar, currentTimeText, durationText, visualizer } = uiElements;

        let visualInterval = null;

        function animateVisualizer() {
            if (!visualizer) return;
            const bars = visualizer.querySelectorAll('.visualizer-bar');
            bars.forEach(bar => {
                const height = Math.random() * 20 + 4; // Generate random animated peak
                bar.style.height = `${height}px`;
            });
        }

        function startVisualizer() {
            if (visualInterval) clearInterval(visualInterval);
            visualInterval = setInterval(animateVisualizer, 100);
        }

        function stopVisualizer() {
            if (visualInterval) {
                clearInterval(visualInterval);
                visualInterval = null;
            }
            if (visualizer) {
                const bars = visualizer.querySelectorAll('.visualizer-bar');
                bars.forEach((bar, idx) => {
                    bar.style.height = (idx % 2 === 0) ? '6px' : '4px';
                });
            }
        }

        // Play/Pause action
        playBtn.onclick = () => {
            if (audioObj.playing) {
                audioObj.audio.pause();
            } else {
                // Pause all other audio players first to avoid overlapping sounds
                if (state.tts.audio && audioObj !== state.tts) state.tts.audio.pause();
                if (state.changer.audio && audioObj !== state.changer) state.changer.audio.pause();
                if (state.enhancer.audio && audioObj !== state.enhancer) state.enhancer.audio.pause();
                
                audioObj.audio.play();
            }
        };

        // Audio Events
        audioObj.audio.addEventListener('play', () => {
            audioObj.playing = true;
            playBtn.innerHTML = '<i data-lucide="pause" class="h-5 w-5 fill-current"></i>';
            if (window.lucide) window.lucide.createIcons();
            startVisualizer();
            updateHeroAnimationState(true, sourceName);
        });

        audioObj.audio.addEventListener('pause', () => {
            audioObj.playing = false;
            playBtn.innerHTML = '<i data-lucide="play" class="h-5 w-5 fill-current"></i>';
            if (window.lucide) window.lucide.createIcons();
            stopVisualizer();
            updateHeroAnimationState(false);
        });

        audioObj.audio.addEventListener('ended', () => {
            audioObj.playing = false;
            playBtn.innerHTML = '<i data-lucide="play" class="h-5 w-5 fill-current"></i>';
            if (window.lucide) window.lucide.createIcons();
            progressBar.style.width = '0%';
            currentTimeText.textContent = '0:00';
            stopVisualizer();
            updateHeroAnimationState(false);
        });

        audioObj.audio.addEventListener('timeupdate', () => {
            const curr = audioObj.audio.currentTime;
            const dur = audioObj.audio.duration || 0;
            if (dur > 0) {
                const pct = (curr / dur) * 100;
                progressBar.style.width = `${pct}%`;
                currentTimeText.textContent = formatTime(curr);
                durationText.textContent = formatTime(dur);
            }
        });

        audioObj.audio.addEventListener('loadedmetadata', () => {
            durationText.textContent = formatTime(audioObj.audio.duration);
        });

        // Seek timeline click
        progressBg.onclick = (e) => {
            const rect = progressBg.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            const pct = clickX / width;
            if (audioObj.audio.duration) {
                audioObj.audio.currentTime = pct * audioObj.audio.duration;
            }
        };
    }

    // --- Section 1: Text-to-Speech (TTS) ---
    el.ttsBtn.onclick = async () => {
        const text = el.ttsText.value.trim();
        const voiceId = el.ttsVoice.value;
        const selectedOpt = el.ttsVoice.options[el.ttsVoice.selectedIndex];
        
        if (!text) {
            alert('Please enter some text to synthesize.');
            return;
        }
        if (!voiceId) {
            alert('Please select a voice.');
            return;
        }

        const provider = selectedOpt.dataset.provider;

        el.ttsBtn.disabled = true;
        el.ttsBtn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i><span>Generating...</span>';
        if (window.lucide) window.lucide.createIcons();

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voice_id: voiceId,
                    provider: provider,
                    elevenlabs_key: state.keys.elevenlabs,
                    openai_key: state.keys.openai
                })
            });

            const data = await response.json();
            if (data.success) {
                el.ttsPlayerWrapper.classList.remove('hidden');
                
                // Initialize audio
                if (state.tts.audio) {
                    state.tts.audio.pause();
                }
                state.tts.audio = new Audio(data.audioUrl);
                state.tts.playing = false;

                // Setup Custom Player controls
                setupCustomPlayer(state.tts, {
                    playBtn: el.ttsPlayPauseBtn,
                    progressBg: el.ttsProgressBg,
                    progressBar: el.ttsProgressBar,
                    currentTimeText: el.ttsCurrentTime,
                    durationText: el.ttsDuration,
                    visualizer: null
                }, 'TTS Output');

                // Set Download
                el.ttsDownload.onclick = () => {
                    const a = document.createElement('a');
                    a.href = data.audioUrl;
                    a.download = `kero_tts_${voiceId}.mp3`;
                    a.click();
                };

                // Play
                state.tts.audio.play();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to contact server.');
        } finally {
            el.ttsBtn.disabled = false;
            el.ttsBtn.innerHTML = '<i data-lucide="play" class="h-4 w-4 fill-current"></i><span>Generate Audio</span>';
            if (window.lucide) window.lucide.createIcons();
        }
    };

    // --- Section 2: Voice Cloning ---
    setupDragAndDrop(el.cloneDropzone, el.cloneFile, (file) => {
        state.cloning.file = file;
        el.cloneFileName.textContent = file.name;
        el.cloneDropzone.classList.add('border-violet-500/50', 'bg-violet-500/5');
    });

    el.cloneBtn.onclick = async () => {
        const name = el.cloneName.value.trim();
        const file = state.cloning.file;

        if (!file) {
            alert('Please select or upload a 10s voice sample file.');
            return;
        }

        el.cloneBtn.disabled = true;
        el.cloneBtn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i><span>Cloning...</span>';
        if (window.lucide) window.lucide.createIcons();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        formData.append('elevenlabs_key', state.keys.elevenlabs);

        try {
            const res = await fetch('/api/clone', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                alert(data.message || 'Voice cloned successfully!');
                
                // Clear fields
                el.cloneName.value = '';
                state.cloning.file = null;
                el.cloneFileName.textContent = 'Drag & drop or click to upload';
                el.cloneDropzone.classList.remove('border-violet-500/50', 'bg-violet-500/5');
                
                // Reload voices list
                await loadVoices();
            } else {
                alert(`Cloning Error: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to submit cloning request.');
        } finally {
            el.cloneBtn.disabled = false;
            el.cloneBtn.innerHTML = '<i data-lucide="sparkles" class="h-4 w-4"></i><span>Generate Cloned Voice</span>';
            if (window.lucide) window.lucide.createIcons();
        }
    };

    // --- Section 3: Voice Changer ---
    // Update Slider Values Display
    el.changerPitch.oninput = () => {
        el.pitchVal.textContent = `${el.changerPitch.value > 0 ? '+' : ''}${el.changerPitch.value} semitones`;
    };
    el.changerSpeed.oninput = () => {
        el.speedVal.textContent = `${parseFloat(el.changerSpeed.value).toFixed(1)}x`;
    };

    setupDragAndDrop(el.changerDropzone, el.changerFile, (file) => {
        state.changer.file = file;
        el.changerFileName.textContent = file.name;
        el.changerDropzone.classList.add('border-indigo-500/50', 'bg-indigo-500/5');
    });

    el.changerBtn.onclick = async () => {
        const file = state.changer.file;
        const pitch = el.changerPitch.value;
        const speed = el.changerSpeed.value;
        const tone = el.changerTone.value;

        if (!file) {
            alert('Please upload an audio file first.');
            return;
        }

        el.changerBtn.disabled = true;
        el.changerBtn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i><span>Transforming...</span>';
        if (window.lucide) window.lucide.createIcons();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('pitch', pitch);
        formData.append('speed', speed);
        if (tone) formData.append('tone', tone);

        try {
            const res = await fetch('/api/change', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                el.changerPlayerWrapper.classList.remove('hidden');
                
                state.changer.originalUrl = data.original_url;
                state.changer.processedUrl = data.processed_url;
                state.changer.activeMode = 'processed'; // default to processed

                // Initialize audio
                if (state.changer.audio) {
                    state.changer.audio.pause();
                }
                state.changer.audio = new Audio(data.processed_url);
                state.changer.playing = false;

                // Sync toggle visual styling
                el.changerToggleOriginal.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 text-gray-400 hover:text-white';
                el.changerToggleProcessed.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 bg-indigo-500/20 text-indigo-400';

                // Setup custom player UI
                setupCustomPlayer(state.changer, {
                    playBtn: el.changerPlayBtn,
                    progressBg: el.changerProgressBg,
                    progressBar: el.changerProgressBar,
                    currentTimeText: el.changerCurrentTime,
                    durationText: el.changerDuration,
                    visualizer: el.changerVisualizer
                }, 'Voice Changer');

                // Download Link
                el.changerDownload.onclick = () => {
                    const a = document.createElement('a');
                    a.href = state.changer.activeMode === 'processed' ? data.processed_url : data.original_url;
                    a.download = state.changer.activeMode === 'processed' ? 'transformed_kero.wav' : 'original_kero.wav';
                    a.click();
                };
            } else {
                alert(`Transformation Error: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to transform voice.');
        } finally {
            el.changerBtn.disabled = false;
            el.changerBtn.innerHTML = '<i data-lucide="repeat-2" class="h-4 w-4"></i><span>Apply Transformations</span>';
            if (window.lucide) window.lucide.createIcons();
        }
    };

    // Before/After comparison toggling for Changer (Preserves timestamp)
    function toggleChangerAudioMode(targetMode) {
        if (!state.changer.audio || state.changer.activeMode === targetMode) return;

        const wasPlaying = state.changer.playing;
        const currentTime = state.changer.audio.currentTime;
        
        state.changer.audio.pause();
        
        state.changer.activeMode = targetMode;
        const targetUrl = targetMode === 'original' ? state.changer.originalUrl : state.changer.processedUrl;
        
        // Load new file
        state.changer.audio.src = targetUrl;
        state.changer.audio.load();
        
        // Restore timestamp
        state.changer.audio.currentTime = currentTime;

        // Visual switches
        if (targetMode === 'original') {
            el.changerToggleOriginal.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 bg-white/10 text-white';
            el.changerToggleProcessed.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 text-gray-400 hover:text-white';
        } else {
            el.changerToggleOriginal.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 text-gray-400 hover:text-white';
            el.changerToggleProcessed.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 bg-indigo-500/20 text-indigo-400';
        }

        if (wasPlaying) {
            state.changer.audio.play();
        }
    }

    el.changerToggleOriginal.onclick = () => toggleChangerAudioMode('original');
    el.changerToggleProcessed.onclick = () => toggleChangerAudioMode('processed');

    // --- Section 4: AI Audio Enhancer ---
    setupDragAndDrop(el.enhancerDropzone, el.enhancerFile, (file) => {
        state.enhancer.file = file;
        el.enhancerFileName.textContent = file.name;
        el.enhancerDropzone.classList.add('border-emerald-500/50', 'bg-emerald-500/5');
    });

    el.enhancerBtn.onclick = async () => {
        const file = state.enhancer.file;
        const active = el.enhancerMasterToggle.checked;

        if (!file) {
            alert('Please upload a noisy audio file first.');
            return;
        }

        if (!active) {
            alert('Please enable the Master Enhancement Toggle to process.');
            return;
        }

        el.enhancerBtn.disabled = true;
        el.enhancerBtn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i><span>Enhancing...</span>';
        if (window.lucide) window.lucide.createIcons();

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/enhance', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                el.enhancerPlayerWrapper.classList.remove('hidden');
                
                state.enhancer.originalUrl = data.original_url;
                state.enhancer.processedUrl = data.processed_url;
                state.enhancer.activeMode = 'processed';

                // Initialize audio
                if (state.enhancer.audio) {
                    state.enhancer.audio.pause();
                }
                state.enhancer.audio = new Audio(data.processed_url);
                state.enhancer.playing = false;

                // Sync toggle styling
                el.enhancerToggleOriginal.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 text-gray-400 hover:text-white';
                el.enhancerToggleProcessed.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 bg-emerald-500/20 text-emerald-400';

                // Setup Custom Player
                setupCustomPlayer(state.enhancer, {
                    playBtn: el.enhancerPlayBtn,
                    progressBg: el.enhancerProgressBg,
                    progressBar: el.enhancerProgressBar,
                    currentTimeText: el.enhancerCurrentTime,
                    durationText: el.enhancerDuration,
                    visualizer: el.enhancerVisualizer
                }, 'Enhanced Audio');

                // Download Link
                el.enhancerDownload.onclick = () => {
                    const a = document.createElement('a');
                    a.href = state.enhancer.activeMode === 'processed' ? data.processed_url : data.original_url;
                    a.download = state.enhancer.activeMode === 'processed' ? 'enhanced_kero.wav' : 'original_kero.wav';
                    a.click();
                };
            } else {
                alert(`Enhancement Error: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to enhance audio.');
        } finally {
            el.enhancerBtn.disabled = false;
            el.enhancerBtn.innerHTML = '<i data-lucide="sparkles" class="h-4 w-4"></i><span>Process & Enhance</span>';
            if (window.lucide) window.lucide.createIcons();
        }
    };

    // Before/After comparison toggling for Enhancer (Preserves timestamp)
    function toggleEnhancerAudioMode(targetMode) {
        if (!state.enhancer.audio || state.enhancer.activeMode === targetMode) return;

        const wasPlaying = state.enhancer.playing;
        const currentTime = state.enhancer.audio.currentTime;
        
        state.enhancer.audio.pause();
        
        state.enhancer.activeMode = targetMode;
        const targetUrl = targetMode === 'original' ? state.enhancer.originalUrl : state.enhancer.processedUrl;
        
        // Load new source
        state.enhancer.audio.src = targetUrl;
        state.enhancer.audio.load();
        
        // Restore timestamp
        state.enhancer.audio.currentTime = currentTime;

        // Visual switches
        if (targetMode === 'original') {
            el.enhancerToggleOriginal.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 bg-white/10 text-white';
            el.enhancerToggleProcessed.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 text-gray-400 hover:text-white';
        } else {
            el.enhancerToggleOriginal.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 text-gray-400 hover:text-white';
            el.enhancerToggleProcessed.className = 'px-2.5 py-1 text-[10px] font-bold rounded-md transition duration-200 bg-emerald-500/20 text-emerald-400';
        }

        if (wasPlaying) {
            state.enhancer.audio.play();
        }
    }

    el.enhancerToggleOriginal.onclick = () => toggleEnhancerAudioMode('original');
    el.enhancerToggleProcessed.onclick = () => toggleEnhancerAudioMode('processed');

    // --- Settings Modal Handlers ---
    el.openSettingsBtn.onclick = () => {
        loadKeysToInputs();
        el.settingsModal.classList.remove('hidden');
    };

    el.closeSettingsBtn.onclick = () => {
        el.settingsModal.classList.add('hidden');
    };

    el.saveSettingsBtn.onclick = () => {
        state.keys.elevenlabs = el.elevenlabsInput.value.trim();
        state.keys.openai = el.openaiInput.value.trim();
        
        localStorage.setItem('elevenlabs_key', state.keys.elevenlabs);
        localStorage.setItem('openai_key', state.keys.openai);
        
        updateBadge();
        el.settingsModal.classList.add('hidden');
        alert('API keys saved successfully. Dashboard state updated.');
    };

    // Close modal if clicking background
    window.onclick = (e) => {
        if (e.target === el.settingsModal) {
            el.settingsModal.classList.add('hidden');
        }
    };

    // --- Initial Boot Core ---
    updateBadge();
    loadVoices();
});
