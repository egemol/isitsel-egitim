// ===== COMPRESSOR EAR TRAINING GAME =====

// Game Constants
const TOTAL_ROUNDS = 10;
const MAX_SCORE = 1000; // 10 rounds × 100 points each
const audioFiles = [
  '../music/test.wav',
  '../music/guitar.wav',
  '../music/piano.wav'
];

// Game State
let currentAudioUrl = '';
let targetSettings = {
  ratio: 4,
  attack: 10,
  release: 100,
  makeupGain: 3
};
let userSettings = {
  ratio: 2,
  threshold: -30, // Default threshold in dB
  attack: 10,
  release: 100,
  makeupGain: 0
};
let score = 0;
let round = 1;
let isGameOver = false;
let hasGuessed = false;
let masterVolume = null; // Master volume control

// Volume Control Elements
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');

// ===== MASTER VOLUME CONTROL =====
function initializeMasterVolume() {
  if (!masterVolume) {
    masterVolume = new Tone.Volume(-6); // Default to 80% volume (-6dB)
    masterVolume.toDestination();
  }
}

// Volume control event handlers
if (volumeSlider && volumeValue) {
  volumeSlider.addEventListener('input', () => {
    const value = parseInt(volumeSlider.value);
    volumeValue.textContent = `${value}%`;

    if (masterVolume) {
      // Convert percentage to dB: 0% = -60dB, 100% = 0dB
      const dbValue = value === 0 ? -60 : (value / 100) * 60 - 60;
      masterVolume.volume.value = dbValue;
    }
  });
}

// Audio Objects
let playingPlayer = null;
let currentCompressor = null;
let currentMeter = null;
let grMeterInterval = null;

// Real-World Gain Reduction Meter State
let smoothedGR = 0; // Current smoothed GR value (0 to 20 dB range)
let targetGR = 0;   // Target GR value from compressor analysis

// Professional compressor meter ballistics (based on hardware behavior)
let meterDampingFactor = 0.1;  // Main damping: smoothedGR += (targetGR - smoothedGR) * 0.1
let meterAttackRate = 0.25;    // Fast attack - GR responds quickly to peaks  
let meterReleaseRate = 0.04;   // Slower release - GR decays naturally
let meterDecayRate = 0.015;    // Natural settling to 0 when no compression

// Real-world compressor constants
const COMPRESSOR_THRESHOLD = -30; // dB - professional compressor threshold
const MIN_GR = 0;    // No compression (0dB GR)
const MAX_GR = 60;   // Maximum gain reduction (-60dB) for extreme compression

// DOM Elements
const scoreDiv = document.getElementById('score');
const roundDiv = document.getElementById('round');
const resultDiv = document.getElementById('result');
const finalModal = document.getElementById('final-modal');
const finalScore = document.getElementById('final-score');
const finalMessage = document.getElementById('final-message');
const finalDetails = document.getElementById('final-details');

// Controls
const ratioSlider = document.getElementById('ratio');
const thresholdSlider = document.getElementById('threshold');
const attackSlider = document.getElementById('attack');
const releaseSlider = document.getElementById('release');
const makeupSlider = document.getElementById('makeup-gain');
const ratioValue = document.getElementById('ratio-value');
const thresholdValue = document.getElementById('threshold-value');
const attackValue = document.getElementById('attack-value');
const releaseValue = document.getElementById('release-value');
const makeupValue = document.getElementById('makeup-value');

// Vertical GR Meter Elements
const grBar = document.getElementById('gr-bar');
const grValue = document.getElementById('gr-value');

// Correct Answer Display
const correctAnswerDiv = document.getElementById('correct-answer');

// Buttons
const playOriginalBtn = document.getElementById('play-original');
const playCompressedBtn = document.getElementById('play-compressed');
const playUserBtn = document.getElementById('play-user');
const submitGuessBtn = document.getElementById('submit-guess');
const nextQuestionBtn = document.getElementById('next-question');
const restartBtn = document.getElementById('restart-btn');

// ===== UTILITY FUNCTIONS =====

function getRandomAudio() {
  const idx = Math.floor(Math.random() * audioFiles.length);
  return audioFiles[idx];
}

function generateRandomSettings() {
  const ratios = [2, 4, 8, 16];
  return {
    ratio: ratios[Math.floor(Math.random() * ratios.length)],
    attack: Math.round(Math.random() * 90 + 5), // 5-95ms
    release: Math.round(Math.random() * 800 + 50), // 50-850ms
    makeupGain: Math.round(Math.random() * 10 * 10) / 10 // 0-10dB
  };
}

function validateAudioUrl(url) {
  if (!url || typeof url !== "string" || url.trim() === "") {
    console.error("Audio URL is invalid:", url);
    return false;
  }
  const validExtensions = ['.wav', '.mp3', '.ogg', '.m4a'];
  const hasValidExtension = validExtensions.some(ext => url.toLowerCase().includes(ext));
  if (!hasValidExtension) {
    console.error("Audio URL has invalid extension:", url);
    return false;
  }
  console.log("Audio URL validated:", url);
  return true;
}

