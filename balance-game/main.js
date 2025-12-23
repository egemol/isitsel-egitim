// ===== BALANCE GAME - FINAL REFACTORED SCRIPT =====

document.addEventListener('DOMContentLoaded', () => {
    // Game Constants
    const TOTAL_ROUNDS = 6;
    const MAX_SCORE_PER_ROUND = 100;
    const MAX_TOTAL_SCORE = 800; // Normalized maximum score

    // Game State
    let currentRound = 1;
    let totalScore = 0;
    let playingMixType = null; // Can be 'reference', 'user', or null
    let hasScored = false;
    let stems = {};
    let referenceMix = {};
    let userGains = {};
    let audioContextStarted = false;
    let currentPlayers = [];
    let masterVolume = null; // Master volume control

    // DOM Elements
    const scoreElement = document.getElementById('score');
    const roundElement = document.getElementById('round');
    const playReferenceBtn = document.getElementById('play-reference');
    const playUserMixBtn = document.getElementById('play-user-mix');
    const confirmBalanceBtn = document.getElementById('confirm-balance');
    const nextRoundBtn = document.getElementById('next-round');
    const restartGameBtn = document.getElementById('restart-game');
    const finalModal = document.getElementById('final-modal');
    const finalScoreSpan = document.getElementById('final-score');
    const finalMessageSpan = document.getElementById('final-message');
    const resultsDiv = document.getElementById('results');

    // Volume Control Elements
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');

    const faders = {
        drums: document.getElementById('drums-fader'),
        vocals: document.getElementById('vocals-fader'),
        bass: document.getElementById('bass-fader'),
        guitars: document.getElementById('guitars-fader'),
        others: document.getElementById('others-fader'),
    };

    const dbDisplays = {
        drums: document.getElementById('drums-db'),
        vocals: document.getElementById('vocals-db'),
        bass: document.getElementById('bass-db'),
        guitars: document.getElementById('guitars-db'),
        others: document.getElementById('others-db'),
    };

    // ===== MASTER VOLUME CONTROL =====
    function initializeMasterVolume() {
        if (!masterVolume) {
            masterVolume = new Tone.Volume(-6); // Default to 80% volume (-6dB)
            masterVolume.toDestination();
        }
    }

    // Volume control event handlers
    volumeSlider.addEventListener('input', () => {
        const value = parseInt(volumeSlider.value);
        volumeValue.textContent = `${value}%`;

        if (masterVolume) {
            // Convert percentage to dB: 0% = -60dB, 100% = 0dB
            const dbValue = value === 0 ? -60 : (value / 100) * 60 - 60;
            masterVolume.volume.value = dbValue;
        }
    });

    // ===== UTILITY FUNCTIONS =====
    const dbToGain = (db) => Math.pow(10, db / 20);

    // ===== AUDIO INITIALIZATION & CONTROL =====
    async function initializeAudioContext() {
        if (audioContextStarted) return true;
        try {
            await Tone.start();
            audioContextStarted = true;
            console.log('✅ Audio context started on user gesture.');
            return true;
        } catch (error) {
            console.error('❌ Failed to start audio context:', error);
            alert('Ses motoru başlatılamadı. Lütfen sayfayı yenileyip tekrar deneyin.');
            return false;
        }
    }

    function createGainNodes() {
        Object.keys(faders).forEach(stem => {
            initializeMasterVolume();
            userGains[stem] = new Tone.Gain(1.0).connect(masterVolume);
        });
    }

    async function playMix(mixType) {
        if (hasScored) return;

        console.log(`🎵 Playing ${mixType} mix...`);

        // If the user clicks the button for the mix that's already playing, stop it.
        if (playingMixType === mixType) {
            console.log(`🛑 Stopping ${mixType} mix`);
            stopAllAudio();
            return;
        }

        // Stop any currently playing mix before starting the new one.
        if (playingMixType !== null) {
            console.log(`🛑 Stopping ${playingMixType} to play ${mixType}`);
            stopAllAudio();
            // Give audio system time to clean up
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        playingMixType = mixType;
        setButtonsState();

        try {
            console.log('🎧 Initializing audio context...');
            await initializeAudioContext();

            console.log(`🎛️ Loading ${mixType} mix stems...`);
            const loadPromises = Object.keys(stems).map(stem => new Promise((resolve, reject) => {
                const url = stems[stem]?.url;
                if (!url) {
                    console.error(`❌ No URL for stem: ${stem}`);
                    return reject(`'${stem}' için ses dosyası yolu bulunamadı.`);
                }

                console.log(`📂 Loading ${stem}: ${url}`);
                const gainNode = (mixType === 'reference')
                    ? new Tone.Gain(dbToGain(referenceMix[stem])).connect(masterVolume)
                    : userGains[stem];

                const player = new Tone.Player({
                    url,
                    loop: true,
                    onload: () => {
                        console.log(`✅ ${stem} loaded successfully`);
                        resolve();
                    },
                    onerror: (error) => {
                        console.error(`❌ Error loading ${stem}:`, error);
                        reject(error);
                    }
                }).connect(gainNode);
                currentPlayers.push(player);
            }));

            await Promise.all(loadPromises);
            console.log(`✅ All stems loaded for ${mixType} mix`);

            // If playback was stopped while files were loading, abort.
            if (playingMixType !== mixType) {
                console.log('❌ Playback aborted while loading.');
                stopAllAudio(); // Clean up players that were created
                return;
            }

            const now = Tone.now() + 0.1; // Add slight buffer
            currentPlayers.forEach((player, index) => {
                try {
                    player.start(now);
                    console.log(`▶️ Started player ${index}`);
                } catch (error) {
                    console.error(`❌ Error starting player ${index}:`, error);
                }
            });
            console.log(`🔊 ${mixType} mix playing`);

        } catch (error) {
            console.error(`Oynatma hatası (${mixType}):`, error);
            alert(`Hata: ${error}`);
            stopAllAudio();
        }
    }

    function stopAllAudio() {
        console.log('🛑 Stopping all audio in Balance Game...');
        currentPlayers.forEach((player, index) => {
            if (player && !player.disposed) {
                try {
                    if (player.state === 'started') {
                        player.stop(0);
                    }
                    player.dispose();
                    console.log(`✅ Player ${index} stopped and disposed`);
                } catch (error) {
                    console.error(`❌ Error stopping player ${index}:`, error);
                }
            }
        });
        currentPlayers = [];
        playingMixType = null;
        setButtonsState();
        console.log('✅ All audio stopped');
    }

    // ===== GAME LOGIC =====
    function loadNewRound() {
        hasScored = false;
        // Randomly select from Track1, Track2, or Track3
        const trackOptions = ['track1', 'track2', 'track3'];
        const trackFolder = trackOptions[Math.floor(Math.random() * trackOptions.length)];

        ['drums', 'vocals', 'bass', 'guitars', 'others'].forEach(stem => {
            stems[stem] = { url: `multitracks/${trackFolder}/${stem}.mp3` };
        });

        referenceMix = {
            drums: parseFloat((Math.random() * 14 - 12).toFixed(1)),
            vocals: parseFloat((Math.random() * 14 - 12).toFixed(1)),
            bass: parseFloat((Math.random() * 14 - 12).toFixed(1)),
            guitars: parseFloat((Math.random() * 14 - 12).toFixed(1)),
            others: parseFloat((Math.random() * 14 - 12).toFixed(1)),
        };

        resetUserFaders();
        updateUI();
        console.log(`🎵 Loading round from ${trackFolder}`);
    }

    function confirmBalance() {
        if (hasScored) return;
        stopAllAudio();
        hasScored = true;

        const userMix = {};
        Object.keys(faders).forEach(stem => userMix[stem] = parseFloat(faders[stem].value));

        let roundScore = 0;
        const differences = {};
        Object.keys(userMix).forEach(stem => {
            const diff = userMix[stem] - referenceMix[stem];
            differences[stem] = diff;
            // Enhanced scoring for 5 channels: smaller differences give more points
            const accuracy = Math.max(0, 100 - Math.pow(Math.abs(diff), 2));
            roundScore += accuracy / 5; // Adjusted for 5 channels (drums, vocals, bass, guitars, others)
        });

        totalScore = Math.min(MAX_TOTAL_SCORE, totalScore + Math.round(roundScore));
        showResults(userMix, differences, Math.round(roundScore));
        updateUI();
    }

    function nextRound() {
        currentRound++;
        if (currentRound > TOTAL_ROUNDS) {
            endGame();
        } else {
            loadNewRound();
        }
    }

    async function endGame() {
        const percentage = Math.round((totalScore / MAX_TOTAL_SCORE) * 100);
        let message = '';
        if (percentage >= 90) message = '🎉 Mükemmel! Profesyonel miksaj becerilerin var!';
        else if (percentage >= 75) message = '🎵 Harika! Çok iyi bir kulağın var!';
        else if (percentage >= 60) message = '🎧 İyi! Biraz daha pratik yapmalısın.';
        else message = '🎼 Devam et! Her gün biraz daha iyi olacaksın.';

        finalScoreSpan.textContent = `${totalScore} / ${MAX_TOTAL_SCORE}`;
        finalMessageSpan.textContent = message;

        // Save score using the centralized game stats utility
        try {
            const { auth } = await import('../main/js/firebase-init.js');
            const { updateUserStats } = await import('../main/js/game-stats.js');

            const user = auth.currentUser;
            if (user) {
                const result = await updateUserStats(user.uid, 'Balance Game', totalScore);
                if (result.success) {
                    console.log('✅ Balance Game skoru kaydedildi ve istatistikler güncellendi:', totalScore);

                    // Show achievements if any were unlocked
                    if (result.achievements && result.achievements.length > 0) {
                        const achievementNames = result.achievements.map(a => a.name).join(', ');
                        alert(`🎉 Yeni başarım kazandınız: ${achievementNames}`);
                    }
                } else {
                    console.error('❌ Skor kaydedilirken hata oluştu:', result.error);
                }
            }
        } catch (error) {
            console.error('❌ Skor kaydetme hatası:', error);
        }

        finalModal.classList.remove('hidden');
    }

    // ===== UI MANAGEMENT =====
    function updateUI() {
        scoreElement.textContent = `${totalScore} / ${MAX_TOTAL_SCORE}`;
        roundElement.textContent = `${currentRound} / ${TOTAL_ROUNDS}`;
        confirmBalanceBtn.disabled = hasScored;
        nextRoundBtn.classList.toggle('hidden', !hasScored);
        resultsDiv.classList.toggle('hidden', !hasScored);

        // Lock/unlock play buttons based on whether the round is scored
        playReferenceBtn.disabled = hasScored;
        playUserMixBtn.disabled = hasScored;

        updateAllFaderDisplays();
    }

    function showResults(userMix, differences, roundScore) {
        Object.keys(userMix).forEach(stem => {
            document.getElementById(`user-${stem}`).textContent = `${userMix[stem].toFixed(1)} dB`;
            document.getElementById(`correct-${stem}`).textContent = `${referenceMix[stem].toFixed(1)} dB`;
            updateDifferenceDisplay(`diff-${stem}`, differences[stem]);
        });
        document.getElementById('round-score').textContent = `${roundScore} puan`;
    }

    function updateDifferenceDisplay(elementId, difference) {
        const element = document.getElementById(elementId);
        const diff = difference.toFixed(1);
        element.textContent = `${diff >= 0 ? '+' : ''}${diff} dB`;
        element.className = 'diff-value';
        if (Math.abs(diff) <= 1.5) element.classList.add('good');
        else if (Math.abs(diff) <= 3) element.classList.add('okay');
        else element.classList.add('poor');
    }

    function setButtonsState() {
        const isReferencePlaying = playingMixType === 'reference';
        const isUserPlaying = playingMixType === 'user';

        playReferenceBtn.innerHTML = isReferencePlaying
            ? '<span class="btn-icon">⏹️</span>Durdur'
            : '<span class="btn-icon">🔊</span>Referans Miksini Çal';

        playUserMixBtn.innerHTML = isUserPlaying
            ? '<span class="btn-icon">⏹️</span>Durdur'
            : '<span class="btn-icon">🎛️</span>Miksimi Dinle';
    }

    function updateAllFaderDisplays() {
        Object.keys(faders).forEach(stem => {
            dbDisplays[stem].textContent = `${parseFloat(faders[stem].value).toFixed(1)} dB`;
        });
    }

    function resetUserFaders() {
        Object.values(faders).forEach(fader => fader.value = 0);
        Object.values(userGains).forEach(gain => gain.gain.value = 1);
        updateAllFaderDisplays();
    }

    // ===== EVENT LISTENERS =====
    playReferenceBtn.addEventListener('click', () => playMix('reference'));
    playUserMixBtn.addEventListener('click', () => playMix('user'));
    confirmBalanceBtn.addEventListener('click', confirmBalance);
    nextRoundBtn.addEventListener('click', nextRound);
    restartGameBtn.addEventListener('click', () => {
        currentRound = 1;
        totalScore = 0;
        finalModal.classList.add('hidden');
        stopAllAudio();
        loadNewRound();
    });

    // Stop Audio Button
    const stopAudioBtn = document.getElementById('stop-audio');
    if (stopAudioBtn) {
        stopAudioBtn.addEventListener('click', () => {
            stopAllAudio();
            console.log('⏹️ Audio stopped by user');
        });
    }

    Object.keys(faders).forEach(stem => {
        faders[stem].addEventListener('input', (e) => {
            const dbValue = parseFloat(e.target.value);
            userGains[stem].gain.value = dbToGain(dbValue);
            dbDisplays[stem].textContent = `${dbValue.toFixed(1)} dB`;
        });
    });

    // ===== INITIALIZATION =====
    createGainNodes();
    loadNewRound();
}); 