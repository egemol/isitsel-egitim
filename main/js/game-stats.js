import { saveGameScore } from './db.js';

/**
 * Updates user statistics after completing a game
 * @param {string} userId - The ID of the user
 * @param {string} gameName - Name of the game (e.g., 'Frequency Game')
 * @param {number} score - The score achieved in the game
 */
export async function updateUserStats(userId, gameName, score) {
    if (!userId || !gameName || typeof score !== 'number') {
        console.error('❌ Invalid parameters for updateUserStats:', { userId, gameName, score });
        return { success: false, error: 'Invalid parameters' };
    }

    try {
        // Use the centralized saveGameScore function for consistency
        const result = await saveGameScore(userId, gameName, score);
        
        // Notify all open pages about the score update
        const scoreUpdateEvent = new CustomEvent('scoreUpdated', {
            detail: { game: gameName, score, userId, result }
        });
        window.dispatchEvent(scoreUpdateEvent);

        // Notify parent window if this is in an iframe
        if (window.opener) {
            window.opener.postMessage({
                type: 'scoreUpdated',
                data: { game: gameName, score, userId, result }
            }, '*');
        }

        // Notify parent frame if this is in an iframe
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'scoreUpdated',
                data: { game: gameName, score, userId, result }
            }, '*');
        }

        console.log('✅ Kullanıcı istatistikleri güncellendi:', {
            userId,
            gameName,
            score,
            newBest: result.newBest,
            totalScore: result.totalScore,
            newAchievements: result.newAchievements?.length || 0
        });

        return result;
    } catch (error) {
        console.error('❌ Kullanıcı istatistiklerini güncelleme hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Gets user statistics
 * @param {string} userId - The ID of the user
 */
export async function getUserStats(userId) {
    try {
        const { getUserProfile } = await import('./db.js');
        const userProfile = await getUserProfile(userId);
        
        if (userProfile) {
            return userProfile;
        }
        return null;
    } catch (error) {
        console.error('❌ Kullanıcı istatistiklerini getirme hatası:', error);
        return null;
    }
}