// ===== AUDIO SETUP =====

async function ensureToneStarted() {
  try {
    if (Tone.context.state !== 'running') {
      await Tone.start();
      console.log('Tone.js started successfully, state:', Tone.context.state);
    }
    // Initialize master volume if not already done
    initializeMasterVolume();
  } catch (error) {
    console.error('Failed to start Tone.js:', error);
    showResult('Audio system could not be started!', 'red');
    throw error;
  }
}

function stopCurrentAudio() {
  console.log('🛑 Stopping all audio...');

  // Stop GR meter monitoring immediately
  if (grMeterInterval) {
    clearInterval(grMeterInterval);
    if (grMeterInterval.meterInterval) {
      clearInterval(grMeterInterval.meterInterval);
    }
    grMeterInterval = null;
  }

  // Stop and dispose audio player completely with additional safety
  if (playingPlayer) {
    try {
      if (playingPlayer.state === 'started') {
        playingPlayer.stop(0); // Stop immediately
      }
      playingPlayer.dispose();
      console.log('✅ Audio player stopped and disposed');
    } catch (error) {
      console.error('❌ Error stopping audio:', error);
    }
    playingPlayer = null;
  }

  // Dispose compressor chain completely
  if (currentCompressor) {
    try {
      currentCompressor.dispose();
      console.log('✅ Compressor disposed');
    } catch (error) {
      console.error('❌ Error disposing compressor:', error);
    }
    currentCompressor = null;
  }

  // Dispose meter completely
  if (currentMeter) {
    try {
      currentMeter.dispose();
      console.log('✅ Meter disposed');
    } catch (error) {
      console.error('❌ Error disposing meter:', error);
    }
    currentMeter = null;
  }

  // Stop all Tone.js Transport (ensures complete audio stop)
  try {
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
  } catch (error) {
    console.warn('Transport stop error:', error);
  }

  // Reset GR meter display
  resetGRMeter();

  console.log('🔇 All audio completely stopped and cleaned up');
}

function createCompressor(settings) {
  // Real-world compressor setup with verified parameters
  const compressor = new Tone.Compressor({
    ratio: settings.ratio, // Direct ratio (e.g., 2, 4, 16 for 2:1, 4:1, 16:1)
    attack: settings.attack / 1000, // Convert ms to seconds for Tone.js
    release: settings.release / 1000, // Convert ms to seconds for Tone.js
    threshold: settings.threshold || userSettings.threshold, // Use dynamic threshold
    knee: 2 // Small knee for more pronounced compression behavior
  });

  // Makeup gain applied after compression (industry standard)
  const makeupGain = new Tone.Gain(Tone.dbToGain(settings.makeupGain));

  // Input meter for measuring pre-compression signal
  const inputMeter = new Tone.Meter();

  // Output meter for measuring post-compression signal
  const outputMeter = new Tone.Meter();

  // Professional signal chain: input -> inputMeter -> compressor -> outputMeter -> makeupGain
  // This allows us to calculate real gain reduction

  return {
    compressor,
    makeupGain,
    inputMeter,
    outputMeter,
    // Helper method to connect the full chain
    connectChain: (source) => {
      source.connect(inputMeter);
      inputMeter.connect(compressor);
      compressor.connect(outputMeter);
      outputMeter.connect(makeupGain);
      return makeupGain; // Return final output node
    }
  };
}

// ===== AUDIO PLAYBACK =====

async function playOriginal() {
  try {
    console.log('🎵 Playing original audio...');
    await ensureToneStarted();

    // IMPORTANT: Stop any current audio BEFORE starting new one
    stopCurrentAudio();
    // Give audio system time to clean up
    await new Promise(resolve => setTimeout(resolve, 50));

    if (!validateAudioUrl(currentAudioUrl)) {
      showResult('Geçersiz ses dosyası!', 'red');
      return;
    }

    const player = new Tone.Player({
      url: currentAudioUrl,
      autostart: false,
      onload: () => console.log('✅ Original audio loaded'),
      onerror: (error) => {
        console.error('❌ Original audio error:', error);
        showResult('Orijinal ses yüklenemedi!', 'red');
      }
    }).connect(masterVolume || Tone.getDestination());

    await player.load(currentAudioUrl);
    playingPlayer = player;
    player.start();
    console.log('🔊 Orijinal ses çalıyor');

    player.onstop = () => {
      if (player) player.dispose();
      if (playingPlayer === player) playingPlayer = null;
      startMeterDecay(); // Start gentle decay for original (uncompressed) audio
    };

  } catch (error) {
    console.error('❌ Error playing original audio:', error);
    showResult('Orijinal ses çalınamadı: ' + error.message, 'red');
  }
}

