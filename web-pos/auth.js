import { app, auth } from "./firebase-init.js";
import {
    GoogleAuthProvider,
    browserLocalPersistence,
    browserSessionPersistence,
    onAuthStateChanged,
    setPersistence,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);
const validRoles = new Set(['administrator', 'staff']);

window.webPosAuthState = {
    ready: false,
    user: null,
    role: null,
    isAdmin: false,
    isStaff: false
};

function getRememberMe() {
    const checkbox = document.getElementById('rememberMe');
    return Boolean(checkbox && checkbox.checked);
}

async function applyPersistence() {
    const rememberMe = getRememberMe();
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
}

async function signInWithGoogle() {
    await applyPersistence();
    return await signInWithPopup(auth, googleProvider);
}

function normalizeRole(role) {
    if (typeof role !== 'string') {
        return '';
    }

    return role.trim().toLowerCase();
}

function updateAuthState(state) {
    window.webPosAuthState = state;

    if (document.body) {
        document.body.dataset.role = state.role || '';
    }

    window.dispatchEvent(new CustomEvent('webpos-auth-state', { detail: state }));
}

async function logOut() {
    await signOut(auth);
    window.location.href = 'login.html';
}

function fillUserHeader(user, role) {
    const nameEl = document.getElementById('userName');
    const metaEl = document.getElementById('userMeta');

    if (nameEl) {
        nameEl.textContent = user.displayName || user.email || 'Signed in user';
    }

    if (metaEl) {
        const roleLabel = role ? ` • ${role}` : '';
        metaEl.textContent = `Signed in as: ${user.email || 'Unknown'}${roleLabel}${getRememberMe() ? ' (remembered)' : ''}`;
    }
}

async function loadUserRole(user) {
    const snap = await getDoc(doc(db, 'users', user.uid));

    if (!snap.exists()) {
        return null;
    }

    const role = normalizeRole(snap.data()?.role);
    return validRoles.has(role) ? role : null;
}

function getCurrentPage() {
    return document.body?.dataset?.page || '';
}

function denyAccessAndRedirect(messageKey = 'no-role') {
    const page = getCurrentPage();
    const loginStatus = document.getElementById('loginStatus');

    if (page === 'login' && loginStatus) {
        loginStatus.textContent = messageKey === 'no-role'
            ? 'Account exists but no role assigned. Contact administrator.'
            : 'You do not have permission to access this page.';
    }

    signOut(auth)
        .catch((error) => console.error('Sign out failed during access denial:', error))
        .finally(() => {
            if (page !== 'login') {
                window.location.replace(`login.html?reason=${encodeURIComponent(messageKey)}`);
            }
        });
}

async function enforceRoleAccess(user) {
    const page = getCurrentPage();
    const role = await loadUserRole(user);

    if (!role) {
        updateAuthState({
            ready: true,
            user: null,
            role: null,
            isAdmin: false,
            isStaff: false
        });
        denyAccessAndRedirect('no-role');
        return;
    }

    const state = {
        ready: true,
        user,
        role,
        isAdmin: role === 'administrator',
        isStaff: role === 'staff'
    };

    updateAuthState(state);
    fillUserHeader(user, role);

    if (page === 'login') {
        window.location.replace('index.html');
        return;
    }

    if ((page === 'stock' || page === 'receipt-editor') && !state.isAdmin) {
        window.location.replace('index.html?reason=permission');
    }
}

function requireAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            updateAuthState({
                ready: true,
                user: null,
                role: null,
                isAdmin: false,
                isStaff: false
            });

            if (getCurrentPage() !== 'login') {
                window.location.replace('login.html');
            }
            return;
        }

        enforceRoleAccess(user).catch((error) => {
            console.error('Role enforcement failed:', error);
            denyAccessAndRedirect('no-role');
        });
    });
}

function wireLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn') || document.querySelector('.logout-btn');
    if (!logoutBtn) {
        return;
    }

    logoutBtn.addEventListener('click', async () => {
        try {
            await logOut();
        } catch (error) {
            console.error('Logout failed:', error);
            window.location.href = 'login.html';
        }
    });
}

function initLoginPage() {
    const loginBtn = document.getElementById('googleLoginBtn');
    const statusEl = document.getElementById('loginStatus');
    const rememberMe = document.getElementById('rememberMe');

    if (!loginBtn) {
        return;
    }

    const syncButtonText = () => {
        if (rememberMe && rememberMe.checked) {
            loginBtn.textContent = 'Continue with Google';
        } else {
            loginBtn.textContent = 'Sign in with Google';
        }
    };

    rememberMe?.addEventListener('change', syncButtonText);
    syncButtonText();

    loginBtn.addEventListener('click', async () => {
        loginBtn.disabled = true;
        statusEl.textContent = 'Signing in...';

        try {
            await signInWithGoogle();
            statusEl.textContent = 'Signed in. Checking access...';
        } catch (error) {
            console.error('Google sign-in failed:', error);
            statusEl.textContent = 'Google sign-in failed. Please try again.';
        } finally {
            loginBtn.disabled = false;
        }
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            enforceRoleAccess(user).catch((error) => {
                console.error('Login access check failed:', error);
                statusEl.textContent = 'Could not verify your access.';
            });
        }
    });

    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason');

    if (reason === 'permission') {
        statusEl.textContent = 'You do not have permission to access that page.';
    } else if (reason === 'no-role') {
        statusEl.textContent = 'Account exists but no role assigned. Contact administrator.';
    }
}

const page = document.body?.dataset?.page;

if (page === 'login') {
    document.addEventListener('DOMContentLoaded', initLoginPage);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        requireAuth();
        wireLogoutButton();
    });
}

export { auth, signInWithGoogle, logOut, requireAuth };
