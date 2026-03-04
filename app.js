// === Debug helpers (temporary) ===
alert("app.js loaded");                    // shows that the file actually loaded
console.log("NEONWIN app.js loaded");      // for remote debugging
window.onerror = function(msg, src, line, col, err) {
  const text = "JS error: " + msg + " at line " + line + (err && err.stack ? ("\n"+err.stack) : "");
  try { alert(text); } catch(e) { console.log(text); }
  return false; // let the error also show in console
};
// === end debug helpers ===
/* app.js — NEONWIN (Firebase v8 compat)
   Full client logic: auth (Google + Phone + Email), profile, dashboard, play logic (1-in-10),
   deposits (demo), history, UI helpers, and defensive error handling.

   IMPORTANT:
   - This file uses the Firebase v8 compat global API (firebase.auth(), firebase.firestore()).
   - Make sure your HTML includes:
       <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
       <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-auth.js"></script>
       <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-firestore.js"></script>
   - Replace UI element ids in HTML if you changed them.
   - Host on HTTPS and add your hosted origin to Firebase Authorized Domains.
*/

/* -------------------- FIREBASE CONFIG (YOUR PROJECT) -------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCDCOZEeVLGiApRiJdhGOBNaAkZMaWfiPs",
  authDomain: "neonwin-a8b02.firebaseapp.com",
  projectId: "neonwin-a8b02",
  storageBucket: "neonwin-a8b02.firebasestorage.app",
  messagingSenderId: "1032353146602",
  appId: "1:1032353146602:web:18a0b748a3cd684d845993",
  measurementId: "G-750FY1T1VY"
};

// Initialize Firebase (v8 compat)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* -------------------- UI / MODAL HELPERS -------------------- */
function $(id) { return document.getElementById(id); }

// Modal popup: uses element with id="modal" and id="modalText" in your HTML.
// If you didn't include modal elements, it falls back to alert() politely.
function showModal(message, options = {}) {
  try {
    const m = $('modal');
    const t = $('modalText');
    if (!m || !t) {
      // fallback
      alert(message);
      return;
    }
    t.innerText = message;
    m.classList.remove('hidden');
    if (options.autoClose && typeof options.autoClose === 'number') {
      setTimeout(() => { m.classList.add('hidden'); }, options.autoClose);
    }
  } catch (e) {
    console.log("modal fallback:", e);
    alert(message);
  }
}
function hideModal() {
  const m = $('modal');
  if (m) m.classList.add('hidden');
}

/* quick console debug helper */
function log(...args) { console.log("[NEONWIN]", ...args); }

/* -------------------- AUTH: GOOGLE (popup + redirect fallback) -------------------- */
async function googleSignIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    log("Attempting Google popup sign-in...");
    await auth.signInWithPopup(provider);
    // sign-in success will trigger onAuthStateChanged and redirect to dashboard
  } catch (err) {
    log("Popup sign-in error (will try redirect):", err);
    // fallback: try redirect flow (useful on mobile where popups are blocked)
    try {
      await auth.signInWithRedirect(provider);
      // after redirect, getRedirectResult will be handled in on load/redirect handler
    } catch (err2) {
      console.error("Google redirect fallback failed:", err2);
      showModal("Google sign-in failed: " + (err2.message || err2));
    }
  }
}

/* -------------------- AUTH: PHONE OTP --------------------
   - Shows phone UI (your HTML must have phoneInput, btnSendOtp, btnVerifyOtp, recaptcha-container)
*/
let _confirmationResult = null;

async function sendPhoneOtp(phoneNumber) {
  if (!phoneNumber) {
    showModal("Please enter your phone number (with country code).");
    return;
  }
  try {
    // invisible reCAPTCHA verifier (creates a widget in recaptcha-container)
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      'size': 'invisible',
      'callback': function(response) { log("reCAPTCHA solved"); }
    });
    const appVerifier = window.recaptchaVerifier;
    showModal("Sending OTP to " + phoneNumber + " ...", { autoClose: 1200 });
    const confirmation = await auth.signInWithPhoneNumber(phoneNumber, appVerifier);
    _confirmationResult = confirmation;
    showModal("OTP sent. Enter the code to verify.");
    log("OTP sent:", confirmation);
  } catch (err) {
    console.error("sendPhoneOtp error:", err);
    showModal("Failed to send OTP: " + (err.message || err));
  }
}

async function verifyPhoneOtp(code) {
  if (!_confirmationResult) {
    showModal("No OTP request found. Try sending OTP again.");
    return;
  }
  try {
    showModal("Verifying OTP...");
    const result = await _confirmationResult.confirm(code);
    // result.user is phone-authenticated user
    log("Phone sign-in success", result.user);
    // set providerUser for later linking step if you require email/password linking
    providerUser = result.user;
    // show extra info flow in your UI to collect username & password for linking
    showExtraAfterProviderAuth(result.user);
  } catch (err) {
    console.error("verifyPhoneOtp error:", err);
    showModal("OTP verification failed: " + (err.message || err));
  }
}