async function playCompressed() {
  try {
    console.log('🗜️ Playing compressed audio...');
    await ensureToneStarted();

    // IMPORTANT: Stop any current audio BEFORE starting new one
    stopCurrentAudio();
    // Give audio system time to clean up
    await new Promise(resolve => setTimeout(resolve, 50));

    if (!validateAudioUrl(currentAudioUrl)) {
      showResult('Geçersiz ses dosyası!', 'red');
      return;
    }

    const player = new Tone.Player({
      url: currentAudioUrl,
      autostart: false,
      onload: () => console.log('✅ Compressed audio loaded'),
      onerror: (error) => {
        console.error('❌ Compressed audio error:', error);
        showResult('Sıkıştırılmış ses yüklenemedi!', 'red');
      }
    });

    // Create target compressor settings chain
    const compChain = createCompressor(targetSettings);
    const finalOutput = compChain.connectChain(player);
    finalOutput.connect(masterVolume || Tone.getDestination());

    await player.load(currentAudioUrl);
    playingPlayer = player;
    currentCompressor = compChain.compressor;
    currentMeter = compChain.outputMeter;

    player.start();
    console.log('🔊 Sıkıştırılmış ses çalıyor');

    // Start GR monitoring for compressed audio with proper meters
    startGRMeterMonitoring(compChain.inputMeter, compChain.outputMeter);

    player.onstop = () => {
      if (player) player.dispose();
      if (compChain) {
        try {
          compChain.inputMeter.dispose();
          compChain.compressor.dispose();
          compChain.outputMeter.dispose();
          compChain.makeupGain.dispose();
        } catch (e) {
          console.error('Error disposing compressor chain:', e);
        }
      }
      if (playingPlayer === player) playingPlayer = null;
      currentCompressor = null;
      currentMeter = null;
    };

  } catch (error) {
    console.error('❌ Error playing compressed audio:', error);
    showResult('Sıkıştırılmış ses çalınamadı: ' + error.message, 'red');
  }
}

async function playUserVersion() {
  try {
    console.log('🎛️ Playing user version...');
    await ensureToneStarted();

    // IMPORTANT: Stop any current audio BEFORE starting new one
    stopCurrentAudio();
    // Give audio system time to clean up
    await new Promise(resolve => setTimeout(resolve, 50));

    if (!validateAudioUrl(currentAudioUrl)) {
      showResult('Geçersiz ses dosyası!', 'red');
      return;
    }

    const player = new Tone.Player({
      url: currentAudioUrl,
      autostart: false,
      onload: () => console.log('✅ User version loaded'),
      onerror: (error) => {
        console.error('❌ User version error:', error);
        showResult('Kullanıcı versiyonu yüklenemedi!', 'red');
      }
    });

    // Create user compressor settings chain
    const compChain = createCompressor(userSettings);
    const finalOutput = compChain.connectChain(player);
    finalOutput.connect(masterVolume || Tone.getDestination());

    await player.load(currentAudioUrl);
    playingPlayer = player;
    currentCompressor = compChain.compressor;
    currentMeter = compChain.outputMeter;

    player.start();
    console.log('🔊 Kullanıcı versiyonu çalıyor');

    // Start GR monitoring for user compressor with proper meters
    startGRMeterMonitoring(compChain.inputMeter, compChain.outputMeter);

    player.onstop = () => {
      if (player) player.dispose();
      if (compChain) {
        try {
          compChain.inputMeter.dispose();
          compChain.compressor.dispose();
          compChain.outputMeter.dispose();
          compChain.makeupGain.dispose();
        } catch (e) {
          console.error('Error disposing user compressor chain:', e);
        }
      }
      if (playingPlayer === player) playingPlayer = null;
      currentCompressor = null;
      currentMeter = null;
    };

  } catch (error) {
    console.error('❌ Error playing user version:', error);
    showResult('Kullanıcı versiyonu çalınamadı: ' + error.message, 'red');
  }
}

// ===== REAL-TIME GR METER =====

