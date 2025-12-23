// Firestore Database işlemleri
import { db } from './firebase-init.js';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit,
  where,
  updateDoc,
  increment,
  arrayUnion,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Kullanıcı profili oluştur
export async function createUserProfile(uid, email, additionalData = {}) {
  try {
    const profileData = {
      email: email,
      totalScore: 0,
      achievements: {}, // Object formatına çevirdik
      gamesHistory: [],
      lastPlayed: null,
      gamesPlayed: 0,
      gameScores: {
        'Frequency Game': 0,
        'Compressor Game': 0,
        'Balance Game': 0,
        'Stereo Game': 0
      },
      frequencyScore: 0,
      compressorScore: 0,
      balanceScore: 0,
      stereoScore: 0,
      createdAt: serverTimestamp(),
      // Google kullanıcısı için ek veriler
      ...additionalData
    };
    
    await setDoc(doc(db, 'users', uid), profileData);
    console.log('✅ Kullanıcı profili oluşturuldu');
  } catch (error) {
    console.error('❌ Profil oluşturma hatası:', error);
  }
}

// Kullanıcı profilini getir
export async function getUserProfile(uid) {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      console.log('Kullanıcı profili bulunamadı');
      return null;
    }
  } catch (error) {
    console.error('❌ Profil getirme hatası:', error);
    return null;
  }
}

// Oyun skoru kaydet
export async function saveGameScore(uid, gameName, score) {
  try {
    // Kullanıcının mevcut profilini al
    const userProfile = await getUserProfile(uid);
    
    // Games koleksiyonuna yeni skor ekle
    await addDoc(collection(db, 'games'), {
      uid: uid,
      game: gameName,
      score: score,
      date: serverTimestamp()
    });

    // Individual skor alanları için değişken isimlerini belirle
    const gameScoreFields = {
      'Frequency Game': 'frequencyScore',
      'Compressor Game': 'compressorScore',
      'Balance Game': 'balanceScore',
      'Stereo Game': 'stereoScore'
    };

    const scoreField = gameScoreFields[gameName];
    const currentBestScore = userProfile?.[scoreField] || 0;
    const newBestScore = Math.max(currentBestScore, score);
    
    // Score improvement calculation
    const scoreImprovement = newBestScore - currentBestScore;
    const isNewRecord = scoreImprovement > 0;
    
    // Calculate total score as sum of best individual scores
    const currentScores = {
      frequencyScore: userProfile?.frequencyScore || 0,
      compressorScore: userProfile?.compressorScore || 0,
      balanceScore: userProfile?.balanceScore || 0,
      stereoScore: userProfile?.stereoScore || 0
    };
    
    // Update the current game's best score
    currentScores[scoreField] = newBestScore;
    
    // Calculate new total score
    const previousTotalScore = userProfile?.totalScore || 0;
    const newTotalScore = Object.values(currentScores).reduce((sum, score) => sum + score, 0);
    const totalScoreIncrease = newTotalScore - previousTotalScore;

    // Prepare game history entry
    const gameHistoryEntry = {
      game: gameName,
      score: score,
      date: new Date(),
      isNewRecord: isNewRecord
    };

    // Get current games history and add new entry
    const currentGamesHistory = userProfile?.gamesHistory || [];
    const updatedGamesHistory = [...currentGamesHistory, gameHistoryEntry];

    // Kullanıcının skorunu güncelle
    const userRef = doc(db, 'users', uid);
    const updateData = {
      totalScore: newTotalScore,
      lastPlayed: gameName,
      gamesPlayed: increment(1),
      [`gameScores.${gameName}`]: newBestScore,
      [scoreField]: newBestScore,
      gamesHistory: updatedGamesHistory
    };

    await updateDoc(userRef, updateData);

    // Başarımları kontrol et
    const newAchievements = await checkAchievements(uid);

    // Enhanced logging with user feedback
    console.log('✅ Skor kaydedildi:', {
      game: gameName, 
      score: score, 
      bestScore: newBestScore, 
      totalScore: newTotalScore,
      improvement: scoreImprovement,
      isNewRecord: isNewRecord,
      newAchievements: newAchievements?.length || 0,
      gamesHistoryLength: updatedGamesHistory.length
    });

    // Return comprehensive feedback for UI updates
    return {
      success: true,
      currentScore: score,
      newBest: newBestScore,
      totalScore: newTotalScore,
      improvement: scoreImprovement,
      totalScoreIncrease: totalScoreIncrease,
      isNewRecord: isNewRecord,
      newAchievements: newAchievements || [],
      gamesHistory: updatedGamesHistory,
      message: generateScoreFeedback(score, newBestScore, isNewRecord, scoreImprovement)
    };
  } catch (error) {
    console.error('❌ Skor kaydetme hatası:', error);
    throw error;
  }
}

