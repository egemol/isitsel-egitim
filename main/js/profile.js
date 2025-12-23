// Profile page helper functions
import { getUserProfile, getUserScores, getAllAchievements } from './db.js';

// Format date for display
export function formatDate(timestamp) {
  if (!timestamp) return 'Bilinmiyor';
  
  const date = timestamp.seconds 
    ? new Date(timestamp.seconds * 1000)
    : new Date(timestamp);
  
  return date.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Get game icon
export function getGameIcon(gameName) {
  const icons = {
    'Frequency Game': '🎚️',
    'Compressor Game': '🔊',
    'Balance Game': '⚖️',
    'Stereo Game': '🎧'
  };
  return icons[gameName] || '🎮';
}

// Calculate user statistics
export function calculateUserStats(profile, scores) {
  // Handle both array and object formats for achievements count
  let achievementsCount = 0;
  if (profile?.achievements) {
    if (Array.isArray(profile.achievements)) {
      achievementsCount = profile.achievements.length;
    } else if (typeof profile.achievements === 'object') {
      achievementsCount = Object.keys(profile.achievements).length;
    }
  }

  const stats = {
    totalScore: profile?.totalScore || 0,
    gamesPlayed: scores?.length || 0,
    achievementsCount: achievementsCount,
    lastPlayed: profile?.lastPlayed || '-',
    averageScore: 0,
    bestGame: null,
    gamesThisWeek: 0
  };

  if (scores && scores.length > 0) {
    // Calculate average score
    const totalGameScore = scores.reduce((sum, score) => sum + (score.score || 0), 0);
    stats.averageScore = Math.round(totalGameScore / scores.length);

    // Find best performing game
    const gameScores = {};
    scores.forEach(score => {
      const game = score.game;
      if (!gameScores[game]) {
        gameScores[game] = { total: 0, count: 0, best: 0 };
      }
      gameScores[game].total += score.score || 0;
      gameScores[game].count += 1;
      gameScores[game].best = Math.max(gameScores[game].best, score.score || 0);
    });

    let bestAverage = 0;
    let bestGameName = null;
    for (const [game, data] of Object.entries(gameScores)) {
      const average = data.total / data.count;
      if (average > bestAverage) {
        bestAverage = average;
        bestGameName = game;
      }
    }
    stats.bestGame = bestGameName;

    // Calculate games played this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    stats.gamesThisWeek = scores.filter(score => {
      if (!score.date) return false;
      const scoreDate = score.date.seconds 
        ? new Date(score.date.seconds * 1000)
        : new Date(score.date);
      return scoreDate >= oneWeekAgo;
    }).length;
  }

  return stats;
}

// Get achievement progress information
export function getAchievementProgress(achievement, profile, scores) {
  const totalScore = profile?.totalScore || 0;
  const gamesPlayed = scores?.length || 0;
  const uniqueGames = [...new Set(scores?.map(s => s.game) || [])].length;

  switch (achievement.id) {
    case 'first_game':
      return {
        current: gamesPlayed > 0 ? 1 : 0,
        target: 1,
        percentage: gamesPlayed > 0 ? 100 : 0,
        description: 'Bir oyun tamamlayın'
      };
    
    case 'score_100':
      return {
        current: Math.min(totalScore, 100),
        target: 100,
        percentage: Math.min((totalScore / 100) * 100, 100),
        description: '100 toplam skor hedefi'
      };
    
    case 'score_500':
      return {
        current: Math.min(totalScore, 500),
        target: 500,
        percentage: Math.min((totalScore / 500) * 100, 100),
        description: '500 toplam skor hedefi'
      };
    
    case 'score_1000':
      return {
        current: Math.min(totalScore, 1000),
        target: 1000,
        percentage: Math.min((totalScore / 1000) * 100, 100),
        description: '1000 toplam skor hedefi'
      };
    
    case 'games_10':
      return {
        current: Math.min(gamesPlayed, 10),
        target: 10,
        percentage: Math.min((gamesPlayed / 10) * 100, 100),
        description: '10 oyun tamamlama hedefi'
      };
    
    case 'games_50':
      return {
        current: Math.min(gamesPlayed, 50),
        target: 50,
        percentage: Math.min((gamesPlayed / 50) * 100, 100),
        description: '50 oyun tamamlama hedefi'
      };
    
    case 'all_games':
      return {
        current: uniqueGames,
        target: 4,
        percentage: Math.min((uniqueGames / 4) * 100, 100),
        description: 'Tüm oyun türlerini oynama hedefi'
      };
    
    default:
      return {
        current: 0,
        target: 1,
        percentage: 0,
        description: 'Bilinmeyen başarım'
      };
  }
}

// Generate performance insights
export function generateInsights(profile, scores) {
  const insights = [];
  
  if (!scores || scores.length === 0) {
    insights.push({
      type: 'welcome',
      icon: '🎮',
      title: 'Hoş Geldin!',
      message: 'İlk oyununuzu oynamaya hazır mısınız?'
    });
    return insights;
  }

  const stats = calculateUserStats(profile, scores);
  
  // Performance insights
  if (stats.averageScore > 50) {
    insights.push({
      type: 'success',
      icon: '⭐',
      title: 'Harika Performans!',
      message: `Ortalama skorunuz ${stats.averageScore}. Çok başarılısınız!`
    });
  }

  // Activity insights
  if (stats.gamesThisWeek >= 5) {
    insights.push({
      type: 'info',
      icon: '🔥',
      title: 'Aktif Oyuncu',
      message: `Bu hafta ${stats.gamesThisWeek} oyun oynadınız. Harika!`
    });
  }

  // Game recommendation
  if (stats.bestGame) {
    insights.push({
      type: 'tip',
      icon: '🎯',
      title: 'En İyi Oyununuz',
      message: `${stats.bestGame} oyununda en başarılısınız!`
    });
  }

  // Achievement motivation
  const totalAchievements = getAllAchievements().length;
  const unlockedAchievements = (profile?.achievements || []).length;
  if (unlockedAchievements < totalAchievements) {
    const remaining = totalAchievements - unlockedAchievements;
    insights.push({
      type: 'challenge',
      icon: '🏆',
      title: 'Başarım Hedefi',
      message: `${remaining} başarım daha kazanabilirsiniz!`
    });
  }

  return insights;
} 