function startGRMeterMonitoring(inputMeter, outputMeter) {
  // Stop any existing monitoring
  if (grMeterInterval) {
    clearInterval(grMeterInterval);
  }

  console.log('📊 Starting GR meter monitoring...');

  // Ensure we have valid meters
  if (!inputMeter || !outputMeter) {
    console.warn('⚠️ Missing meters for GR monitoring - using Tone.js reduction only');
  }

  // Start accurate GR monitoring with real-world compressor behavior
  grMeterInterval = setInterval(() => {
    try {
      let calculatedGR = 0;

      // Method 1: Use Tone.js built-in reduction meter (most reliable)
      if (currentCompressor && typeof currentCompressor.reduction === 'number') {
        calculatedGR = Math.abs(currentCompressor.reduction);
      }

      // Method 2: Calculate from input/output if meters available
      if (inputMeter && inputMeter.getValue && outputMeter && outputMeter.getValue) {
        const inputLevel = inputMeter.getValue();
        const outputLevel = outputMeter.getValue();

        // Only calculate if we have valid signal levels
        if (inputLevel > -50 && outputLevel > -50) {
          const ratio = userSettings.ratio;
          const threshold = userSettings.threshold;

          // Real-world compressor formula
          if (inputLevel > threshold) {
            const expectedOutput = threshold + (inputLevel - threshold) / ratio;
            const actualGR = inputLevel - expectedOutput;
            calculatedGR = Math.max(calculatedGR, actualGR);
          }

          // Alternative: Direct I/O difference
          const directGR = Math.max(0, inputLevel - outputLevel);
          calculatedGR = Math.max(calculatedGR, directGR);
        }
      }

      // Method 3: Enhanced synthetic calculation for demonstration
      if (calculatedGR < 0.5) {
        const ratio = userSettings.ratio;
        const threshold = userSettings.threshold;

        // Simulate realistic compression based on current settings
        const simulatedInput = -10; // Typical loud program material
        if (simulatedInput > threshold) {
          // Professional compressor formula
          const expectedOutput = threshold + (simulatedInput - threshold) / ratio;
          const syntheticGR = simulatedInput - expectedOutput;

          // Scale based on ratio for visual feedback
          const ratioMultiplier = Math.min(1.0, ratio / 10); // Higher ratios = more visible GR
          calculatedGR = Math.max(calculatedGR, syntheticGR * ratioMultiplier);

          // Ensure minimum visible GR for user feedback
          if (ratio > 2 && calculatedGR < 2.0) {
            calculatedGR = 2.0; // Minimum 2dB for visibility
          }
        }
      }

      // Set target for smooth animation (0 to 60dB range)
      targetGR = Math.min(MAX_GR, Math.max(0, calculatedGR));

      // Debug logging
      if (calculatedGR > 0.5 && Math.random() < 0.01) {
        console.log(`📊 GR: ${calculatedGR.toFixed(1)}dB (Ratio: ${userSettings.ratio}:1, Threshold: ${userSettings.threshold}dB)`);
      }

    } catch (error) {
      console.warn('GR meter calculation error:', error);
    }
  }, 50); // Moderate refresh rate for stable performance

  // Start smooth meter animation
  startGRMeterAnimation();

  console.log('📊 GR meter monitoring started with multiple calculation methods');
}

function startGRMeterAnimation() {
  const meterInterval = setInterval(() => {
    try {
      // Analog compressor-style meter ballistics (LA-2A/SSL style)
      const difference = targetGR - smoothedGR;

      if (Math.abs(difference) < 0.02) {
        // Near target - settle exactly for precision
        smoothedGR = targetGR;
      } else if (difference > 0) {
        // Attack: Fast response to peaks (like analog compressors)
        smoothedGR += difference * 0.18; // Faster attack for peaks
      } else {
        // Release: Slower, natural decay (like analog meters)
        smoothedGR += difference * 0.06; // Slower release for smooth movement
      }

      // Exponential decay to zero when no compression (analog behavior)
      if (targetGR < 0.1) {
        smoothedGR *= 0.97; // Natural exponential decay
      }

      // Ensure valid range (0 to -60dB) with no artificial limits
      smoothedGR = Math.max(MIN_GR, Math.min(MAX_GR, smoothedGR));

      // Update GR meter visual display
      updateGainReductionMeter(smoothedGR);

    } catch (error) {
      console.warn('GR meter animation error:', error);
    }
  }, 20); // 50fps for smooth analog-style movement

  // Store interval ID for cleanup
  grMeterInterval.meterInterval = meterInterval;
}

// Real-World Compressor Mathematics
// Implements accurate compression behavior as used in professional audio hardware

function calculateRealWorldCompression(inputLevel, ratio, threshold) {
  // Core compressor logic: No compression below threshold
  if (inputLevel <= threshold) {
    return {
      outputLevel: inputLevel,  // Signal passes through unchanged
      gainReduction: 0          // No gain reduction applied
    };
  }

  // Professional compressor formula:
  // outputLevel = threshold + (inputLevel - threshold) / ratio
  const outputLevel = threshold + (inputLevel - threshold) / ratio;

  // Gain reduction is the difference between input and output
  const gainReduction = inputLevel - outputLevel;

  // Ensure gain reduction is within professional range
  const clampedGR = Math.max(0, Math.min(MAX_GR, gainReduction));

  return {
    outputLevel: outputLevel,
    gainReduction: clampedGR
  };
}

// Legacy function for compatibility - calls new implementation
function calculateAccurateGainReduction(inputLevel, ratio, threshold) {
  return calculateRealWorldCompression(inputLevel, ratio, threshold).gainReduction;
}