// Generate user-friendly score feedback
function generateScoreFeedback(currentScore, bestScore, isNewRecord, improvement) {
  if (isNewRecord && improvement > 0) {
    if (improvement >= 100) {
      return `🎉 Harika gelişme! +${improvement} XP yeni rekor! Toplam: ${bestScore} XP`;
    } else if (improvement >= 50) {
      return `🔥 Güzel ilerleme! +${improvement} XP kazandın! Toplam: ${bestScore} XP`;
    } else {
      return `📈 İlerliyorsun! +${improvement} XP! En iyi: ${bestScore} XP`;
    }
  } else if (currentScore === bestScore && bestScore > 0) {
    return `💯 Mükemmel! En iyi skorunu tekrarladın: ${bestScore} XP`;
  } else {
    return `🎯 ${currentScore} XP kazandın! En iyi: ${bestScore} XP`;
  }
}

// Liderlik tablosunu getir
export async function getLeaderboard(gameName = null, limitCount = 10) {
  try {
    let q;
    if (gameName) {
      // Belirli bir oyun için individual skorlar
      const gameScoreFields = {
        'Frequency Game': 'frequencyScore',
        'Compressor Game': 'compressorScore',
        'Balance Game': 'balanceScore',
        'Stereo Game': 'stereoScore'
      };
      
      const scoreField = gameScoreFields[gameName];
      if (scoreField) {
        q = query(
          collection(db, 'users'),
          orderBy(scoreField, 'desc'),
          limit(limitCount)
        );
      } else {
        // Fallback: Games koleksiyonundan
        q = query(
          collection(db, 'games'),
          where('game', '==', gameName),
          orderBy('score', 'desc'),
          limit(limitCount)
        );
      }
    } else {
      // Toplam skora göre genel liderlik
      q = query(
        collection(db, 'users'),
        orderBy('totalScore', 'desc'),
        limit(limitCount)
      );
    }

    const querySnapshot = await getDocs(q);
    const results = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Calculate proper total score if needed
      let totalScore = data.totalScore || 0;
      if (!gameName) {
        // For overall leaderboard, ensure total is sum of individual best scores
        const calculatedTotal = (data.frequencyScore || 0) + 
                              (data.compressorScore || 0) + 
                              (data.balanceScore || 0) + 
                              (data.stereoScore || 0);
        totalScore = Math.max(totalScore, calculatedTotal);
      }
      
      // Determine display score based on context
      let displayScore = totalScore;
      if (gameName) {
        const gameScoreFields = {
          'Frequency Game': 'frequencyScore',
          'Compressor Game': 'compressorScore',
          'Balance Game': 'balanceScore',
          'Stereo Game': 'stereoScore'
        };
        displayScore = data[gameScoreFields[gameName]] || 0;
      }
      
      results.push({
        id: doc.id,
        ...data,
        displayScore: displayScore,
        totalScore: totalScore
      });
    });

    // Sort by totalScore in descending order for overall leaderboard
    if (!gameName) {
      results.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    } else {
      // Sort by display score for game-specific leaderboards
      results.sort((a, b) => (b.displayScore || 0) - (a.displayScore || 0));
    }

    return results;
  } catch (error) {
    console.error('❌ Liderlik tablosu hatası:', error);
    return [];
  }
}

