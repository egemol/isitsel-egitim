// Leaderboard helper functions
import { getLeaderboard, getUserProfile } from './db.js';

// Cache for user profiles to avoid repeated requests
const userProfileCache = new Map();

// Get user profile with caching
export async function getCachedUserProfile(uid) {
  if (userProfileCache.has(uid)) {
    return userProfileCache.get(uid);
  }
  
  try {
    const profile = await getUserProfile(uid);
    userProfileCache.set(uid, profile);
    return profile;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

// Clear the profile cache
export function clearProfileCache() {
  userProfileCache.clear();
}

// Get username from email
export function getUsernameFromEmail(email) {
  if (!email) return 'Anonim Kullanıcı';
  return email.split('@')[0];
}

// Get rank styling class
export function getRankClass(rank) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return '';
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

// Format leaderboard data for display
export async function formatLeaderboardData(data, isGameSpecific = false) {
  const formattedData = [];
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const rank = i + 1;
    
    let username = 'Anonim Kullanıcı';
    let userEmail = '';
    
    if (isGameSpecific) {
      // For game-specific leaderboards, get user email from profile
      if (item.uid) {
        const userProfile = await getCachedUserProfile(item.uid);
        if (userProfile && userProfile.email) {
          userEmail = userProfile.email;
          username = getUsernameFromEmail(userEmail);
        }
      }
    } else {
      // For general leaderboard, use email from user document
      if (item.email) {
        userEmail = item.email;
        username = getUsernameFromEmail(userEmail);
      }
    }
    
    const score = isGameSpecific ? item.score : (item.totalScore || 0);
    
    formattedData.push({
      rank,
      uid: item.uid || item.id,
      username,
      email: userEmail,
      score,
      rankClass: getRankClass(rank),
      original: item
    });
  }
  
  return formattedData;
}

// Get leaderboard statistics
export function getLeaderboardStats(data) {
  if (!data || data.length === 0) {
    return {
      totalPlayers: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0
    };
  }
  
  const scores = data.map(item => item.score);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  
  return {
    totalPlayers: data.length,
    averageScore: Math.round(totalScore / data.length),
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores)
  };
}

// Find user position in leaderboard
export function findUserPosition(leaderboardData, currentUserId) {
  if (!currentUserId || !leaderboardData) return null;
  
  const userIndex = leaderboardData.findIndex(item => 
    item.uid === currentUserId
  );
  
  if (userIndex === -1) return null;
  
  return {
    rank: userIndex + 1,
    score: leaderboardData[userIndex].score,
    percentile: Math.round(((leaderboardData.length - userIndex) / leaderboardData.length) * 100)
  };
}

// Generate leaderboard insights
export function generateLeaderboardInsights(data, userPosition, gameFilter) {
  const insights = [];
  const stats = getLeaderboardStats(data);
  
  if (stats.totalPlayers === 0) {
    insights.push({
      type: 'info',
      icon: '📊',
      title: 'İlk Olun!',
      message: 'Bu kategoride henüz kimse skor yapmamış. İlk siz olun!'
    });
    return insights;
  }
  
  // General stats insight
  insights.push({
    type: 'info',
    icon: '👥',
    title: 'Topluluk İstatistikleri',
    message: `${stats.totalPlayers} oyuncu, ortalama ${stats.averageScore} skor`
  });
  
  // User position insight
  if (userPosition) {
    const { rank, percentile } = userPosition;
    
    if (rank <= 3) {
      insights.push({
        type: 'success',
        icon: '🏆',
        title: 'Üst Sıralarda!',
        message: `${rank}. sıradasınız! Harika performans!`
      });
    } else if (percentile >= 50) {
      insights.push({
        type: 'success',
        icon: '⭐',
        title: 'İyi Durumdaysınız',
        message: `Üst %${percentile} içindesiniz!`
      });
    } else {
      insights.push({
        type: 'challenge',
        icon: '💪',
        title: 'Gelişim Fırsatı',
        message: 'Daha fazla pratik yaparak sıralamanızı yükseltebilirsiniz!'
      });
    }
  }
  
  // Game-specific insights
  if (gameFilter) {
    insights.push({
      type: 'tip',
      icon: getGameIcon(gameFilter),
      title: `${gameFilter} Sıralaması`,
      message: `En yüksek skor: ${stats.highestScore}`
    });
  } else {
    insights.push({
      type: 'tip',
      icon: '🎮',
      title: 'Genel Sıralama',
      message: 'Tüm oyunlardan toplam skorunuz gösteriliyor'
    });
  }
  
  return insights;
}

// Validate leaderboard data
export function validateLeaderboardData(data) {
  if (!Array.isArray(data)) {
    console.warn('Leaderboard data is not an array');
    return [];
  }
  
  return data.filter(item => {
    if (!item) return false;
    
    // Check for required fields based on data type
    if (item.uid && typeof item.score === 'number') {
      return true; // Game-specific data
    }
    
    if (item.email && typeof item.totalScore === 'number') {
      return true; // General leaderboard data
    }
    
    console.warn('Invalid leaderboard item:', item);
    return false;
  });
}

// Export loading states
export const LoadingStates = {
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  EMPTY: 'empty'
}; 