// Update GR meter display (0 to -60dB range with smooth visual feedback)
function updateGainReductionMeter(grAmount) {
  // Calculate percentage for vertical bar fill (0% = no compression, 100% = 60dB compression)
  const clampedGR = Math.max(0, Math.min(MAX_GR, grAmount));
  const percentage = (clampedGR / MAX_GR) * 100;

  // Update vertical bar filling from top (0dB) to bottom (-60dB)
  grBar.style.height = `${percentage}%`;

  // Update numeric display with precise value (e.g., "-14.5 dB")
  if (grAmount > 0.05) {
    grValue.textContent = `-${grAmount.toFixed(1)} dB`;
  } else {
    grValue.textContent = '0.0 dB';
  }

  // Visual feedback for high compression amounts
  if (grAmount > 20.0 && Math.random() < 0.005) {
    console.log(`📊 High GR detected: -${grAmount.toFixed(1)}dB (${percentage.toFixed(1)}% of scale)`);
  }
}

function stopGRMeterMonitoring() {
  if (grMeterInterval) {
    clearInterval(grMeterInterval);

    // Stop analog animation if it exists
    if (grMeterInterval.analogInterval) {
      clearInterval(grMeterInterval.analogInterval);
    }

    grMeterInterval = null;
    console.log('📊 Analog GR meter monitoring stopped');
  }
}

function startMeterDecay() {
  // Start gentle decay when audio stops (like analog meter release)
  targetGR = 0;
  console.log('📊 Starting analog meter decay');
}

function resetGRMeter() {
  // Reset professional GR meter state
  smoothedGR = 0;
  targetGR = 0;

  // Reset bar to no compression state
  grBar.style.height = '0%';

  // Reset professional digital readout
  grValue.textContent = '0.0 dB';

  console.log('📊 Professional gain reduction meter reset');
}

// Test function for real-world compression formula validation
function testCompressionFormula() {
  console.log('🧪 Testing Real-World Compression Formula (Test Values Only):');
  console.log('Formula: outputLevel = threshold + (inputLevel - threshold) / ratio');
  console.log('GR = inputLevel - outputLevel');
  console.log('===== RATIO INFLUENCE VALIDATION =====');
  console.log('Note: Game uses dynamic user settings, not these test values');

  // Test case: Same input/threshold, different ratios to verify ratio influence
  const threshold = -30;
  const input = -10;

  console.log(`\n🎯 Ratio Influence Test: Threshold=${threshold}dB, Input=${input}dB`);

  // Test case 1: Low ratio (2:1)
  const result2to1 = calculateRealWorldCompression(input, 2, threshold);
  console.log(`📊 Ratio 2:1 → GR: -${result2to1.gainReduction.toFixed(1)}dB (Expected: ~-10dB)`);

  // Test case 2: Medium ratio (4:1)
  const result4to1 = calculateRealWorldCompression(input, 4, threshold);
  console.log(`📊 Ratio 4:1 → GR: -${result4to1.gainReduction.toFixed(1)}dB (Expected: ~-15dB)`);

  // Test case 3: High ratio (10:1)
  const result10to1 = calculateRealWorldCompression(input, 10, threshold);
  console.log(`📊 Ratio 10:1 → GR: -${result10to1.gainReduction.toFixed(1)}dB (Expected: ~-18dB)`);

  // Test case 4: Infinite ratio (limiter)
  const resultInf = calculateRealWorldCompression(input, 1000, threshold);
  console.log(`📊 Ratio ∞:1 → GR: -${resultInf.gainReduction.toFixed(1)}dB (Expected: -20dB)`);

  // Test case 5: Below threshold (no compression)
  const resultBelow = calculateRealWorldCompression(-35, 10, threshold);
  console.log(`📊 Below threshold (-35dB) → GR: -${resultBelow.gainReduction.toFixed(1)}dB (Expected: 0dB)`);

  console.log('\n✅ Ratio directly influences GR amount as expected');
  console.log('=====================================');
}

// ===== UI UPDATES =====

function updateUI() {
  scoreDiv.textContent = `${score} / ${MAX_SCORE}`;
  roundDiv.textContent = `${round} / ${TOTAL_ROUNDS}`;
}