// Kullanıcının skorlarını getir
export async function getUserScores(uid, gameName = null) {
  try {
    let q = query(
      collection(db, 'games'),
      where('uid', '==', uid),
      orderBy('date', 'desc')
    );

    if (gameName) {
      q = query(
        collection(db, 'games'),
        where('uid', '==', uid),
        where('game', '==', gameName),
        orderBy('date', 'desc')
      );
    }

    const querySnapshot = await getDocs(q);
    const scores = [];
    
    querySnapshot.forEach((doc) => {
      scores.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return scores;
  } catch (error) {
    console.error('❌ Skor getirme hatası:', error);
    return [];
  }
}

// Başarımları kontrol et ve güncelle
export async function checkAchievements(uid) {
  try {
    const userProfile = await getUserProfile(uid);
    const userScores = await getUserScores(uid);
    
    if (!userProfile || !userScores) return [];

    const newAchievements = [];
    const currentAchievements = userProfile.achievements || {};
    const totalScore = userProfile.totalScore || 0;

    // Başarım tanımları - ID'leri tutarlı hale getirdik
    const achievements = [
      // Genel Başarımlar
      { 
        id: 'first-game', 
        name: '🎮 İlk Oyun', 
        description: 'İlk oyununu tamamladın!', 
        game: 'Genel',
        condition: () => userScores.length >= 1 
      },
      { 
        id: 'score-100', 
        name: '⭐ 100 XP', 
        description: '100 toplam XP kazandın!', 
        game: 'Genel',
        condition: () => totalScore >= 100 
      },
      { 
        id: 'score-500', 
        name: '🌟 500 XP', 
        description: '500 toplam XP kazandın!', 
        game: 'Genel',
        condition: () => totalScore >= 500 
      },
      { 
        id: 'score-1000', 
        name: '💫 1000 XP', 
        description: '1000 toplam XP kazandın!', 
        game: 'Genel',
        condition: () => totalScore >= 1000 
      },
      { 
        id: 'score-2500', 
        name: '✨ 2500 XP', 
        description: '2500 toplam XP kazandın!', 
        game: 'Genel',
        condition: () => totalScore >= 2500 
      },
      { 
        id: 'score-5000', 
        name: '🚀 5000 XP', 
        description: '5000 toplam XP - Müzik uzmanı!', 
        game: 'Genel',
        condition: () => totalScore >= 5000 
      },
      { 
        id: 'games-10', 
        name: '🔥 10 Oyun', 
        description: '10 oyun bitirdin!', 
        game: 'Genel', 
        condition: () => userScores.length >= 10 
      },
      { 
        id: 'games-25', 
        name: '💪 25 Oyun', 
        description: '25 oyun bitirdin!', 
        game: 'Genel', 
        condition: () => userScores.length >= 25 
      },
      { 
        id: 'all-games', 
        name: '🎯 Tüm Oyunlar', 
        description: 'Dört farklı oyun türünün hepsini oynadın!', 
        game: 'Genel', 
        condition: () => {
          const games = [...new Set(userScores.map(s => s.game))];
          return games.length >= 4;
        }
      },
      
      // Frequency Game Başarımları
      { 
        id: 'frequency-played', 
        name: '🎵 EQ Başlangıcı', 
        description: 'İlk Frequency oyununu tamamladın!', 
        game: 'Frequency Game', 
        condition: () => userScores.filter(s => s.game === 'Frequency Game').length >= 1 
      },
      { 
        id: 'frequency-expert', 
        name: '🎛️ EQ Uzmanı', 
        description: '5 Frequency oyunu tamamladın!', 
        game: 'Frequency Game', 
        condition: () => userScores.filter(s => s.game === 'Frequency Game').length >= 5 
      },
      { 
        id: 'frequency-bronze', 
        name: '🥉 Frekans Bronz', 
        description: 'Frequency oyununda 200+ skor yaptın!', 
        game: 'Frequency Game', 
        condition: () => (userProfile.frequencyScore || 0) >= 200 
      },
      { 
        id: 'frequency-silver', 
        name: '🥈 Frekans Gümüş', 
        description: 'Frequency oyununda 400+ skor yaptın!', 
        game: 'Frequency Game', 
        condition: () => (userProfile.frequencyScore || 0) >= 400 
      },
      { 
        id: 'frequency-gold', 
        name: '🥇 Frekans Altın', 
        description: 'Frequency oyununda 600+ skor yaptın!', 
        game: 'Frequency Game', 
        condition: () => (userProfile.frequencyScore || 0) >= 600 
      },
      
      // Compressor Game Başarımları
      { 
        id: 'compressor-played', 
        name: '🗜️ Kompresör Başlangıcı', 
        description: 'İlk Compressor oyununu tamamladın!', 
        game: 'Compressor Game', 
        condition: () => userScores.filter(s => s.game === 'Compressor Game').length >= 1 
      },
      { 
        id: 'compressor-expert', 
        name: '⚡ Dinamik Kontrol', 
        description: '5 Compressor oyunu tamamladın!', 
        game: 'Compressor Game', 
        condition: () => userScores.filter(s => s.game === 'Compressor Game').length >= 5 
      },
      { 
        id: 'compressor-bronze', 
        name: '🥉 Kompresör Bronz', 
        description: 'Compressor oyununda 200+ skor yaptın!', 
        game: 'Compressor Game', 
        condition: () => (userProfile.compressorScore || 0) >= 200 
      },
      { 
        id: 'compressor-silver', 
        name: '🥈 Kompresör Gümüş', 
        description: 'Compressor oyununda 400+ skor yaptın!', 
        game: 'Compressor Game', 
        condition: () => (userProfile.compressorScore || 0) >= 400 
      },
      
      // Balance Game Başarımları
      { 
        id: 'balance-played', 
        name: '⚖️ Denge Başlangıcı', 
        description: 'İlk Balance oyununu tamamladın!', 
        game: 'Balance Game', 
        condition: () => userScores.filter(s => s.game === 'Balance Game').length >= 1 
      },
      { 
        id: 'balance-expert', 
        name: '🎚️ Mikser Uzmanı', 
        description: '5 Balance oyunu tamamladın!', 
        game: 'Balance Game', 
        condition: () => userScores.filter(s => s.game === 'Balance Game').length >= 5 
      },
      { 
        id: 'balance-bronze', 
        name: '🥉 Denge Bronz', 
        description: 'Balance oyununda 200+ skor yaptın!', 
        game: 'Balance Game', 
        condition: () => (userProfile.balanceScore || 0) >= 200 
      },
      { 
        id: 'balance-silver', 
        name: '🥈 Denge Gümüş', 
        description: 'Balance oyununda 400+ skor yaptın!', 
        game: 'Balance Game', 
        condition: () => (userProfile.balanceScore || 0) >= 400 
      },
      
      // Stereo Game Başarımları
      { 
        id: 'stereo-played', 
        name: '🎧 Stereo Başlangıcı', 
        description: 'İlk Stereo oyununu tamamladın!', 
        game: 'Stereo Game', 
        condition: () => userScores.filter(s => s.game === 'Stereo Game').length >= 1 
      },
      { 
        id: 'stereo-expert', 
        name: '🔊 Stereo Uzmanı', 
        description: '5 Stereo oyunu tamamladın!', 
        game: 'Stereo Game', 
        condition: () => userScores.filter(s => s.game === 'Stereo Game').length >= 5 
      },
      { 
        id: 'stereo-bronze', 
        name: '🥉 Stereo Bronz', 
        description: 'Stereo oyununda 200+ skor yaptın!', 
        game: 'Stereo Game', 
        condition: () => (userProfile.stereoScore || 0) >= 200 
      },
      { 
        id: 'stereo-silver', 
        name: '🥈 Stereo Gümüş', 
        description: 'Stereo oyununda 400+ skor yaptın!', 
        game: 'Stereo Game', 
        condition: () => (userProfile.stereoScore || 0) >= 400 
      },
      
      // Özel Başarımlar
      { 
        id: 'high-average', 
        name: '📊 Yüksek Ortalama', 
        description: 'Oyun başına ortalama 300+ skor!', 
        game: 'Genel', 
        condition: () => {
          const totalGames = userScores.length;
          return totalGames > 0 && (userProfile.totalScore / totalGames) >= 300;
        }
      }
    ];

    // Her başarım için kontrol yap
    for (const achievement of achievements) {
      // Eğer başarım henüz kazanılmamışsa ve koşulu sağlanıyorsa
      if (!currentAchievements[achievement.id] && achievement.condition()) {
        newAchievements.push({
          ...achievement,
          unlockedAt: new Date().toISOString()
        });
      }
    }

    // Yeni başarımları kaydet
    if (newAchievements.length > 0) {
      try {
        const userRef = doc(db, 'users', uid);
        const achievementUpdates = {};
        
        // Her yeni başarım için object'e entry ekle
        newAchievements.forEach(achievement => {
          achievementUpdates[`achievements.${achievement.id}`] = {
            unlocked: true,
            unlockedAt: achievement.unlockedAt,
            name: achievement.name,
            description: achievement.description
          };
        });

        await updateDoc(userRef, {
          ...achievementUpdates,
          lastAchievement: serverTimestamp()
        });
        
        console.log('🏆 Yeni başarımlar kazanıldı:', newAchievements.map(a => a.name).join(', '));
        
        // Başarımları döndür (bildirim için)
        return newAchievements.map(achievement => ({
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          game: achievement.game,
          unlockedAt: achievement.unlockedAt
        }));
      } catch (error) {
        console.error('❌ Başarım kaydetme hatası:', error);
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error('❌ Başarım kontrolü hatası:', error);
    return [];
  }
}

// Tüm başarımları getir
export function getAllAchievements() {
  return [
    // Genel Başarımlar
    { id: 'first-game', name: '🎮 İlk Oyun', description: 'İlk oyununu tamamladın!', game: 'Genel' },
    { id: 'score-100', name: '⭐ 100 XP', description: '100 toplam XP kazandın!', game: 'Genel' },
    { id: 'score-500', name: '🌟 500 XP', description: '500 toplam XP kazandın!', game: 'Genel' },
    { id: 'score-1000', name: '💫 1000 XP', description: '1000 toplam XP kazandın!', game: 'Genel' },
    { id: 'score-2500', name: '✨ 2500 XP', description: '2500 toplam XP kazandın!', game: 'Genel' },
    { id: 'score-5000', name: '🚀 5000 XP', description: '5000 toplam XP - Müzik uzmanı!', game: 'Genel' },
    { id: 'games-10', name: '🔥 10 Oyun', description: '10 oyun bitirdin!', game: 'Genel' },
    { id: 'games-25', name: '💪 25 Oyun', description: '25 oyun bitirdin!', game: 'Genel' },
    { id: 'all-games', name: '🎯 Tüm Oyunlar', description: 'Dört farklı oyun türünün hepsini oynadın!', game: 'Genel' },
    
    // Frequency Game Başarımları
    { id: 'frequency-played', name: '🎵 EQ Başlangıcı', description: 'İlk Frequency oyununu tamamladın!', game: 'Frequency Game' },
    { id: 'frequency-expert', name: '🎛️ EQ Uzmanı', description: '5 Frequency oyunu tamamladın!', game: 'Frequency Game' },
    { id: 'frequency-bronze', name: '🥉 Frekans Bronz', description: 'Frequency oyununda 200+ skor yaptın!', game: 'Frequency Game' },
    { id: 'frequency-silver', name: '🥈 Frekans Gümüş', description: 'Frequency oyununda 400+ skor yaptın!', game: 'Frequency Game' },
    { id: 'frequency-gold', name: '🥇 Frekans Altın', description: 'Frequency oyununda 600+ skor yaptın!', game: 'Frequency Game' },
    
    // Compressor Game Başarımları
    { id: 'compressor-played', name: '🗜️ Kompresör Başlangıcı', description: 'İlk Compressor oyununu tamamladın!', game: 'Compressor Game' },
    { id: 'compressor-expert', name: '⚡ Dinamik Kontrol', description: '5 Compressor oyunu tamamladın!', game: 'Compressor Game' },
    { id: 'compressor-bronze', name: '🥉 Kompresör Bronz', description: 'Compressor oyununda 200+ skor yaptın!', game: 'Compressor Game' },
    { id: 'compressor-silver', name: '🥈 Kompresör Gümüş', description: 'Compressor oyununda 400+ skor yaptın!', game: 'Compressor Game' },
    
    // Balance Game Başarımları
    { id: 'balance-played', name: '⚖️ Denge Başlangıcı', description: 'İlk Balance oyununu tamamladın!', game: 'Balance Game' },
    { id: 'balance-expert', name: '🎚️ Mikser Uzmanı', description: '5 Balance oyunu tamamladın!', game: 'Balance Game' },
    { id: 'balance-bronze', name: '🥉 Denge Bronz', description: 'Balance oyununda 200+ skor yaptın!', game: 'Balance Game' },
    { id: 'balance-silver', name: '🥈 Denge Gümüş', description: 'Balance oyununda 400+ skor yaptın!', game: 'Balance Game' },
    
    // Stereo Game Başarımları
    { id: 'stereo-played', name: '🎧 Stereo Başlangıcı', description: 'İlk Stereo oyununu tamamladın!', game: 'Stereo Game' },
    { id: 'stereo-expert', name: '🔊 Stereo Uzmanı', description: '5 Stereo oyunu tamamladın!', game: 'Stereo Game' },
    { id: 'stereo-bronze', name: '🥉 Stereo Bronz', description: 'Stereo oyununda 200+ skor yaptın!', game: 'Stereo Game' },
    { id: 'stereo-silver', name: '🥈 Stereo Gümüş', description: 'Stereo oyununda 400+ skor yaptın!', game: 'Stereo Game' },
    
    // Özel Başarımlar
    { id: 'high-average', name: '📊 Yüksek Ortalama', description: 'Oyun başına ortalama 300+ skor!', game: 'Genel' }
  ];
}

// Kullanıcının oyun başına skorlarını getir
export async function getUserGameScores(uid) {
  try {
    const userProfile = await getUserProfile(uid);
    return userProfile?.gameScores || {
      'Frequency Game': 0,
      'Compressor Game': 0,
      'Balance Game': 0,
      'Stereo Game': 0
    };
  } catch (error) {
    console.error('❌ Oyun skorları getirme hatası:', error);
    return {
      'Frequency Game': 0,
      'Compressor Game': 0,
      'Balance Game': 0,
      'Stereo Game': 0
    };
  }
}

// Kullanıcının son oyunlarını getir
export async function getRecentGames(uid, limitCount = 5) {
  try {
    const q = query(
      collection(db, 'games'),
      where('uid', '==', uid),
      orderBy('date', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const games = [];
    
    querySnapshot.forEach((doc) => {
      games.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return games;
  } catch (error) {
    console.error('❌ Son oyunları getirme hatası:', error);
    return [];
  }
}