/* -------------------- LINKING PROVIDER USER TO EMAIL/PASSWORD --------------------
   After provider sign-in (Google or Phone), we show extra fields:
   - emailForLink, usernameForLink, passwordForLink
   When user clicks "Create Account", we create Email credential and link it to providerUser.
*/
let providerUser = null; // temporarily holds firebase.User after provider sign-in

function showExtraAfterProviderAuth(user) {
  providerUser = user;
  // Make sure the DOM fields exist and then show the section
  const extra = $('extraSection');
  if (extra) extra.classList.remove('hidden');
  // Prefill email if provider gave one
  if (user && user.email && $('emailForLink')) $('emailForLink').value = user.email;
  showModal("Provider authenticated. Complete account by choosing username & password.");
}

async function completeSignupLink() {
  // must be called after providerUser is populated
  const email = $('emailForLink') ? $('emailForLink').value.trim() : "";
  const username = $('usernameForLink') ? $('usernameForLink').value.trim() : "";
  const password = $('passwordForLink') ? $('passwordForLink').value : "";

  if (!providerUser) { showModal("No provider authentication found. Start again."); return; }
  if (!email || !username || !password) { showModal("Fill email, username and password."); return; }

  try {
    // create email credential and link
    const cred = firebase.auth.EmailAuthProvider.credential(email, password);
    await providerUser.linkWithCredential(cred);
    log("Linked provider account with email credential", providerUser.uid);

    // Save profile in Firestore
    const uid = providerUser.uid;
    const profileRef = db.collection("users").doc(uid);
    await profileRef.set({
      uid,
      email,
      username,
      coins: 0,
      wins: 0,
      losses: 0,
      totalGames: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    showModal("Account created successfully! Redirecting...", { autoClose: 1200 });
    setTimeout(() => window.location.href = "dashboard.html", 1200);
  } catch (err) {
    console.error("completeSignupLink error:", err);
    showModal("Failed to complete signup: " + (err.message || err));
  }
}

/* -------------------- EMAIL / PASSWORD LOGIN -------------------- */
async function emailPasswordLogin(email, password) {
  if (!email || !password) { showModal("Enter email and password"); return; }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showModal("Login successful", { autoClose: 800 });
    setTimeout(() => window.location.href = "dashboard.html", 900);
  } catch (err) {
    console.error("emailPasswordLogin error:", err);
    // Friendly error popup
    showModal("Wrong email or password");
  }
}

/* -------------------- ON REDIRECT RESULT (for Google redirect fallback) -------------------- */
auth.getRedirectResult()
  .then(result => {
    if (result && result.user) {
      providerUser = result.user;
      // if providerUser exists we can show extra linking UI
      showExtraAfterProviderAuth(result.user);
    }
  })
  .catch(err => {
    console.warn("getRedirectResult error:", err);
  });

/* -------------------- AUTH STATE CHANGE & PROFILE ENSURE -------------------- */
auth.onAuthStateChanged(async (user) => {
  try {
    if (!user) {
      // If user is not logged in and trying to access protected pages, send to index
      const p = window.location.pathname;
      if (p.includes("dashboard.html") || p.includes("profile.html")) {
        window.location.href = "index.html";
      }
      return;
    }

    // Ensure Firestore profile exists
    const uid = user.uid;
    const profileRef = db.collection("users").doc(uid);
    const snap = await profileRef.get();
    if (!snap.exists) {
      // Create a minimal profile using provider info
      await profileRef.set({
        uid,
        email: user.email || null,
        username: user.displayName ? user.displayName : "Player" + uid.slice(0, 5),
        coins: 0,
        wins: 0,
        losses: 0,
        totalGames: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      log("Created minimal profile for", uid);
    }

    // If currently on index page, redirect to dashboard
    const path = window.location.pathname;
    if (path.endsWith("index.html") || path === "/" || path === "") {
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    console.error("onAuthStateChanged handler error:", err);
  }
});

/* -------------------- DASHBOARD: load profile, timer, history, UI -------------------- */

// Load profile values into dashboard UI
async function loadProfileToDashboard() {
  const user = auth.currentUser;
  if (!user) return;
  const profileRef = db.collection("users").doc(user.uid);
  const snap = await profileRef.get();
  if (!snap.exists) return;
  const data = snap.data();
  if ($('coins')) $('coins').innerText = (data.coins != null) ? data.coins : 0;
  if ($('displayName')) $('displayName').innerText = data.username || user.displayName || "Player";
}

// Timer logic (1 minute per round, auto-reset)
let roundTimer = 60;
let roundInterval = null;
function startTimer() {
  roundTimer = 60;
  if (roundInterval) clearInterval(roundInterval);
  roundInterval = setInterval(() => {
    roundTimer--;
    if ($('timerDisplay')) {
      const mm = Math.floor(roundTimer/60);
      const ss = roundTimer % 60;
      $('timerDisplay').innerText = (mm<10? "0"+mm:mm) + ":" + (ss<10? "0"+ss:ss);
    }
    if (roundTimer <= 0) {
      // reset the round
      roundTimer = 60;
    }
  }, 1000);
}

// History loader
async function loadHistory() {
  const user = auth.currentUser;
  if (!user) return;
  if (!$('historyList')) return;
  const historyList = $('historyList');
  historyList.innerHTML = "";
  const snap = await db.collection('users').doc(user.uid).collection('history')
    .orderBy('time','desc').limit(10).get();
  snap.forEach(doc => {
    const d = doc.data();
    const li = document.createElement('li');
    const when = d.time ? new Date(d.time.toDate()).toLocaleString() : "";
    li.innerText = `${when} — ${d.result.toUpperCase()} — ${d.color} — bet ${d.bet} — reward ${d.reward||0}`;
    historyList.appendChild(li);
  });
}

/* -------------------- GAME PLAY: select color, auto-random, place bet transaction -------------------- */
let selectedColor = null;
function selectColor(color) {
  selectedColor = color;
  // small UI feedback: highlight and modal
  showModal("Selected color: " + color.toUpperCase(), { autoClose: 800 });
}

function autoRandom() {
  const arr = ['red','green','violet'];
  const r = arr[Math.floor(Math.random()*arr.length)];
  selectColor(r);
}

/*
  placeBet() uses a Firestore transaction so all coin changes are atomic and server-side-ish.
  Rules:
   - Bet cost is subtracted immediately
   - 1-in-10 win gives reward = bet * 5
   - Each play increments totalGames
   - Wins / losses counters updated
   - History document stored under users/{uid}/history/
*/
async function placeBet() {
  const user = auth.currentUser;
  if (!user) { showModal("Please login first."); return; }

  const betInput = $('betInput');
  if (!betInput) { showModal("Bet input missing in UI"); return; }

  const betVal = parseInt(betInput.value, 10);
  if (!betVal || betVal <= 0) { showModal("Enter a valid bet (coins)."); return; }
  if (!selectedColor) { showModal("Please select a color before placing bet."); return; }

  const userRef = db.collection('users').doc(user.uid);
  try {
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(userRef);
      if (!doc.exists) throw new Error("Profile missing");
      const profile = doc.data();
      const currentCoins = profile.coins || 0;
      if (currentCoins < betVal) throw new Error("Not enough coins");

      // deduct coins immediately
      const afterDeduct = currentCoins - betVal;
      tx.update(userRef, { coins: afterDeduct, totalGames: (profile.totalGames || 0) + 1 });

      // compute win/lose
      const rnd = Math.floor(Math.random()*10); // 0..9
      if (rnd === 0) {
        // win
        const winAmount = betVal * 5;
        const newCoins = afterDeduct + winAmount;
        tx.update(userRef, { coins: newCoins, wins: (profile.wins || 0) + 1 });
        // add history doc
        tx.set(userRef.collection ? userRef.collection('history').doc() : db.collection('users').doc(user.uid).collection('history').doc(), {
          time: firebase.firestore.FieldValue.serverTimestamp(),
          result: "win",
          color: selectedColor,
          bet: betVal,
          reward: winAmount
        });
        // after transaction completes, show modal
        setTimeout(()=> showModal("🎉 You WON! +" + winAmount + " coins", { autoClose: 1500 }), 80);
      } else {
        // lose
        tx.update(userRef, { losses: (profile.losses || 0) + 1 });
        tx.set(userRef.collection ? userRef.collection('history').doc() : db.collection('users').doc(user.uid).collection('history').doc(), {
          time: firebase.firestore.FieldValue.serverTimestamp(),
          result: "lose",
          color: selectedColor,
          bet: betVal
        });
        setTimeout(()=> showModal("😢 You lost. Try again!", { autoClose: 1200 }), 80);
      }
    });

    // reload UI values
    await loadProfileToDashboard();
    await loadHistory();
    // reset selection and input
    selectedColor = null;
    betInput.value = "";
  } catch (err) {
    console.error("placeBet transaction error:", err);
    showModal("Play failed: " + (err.message || err));
  }
}

/* -------------------- DEPOSIT REQUEST (demo) -------------------- */
async function requestDeposit() {
  const user = auth.currentUser;
  if (!user) { showModal("Login required"); return; }
  try {
    const ok = confirm("Request 100 demo coins from admin? (demo only)");
    if (!ok) return;
    await db.collection('depositRequests').add({
      user: user.uid,
      email: user.email || null,
      amount: 100,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showModal("Request submitted. Admin will approve in demo.");
  } catch (err) {
    console.error("requestDeposit error:", err);
    showModal("Request failed: " + (err.message || err));
  }
}

/* -------------------- LOAD PROFILE PAGE -------------------- */
async function loadProfilePage() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) return;
    const p = snap.data();
    if ($('pf-username')) $('pf-username').innerText = p.username || user.displayName || "Player";
    if ($('pf-email')) $('pf-email').innerText = p.email || user.email || "—";
    if ($('pf-coins')) $('pf-coins').innerText = p.coins || 0;
    if ($('pf-games')) $('pf-games').innerText = p.totalGames || 0;
    if ($('pf-wins')) $('pf-wins').innerText = p.wins || 0;
    if ($('pf-pic')) $('pf-pic').src = user.photoURL || "https://via.placeholder.com/120";
  } catch (err) {
    console.error("loadProfilePage error:", err);
  }
}

/* -------------------- NAV HELPERS -------------------- */
window.goProfile = () => { window.location.href = "profile.html"; };
window.goDashboard = () => { window.location.href = "dashboard.html"; };
window.logout = async () => { await auth.signOut(); window.location.href = "index.html"; };

/* -------------------- BIND UI BUTTONS (if elements exist) -------------------- */
function bindUi() {
  // index / signup UI
  if ($('btnGoogle')) $('btnGoogle').addEventListener('click', googleSignIn);
  if ($('btnPhone')) $('btnPhone').addEventListener('click', () => {
    if ($('entrySection')) $('entrySection').classList.add('hidden');
    if ($('phoneSection')) $('phoneSection').classList.remove('hidden');
  });
  if ($('btnCancelPhone')) $('btnCancelPhone').addEventListener('click', () => {
    if ($('phoneSection')) $('phoneSection').classList.add('hidden');
    if ($('entrySection')) $('entrySection').classList.remove('hidden');
  });
  if ($('btnSendOtp')) $('btnSendOtp').addEventListener('click', () => sendPhoneOtp($('phoneInput').value.trim()));
  if ($('btnVerifyOtp')) $('btnVerifyOtp').addEventListener('click', () => verifyPhoneOtp($('otpInput').value.trim()));
  if ($('btnCompleteSignup')) $('btnCompleteSignup').addEventListener('click', completeSignupLink);

  // email login
  if ($('btnEmailLogin')) $('btnEmailLogin').addEventListener('click', () => emailPasswordLogin($('loginEmail').value.trim(), $('loginPassword').value));

  // dashboard UI
  if ($('placeBtn')) $('placeBtn').addEventListener('click', placeBet);
  if ($('historyList')) loadHistory();

  // modal ok
  if ($('modalOk')) $('modalOk').addEventListener('click', hideModal);
}

// call bind on load to attach any existing elements
bindUi();

/* -------------------- PAGE-LOAD ROUTING (initialize per page) -------------------- */
window.addEventListener('load', async () => {
  bindUi();

  const path = window.location.pathname;
  if (path.includes('dashboard.html')) {
    // wait for auth
    auth.onAuthStateChanged(async (user) => {
      if (!user) { window.location.href = "index.html"; return; }
      await loadProfileToDashboard();
      await loadHistory();
      startTimer();
    });
  }

  if (path.includes('profile.html')) {
    auth.onAuthStateChanged(async (user) => {
      if (!user) { window.location.href = "index.html"; return; }
      await loadProfilePage();
    });
  }

  // handle redirect sign-in result for redirect fallback flows
  auth.getRedirectResult().then(res => {
    if (res && res.user) {
      providerUser = res.user;
      showExtraForLink(providerUser);
    }
  }).catch(err => {
    console.warn("redirect result error (on load):", err);
  });

  // small performance/UX helper: auto-hide any visible modal after 6s (if left open)
  setInterval(() => {
    const m = $('modal');
    if (m && !m.classList.contains('hidden')) {
      // do not auto-hide if a specific flag is set - for demo keep simple auto-close
      hideModal();
    }
  }, 60000); // every minute, harmless
});

/* -------------------- Extra utility functions for debugging & admin (demo) -------------------- */

// DEBUG: fetch profile for console
async function debugFetchProfile() {
  const user = auth.currentUser;
  if (!user) { log("No auth user"); return; }
  const snap = await db.collection('users').doc(user.uid).get();
  log("Profile:", snap.exists ? snap.data() : "missing");
}

// ADMIN DEMO: (not exposed in UI) — approve deposit requests (requires admin role check on server in real app)
async function adminAddCoinsDemo(userId, amount) {
  try {
    // this is a demo helper: in real app use secure admin server endpoints
    const ref = db.collection('users').doc(userId);
    await db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists) throw "user not found";
      const coins = d.data().coins || 0;
      tx.update(ref, { coins: coins + amount });
  