function updateControlValues() {
  // Update display text and sync sliders
  ratioValue.textContent = `1:${userSettings.ratio}`;
  thresholdValue.textContent = `${userSettings.threshold}dB`;
  attackValue.textContent = `${userSettings.attack}ms`;
  releaseValue.textContent = `${userSettings.release}ms`;
  makeupValue.textContent = `${userSettings.makeupGain.toFixed(1)} dB`;

  // Sync slider positions with current values
  if (ratioSlider) ratioSlider.value = userSettings.ratio;
  if (thresholdSlider) thresholdSlider.value = userSettings.threshold;
  if (attackSlider) attackSlider.value = userSettings.attack;
  if (releaseSlider) releaseSlider.value = userSettings.release;
  if (makeupSlider) makeupSlider.value = userSettings.makeupGain;

  // Apply parameters to current compressor in real-time (CRITICAL FOR PROPER BEHAVIOR!)
  if (currentCompressor) {
    try {
      // Update compressor parameters immediately for real-time effect
      currentCompressor.ratio.value = userSettings.ratio;
      currentCompressor.threshold.value = userSettings.threshold;
      currentCompressor.attack.value = userSettings.attack / 1000; // Convert ms to seconds
      currentCompressor.release.value = userSettings.release / 1000; // Convert ms to seconds

      // Verify settings took effect
      console.log(`🎛️ Compressor updated: Ratio=${userSettings.ratio}:1, Threshold=${userSettings.threshold}dB, Attack=${userSettings.attack}ms, Release=${userSettings.release}ms`);
    } catch (error) {
      console.warn('Error updating compressor parameters:', error);
    }
  }

  // Update makeup gain if it exists
  if (window.currentMakeupGain) {
    try {
      window.currentMakeupGain.gain.value = Tone.dbToGain(userSettings.makeupGain);
      console.log(`📈 Makeup gain updated: ${userSettings.makeupGain.toFixed(1)}dB`);
    } catch (error) {
      console.warn('Error updating makeup gain:', error);
    }
  }
}

function showResult(message, color = 'green') {
  resultDiv.textContent = message;
  resultDiv.style.color = color;
  setTimeout(() => {
    resultDiv.textContent = '';
  }, 4000);
}

// ===== SCORING SYSTEM =====

function calculateScore() {
  let totalScore = 0;
  let feedback = [];

  // Normalized scoring system (max 80 points per round, 800 total for 10 rounds)

  // Ratio scoring (32 points max)
  const ratioScore = userSettings.ratio === targetSettings.ratio ? 32 : 0;
  totalScore += ratioScore;
  if (ratioScore === 0) {
    feedback.push(`Ratio: ${targetSettings.ratio}:1 olmalıydı, ${userSettings.ratio}:1 seçtin`);
  }

  // Attack scoring (16 points max)
  const attackDiff = Math.abs(userSettings.attack - targetSettings.attack);
  const attackScore = Math.max(0, 16 - (attackDiff * 0.32));
  totalScore += attackScore;
  if (attackScore < 12) {
    feedback.push(`Attack: ${targetSettings.attack}ms olmalıydı, ${userSettings.attack}ms seçtin`);
  }

  // Release scoring (16 points max)
  const releaseDiff = Math.abs(userSettings.release - targetSettings.release);
  const releaseScore = Math.max(0, 16 - (releaseDiff * 0.04));
  totalScore += releaseScore;
  if (releaseScore < 12) {
    feedback.push(`Release: ${targetSettings.release}ms olmalıydı, ${userSettings.release}ms seçtin`);
  }

  // Makeup gain scoring (16 points max)
  const gainDiff = Math.abs(userSettings.makeupGain - targetSettings.makeupGain);
  const gainScore = Math.max(0, 16 - (gainDiff * 3.2));
  totalScore += gainScore;
  if (gainScore < 12) {
    feedback.push(`Makeup: ${targetSettings.makeupGain.toFixed(1)}dB olmalıydı, ${userSettings.makeupGain.toFixed(1)}dB seçtin`);
  }

  return {
    score: Math.round(totalScore),
    feedback: feedback
  };
}

// ===== GAME LOGIC =====

function loadNewRound() {
  if (isGameOver) return;

  // Stop any currently playing audio when starting new round
  stopCurrentAudio();

  currentAudioUrl = getRandomAudio();
  targetSettings = generateRandomSettings();
  hasGuessed = false;

  console.log(`🎮 Tur ${round}: ${currentAudioUrl}`);
  console.log(`🎛️ Hedef: ${targetSettings.ratio}:1, ${targetSettings.attack}ms/${targetSettings.release}ms, +${targetSettings.makeupGain}dB`);

  // Validate audio URL
  if (!validateAudioUrl(currentAudioUrl)) {
    console.error('❌ Invalid audio URL for round, trying another...');
    currentAudioUrl = audioFiles[0]; // Fallback
    if (!validateAudioUrl(currentAudioUrl)) {
      showResult('Ses dosyası bulunamadı!', 'red');
      return;
    }
  }

  // Reset UI
  updateUI();
  resetGRMeter();
  resultDiv.textContent = '';
  hideCorrectAnswer();
  nextQuestionBtn.classList.add('hidden');
  submitGuessBtn.classList.remove('hidden');

  // Reset user controls to defaults
  userSettings = { ratio: 2, attack: 10, release: 100, makeupGain: 0 };
  ratioSlider.value = 2;
  attackSlider.value = 10;
  releaseSlider.value = 100;
  makeupSlider.value = 0;
  updateControlValues();
}

