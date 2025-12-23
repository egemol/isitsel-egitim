// Firebase Auth işlemleri
import { auth } from './firebase-init.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { createUserProfile, getUserProfile } from './db.js';

// Kullanıcı giriş durumunu izle
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// E-posta ile giriş
export async function loginWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Giriş başarılı:', userCredential.user.email);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('❌ Giriş hatası:', error.message);
    return { success: false, error: getErrorMessage(error.code) };
  }
}

// E-posta ile kayıt
export async function registerWithEmail(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('✅ Kayıt başarılı:', userCredential.user.email);
    
    // Firestore'da kullanıcı profili oluştur
    await createUserProfile(userCredential.user.uid, userCredential.user.email);
    
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('❌ Kayıt hatası:', error.message);
    return { success: false, error: getErrorMessage(error.code) };
  }
}

// Google ile giriş
export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    
    // Google hesap seçimi zorunlu kıl
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    console.log('🔗 Google Sign-In başlatılıyor...');
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    console.log('✅ Google ile giriş başarılı:', user.email);
    
    // Kullanıcı profilinin var olup olmadığını kontrol et
    const existingProfile = await getUserProfile(user.uid);
    
    if (!existingProfile) {
      // Yeni kullanıcıysa profil oluştur
      await createUserProfile(user.uid, user.email, {
        displayName: user.displayName,
        photoURL: user.photoURL
      });
      console.log('✅ Google kullanıcısı için profil oluşturuldu');
    }
    
    return { success: true, user: user };
  } catch (error) {
    console.error('❌ Google giriş hatası:', error.message, error.code);
    console.error('❌ Google giriş error stack:', error.stack);
    return { success: false, error: getGoogleErrorMessage(error.code) };
  }
}

// Çıkış yap
export async function logout() {
  try {
    await signOut(auth);
    console.log('✅ Çıkış yapıldı');
    return { success: true };
  } catch (error) {
    console.error('❌ Çıkış hatası:', error.message);
    return { success: false, error: error.message };
  }
}

// Hata mesajlarını Türkçe'ye çevir
function getErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'Kullanıcı bulunamadı.';
    case 'auth/wrong-password':
      return 'Hatalı şifre.';
    case 'auth/email-already-in-use':
      return 'Bu e-posta adresi zaten kullanımda.';
    case 'auth/weak-password':
      return 'Şifre çok zayıf. En az 6 karakter olmalı.';
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    case 'auth/network-request-failed':
      return 'Ağ bağlantısı hatası.';
    default:
      return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
}

// Google giriş hata mesajlarını Türkçe'ye çevir
function getGoogleErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/popup-closed-by-user':
      return 'Giriş penceresi kapatıldı.';
    case 'auth/popup-blocked':
      return 'Popup penceresi engellendi. Lütfen popup\'ları etkinleştirin.';
    case 'auth/cancelled-popup-request':
      return 'Giriş işlemi iptal edildi.';
    case 'auth/account-exists-with-different-credential':
      return 'Bu e-posta adresi farklı bir giriş yöntemiyle kayıtlı.';
    case 'auth/network-request-failed':
      return 'Ağ bağlantısı hatası.';
    default:
      return 'Google ile giriş yapılırken bir hata oluştu.';
  }
} 