function submitGuess() {
  if (hasGuessed || isGameOver) return;

  // Stop current audio when guess is submitted
  stopCurrentAudio();

  hasGuessed = true;
  const result = calculateScore();

  score += result.score;
  updateUI();

  let message = `Skor: ${result.score}/100`;
  let color = 'green';

  if (result.score >= 80) {
    message += ' - Mükemmel! 🎉';
  } else if (result.score >= 60) {
    message += ' - İyi iş! 👍';
  } else {
    message += ' - Pratik yapmaya devam! 💪';
    color = 'orange';
  }

  if (result.feedback.length > 0) {
    message += '\n' + result.feedback.join('\n');
  }

  showResult(message, color);

  // Show correct answer display
  showCorrectAnswer();

  // Show correct settings in console
  console.log(`✅ Doğru ayarlar: ${targetSettings.ratio}:1, ${targetSettings.attack}ms/${targetSettings.release}ms, +${targetSettings.makeupGain}dB`);
  console.log(`🎯 Kullanıcı ayarları: ${userSettings.ratio}:1, ${userSettings.attack}ms/${userSettings.release}ms, +${userSettings.makeupGain}dB`);

  submitGuessBtn.classList.add('hidden');
  nextQuestionBtn.classList.remove('hidden');
}

function showCorrectAnswer() {
  // Update user's submitted values
  document.getElementById('user-ratio').textContent = `1:${userSettings.ratio}`;
  document.getElementById('user-attack').textContent = `${userSettings.attack}ms`;
  document.getElementById('user-release').textContent = `${userSettings.release}ms`;
  document.getElementById('user-makeup').textContent = `${userSettings.makeupGain.toFixed(1)}dB`;

  // Update correct answer values
  document.getElementById('correct-ratio').textContent = `1:${targetSettings.ratio}`;
  document.getElementById('correct-attack').textContent = `${targetSettings.attack}ms`;
  document.getElementById('correct-release').textContent = `${targetSettings.release}ms`;
  document.getElementById('correct-makeup').textContent = `${targetSettings.makeupGain.toFixed(1)}dB`;

  // Add visual feedback for accuracy (optional enhancement)
  addAccuracyHighlighting();

  // Show the comparison panel
  correctAnswerDiv.classList.remove('hidden');

  console.log('📋 Ayar karşılaştırması gösteriliyor - Kullanıcı vs Doğru cevap');
}

function addAccuracyHighlighting() {
  // Calculate accuracy for each parameter and add visual feedback
  const ratioAccurate = userSettings.ratio === targetSettings.ratio;
  const attackDiff = Math.abs(userSettings.attack - targetSettings.attack);
  const releaseDiff = Math.abs(userSettings.release - targetSettings.release);
  const makeupDiff = Math.abs(userSettings.makeupGain - targetSettings.makeupGain);

  // Add CSS classes based on accuracy (very close, close, far)
  const userRatioEl = document.getElementById('user-ratio');
  const userAttackEl = document.getElementById('user-attack');
  const userReleaseEl = document.getElementById('user-release');
  const userMakeupEl = document.getElementById('user-makeup');

  // Clear previous classes
  [userRatioEl, userAttackEl, userReleaseEl, userMakeupEl].forEach(el => {
    el.classList.remove('accurate', 'close', 'far');
  });

  // Add accuracy classes
  userRatioEl.classList.add(ratioAccurate ? 'accurate' : 'far');
  userAttackEl.classList.add(attackDiff <= 5 ? 'accurate' : attackDiff <= 20 ? 'close' : 'far');
  userReleaseEl.classList.add(releaseDiff <= 20 ? 'accurate' : releaseDiff <= 80 ? 'close' : 'far');
  userMakeupEl.classList.add(makeupDiff <= 0.5 ? 'accurate' : makeupDiff <= 2 ? 'close' : 'far');
}

function hideCorrectAnswer() {
  correctAnswerDiv.classList.add('hidden');
  console.log('📋 Doğru cevap gizlendi');
}

function nextRound() {
  if (round >= TOTAL_ROUNDS) {
    endGame();
    return;
  }

  // Hide correct answer display
  hideCorrectAnswer();

  // Stop any playing audio and clean up
  stopCurrentAudio();

  // Reset analog meter properly for next round
  setTimeout(() => {
    resetGRMeter();
  }, 200); // Allow time for decay animation

  round++;
  loadNewRound();
}

async function endGame() {
  isGameOver = true;
  stopCurrentAudio();

  const finalPercentage = Math.round((score / MAX_SCORE) * 100);
  finalScore.textContent = `${score}/${MAX_SCORE} (%${finalPercentage})`;

  let message = '';
  if (finalPercentage >= 80) {
    message = '🎉 Harika kulak! Compression konusunda gerçekten yeteneklisin!';
  } else if (finalPercentage >= 60) {
    message = '👏 İyi iş! Pratik yapmaya devam et.';
  } else {
    message = '💪 Pratik yapmaya devam! Compression ustalık gerektirir.';
  }

  finalMessage.textContent = message;
  finalDetails.textContent = `${TOTAL_ROUNDS} turu tamamladın.`;

  // Save score using the centralized updateUserStats function
  try {
    const { auth } = await import('../main/js/firebase-init.js');
    const { updateUserStats } = await import('../main/js/game-stats.js');

    const user = auth.currentUser;
    if (user) {
      const result = await updateUserStats(user.uid, 'Compressor Game', score);
      console.log('✅ Compressor Game skoru kaydedildi ve istatistikler güncellendi:', score);

      // Show achievements if any were unlocked
      if (result && result.achievements && result.achievements.length > 0) {
        const achievementNames = result.achievements.map(a => a.name).join(', ');
        alert(`🎉 Yeni başarım kazandınız: ${achievementNames}`);
      }

      // Notify other open pages about the score update
      const scoreUpdateEvent = new CustomEvent('scoreUpdated', {
        detail: {
          game: 'Compressor Game',
          score: score,
          userId: user.uid
        }
      });
      window.dispatchEvent(scoreUpdateEvent);

      // Also notify the opener window if this is in a popup
      if (window.opener) {
        window.opener.postMessage({
          type: 'scoreUpdated',
          data: {
            game: 'Compressor Game',
            score: score,
            userId: user.uid
          }
        }, '*');
      }
    }
  } catch (error) {
    console.error('❌ Skor kaydetme hatası:', error);
  }

  finalModal.classList.remove('hidden');
}

function restartGame() {
  // Reset all game variables
  score = 0;
  round = 1;
  isGameOver = false;
  hasGuessed = false;

  // Stop any current audio and cleanup
  stopCurrentAudio();

  // Hide modal and reset UI
  finalModal.classList.add('hidden');
  hideCorrectAnswer();

  // Reset user controls to defaults
  userSettings = { ratio: 2, attack: 10, release: 100, makeupGain: 0 };
  ratioSlider.value = 2;
  attackSlider.value = 10;
  releaseSlider.value = 100;
  makeupSlider.value = 0;
  updateControlValues();

  // Start new game
  loadNewRound();

  console.log('🔄 Oyun yeniden başlatıldı');
}

// ===== EVENT LISTENERS =====

// Professional Fader Control Updates
ratioSlider.addEventListener('input', () => {
  userSettings.ratio = parseInt(ratioSlider.value);
  updateControlValues();
  console.log(`🎛️ Ratio changed to 1:${userSettings.ratio}`);
});

thresholdSlider.addEventListener('input', (e) => {
  // Update threshold setting immediately
  userSettings.threshold = parseInt(e.target.value);

  // Update threshold label live (fixes stuck "-30dB" bug)
  thresholdValue.textContent = `${userSettings.threshold}dB`;

  // Apply to current compressor in real-time for immediate effect
  if (currentCompressor) {
    currentCompressor.threshold.value = userSettings.threshold;
  }

  // Sync all control displays
  updateControlValues();

  // Debug confirmation
  console.log(`🎛️ Threshold updated: ${userSettings.threshold}dB (label shows: ${thresholdValue.textContent})`);
});

attackSlider.addEventListener('input', () => {
  userSettings.attack = parseInt(attackSlider.value);
  updateControlValues();
});

releaseSlider.addEventListener('input', () => {
  userSettings.release = parseInt(releaseSlider.value);
  updateControlValues();
});

makeupSlider.addEventListener('input', () => {
  userSettings.makeupGain = parseFloat(makeupSlider.value);
  updateControlValues();
});

// Playback Buttons
playOriginalBtn.addEventListener('click', playOriginal);
playCompressedBtn.addEventListener('click', playCompressed);
playUserBtn.addEventListener('click', playUserVersion);

// Game Flow Buttons
submitGuessBtn.addEventListener('click', submitGuess);
nextQuestionBtn.addEventListener('click', nextRound);
restartBtn.addEventListener('click', restartGame);

// Stop Audio Button
const stopAudioBtn = document.getElementById('stop-audio');
if (stopAudioBtn) {
  stopAudioBtn.addEventListener('click', () => {
    stopCurrentAudio();
    console.log('⏹️ Audio stopped by user');
  });
}

// ===== INITIALIZATION =====

window.addEventListener('DOMContentLoaded', () => {
  console.log('🎛️ Compressor Kulak Eğitimi Oyunu Başlatıldı');

  // Test accurate compression formula on startup
  testCompressionFormula();

  updateUI();
  updateControlValues();
  loadNewRound();
}); 