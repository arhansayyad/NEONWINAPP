// ---------------------- NEONWIN app.js (v8 compat) ----------------------
// Paste this ENTIRE file into your app.js (overwrite existing content).

// ---------- FIREBASE CONFIG (YOUR project) ----------
var firebaseConfig = {
  apiKey: "AIzaSyCDCOZEeVLGiApRiJdhGOBNaAkZMaWfiPs",
  authDomain: "neonwin-a8b02.firebaseapp.com",
  projectId: "neonwin-a8b02",
  storageBucket: "neonwin-a8b02.appspot.com", // appspot.com is typical
  messagingSenderId: "1032353146602",
  appId: "1:1032353146602:web:18a0b748a3cd684d845993",
  measurementId: "G-750FY1T1VY"
};

// Initialize Firebase (v8)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
var auth = firebase.auth();
var db = firebase.firestore();

// ---------- Debug helpers (temporary) ----------
try { console.log("NEONWIN app.js loaded"); } catch(e){}
(function quickUiBorder(){ try { document.documentElement.style.outline = "none"; } catch(e){} })();

// Attach global error handler to show any critical errors as an alert (temporary)
window.onerror = function(msg, src, line, col, err) {
  try {
    alert("JS ERROR: " + msg + " (line " + line + ")");
  } catch(e){}
  console.error("NEONWIN global error:", msg, src, line, col, err);
  return false;
};

// ---------- UI helpers ----------
function showModal(text, autoCloseMs) {
  try {
    var m = document.getElementById("modal");
    var t = document.getElementById("modalText");
    if (m && t) {
      t.innerText = text;
      m.classList.remove("hidden");
      if (autoCloseMs) setTimeout(()=>m.classList.add("hidden"), autoCloseMs);
      return;
    }
  } catch(e){}
  // fallback
  alert(text);
}
window.closeModal = function(){ var m=document.getElementById("modal"); if(m) m.classList.add("hidden"); };

// ---------- GOOGLE SIGN-IN (popup first, then redirect fallback) ----------
window.googleSignIn = async function() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    // Try popup first
    await auth.signInWithPopup(provider);
    // on success, onAuthStateChanged will redirect
  } catch (errPopup) {
    console.warn("Popup failed — trying redirect fallback:", errPopup);
    // If popup is blocked or not supported, try redirect fallback
    try {
      const provider2 = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithRedirect(provider2);
      showModal("Redirecting to Google for sign-in...");
      // The page will reload and getRedirectResult will be handled below
    } catch (errRedirect) {
      console.error("Google redirect failed:", errRedirect);
      showModal("Google sign-in failed: " + (errRedirect.message || errPopup.message || errRedirect));
    }
  }
};

// ---------- Handle redirect result (if redirect fallback used) ----------
auth.getRedirectResult().then((result) => {
  if (result && result.user) {
    // provider sign-in succeeded through redirect
    showModal("Signed in via redirect. Finalizing...", 1200);
    // (onAuthStateChanged will run and route to dashboard)
  }
}).catch(err => {
  console.warn("getRedirectResult error:", err);
  // ignore non-critical
});

// ---------- Email/password login helper (for "Already have account? Login") ----------
window.emailLogin = async function(email, pass) {
  if (!email || !pass) { showModal("Provide email and password"); return; }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    showModal("Login successful", 800);
  } catch (e) {
    console.error("Email login failed:", e);
    showModal("Wrong email or password");
  }
};

// ---------- onAuthStateChanged: protect pages & redirect ----------
auth.onAuthStateChanged(async function(user) {
  try {
    const path = window.location.pathname;
    // if user not logged in and is on a protected page -> redirect to index
    if (!user) {
      if (path.includes("dashboard.html") || path.includes("profile.html")) {
        window.location.href = "index.html";
      }
      // else remain on index
      return;
    }

    // ensure Firestore profile exists
    const uid = user.uid;
    const profileRef = db.collection("users").doc(uid);
    const snap = await profileRef.get();
    if (!snap.exists) {
      // create minimal profile
      await profileRef.set({
        uid,
        email: user.email || null,
        username: user.displayName || ("Player" + uid.substring(0,5)),
        coins: 0,
        wins: 0,
        losses: 0,
        totalGames: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // redirect logged-in users away from index to dashboard
    if (path.endsWith("index.html") || path === "/" || path === "") {
      window.location.href = "dashboard.html";
      return;
    }

    // if on dashboard or profile, populate UI elements (if present)
    if (path.includes("dashboard.html")) {
      const data = (await profileRef.get()).data();
      const coinsEl = document.getElementById("coins");
      const nameEl = document.getElementById("displayName");
      if (coinsEl) coinsEl.innerText = (data && data.coins) ? data.coins : 0;
      if (nameEl) nameEl.innerText = (data && data.username) ? data.username : (user.displayName || "Player");
      // start timer if element present
      try { if (typeof startTimer === "function") startTimer(); } catch(e){}
    }
    if (path.includes("profile.html")) {
      const p = (await profileRef.get()).data();
      if (document.getElementById("pf-username")) document.getElementById("pf-username").innerText = p.username || user.displayName;
      if (document.getElementById("pf-email")) document.getElementById("pf-email").innerText = p.email || user.email;
      if (document.getElementById("pf-coins")) document.getElementById("pf-coins").innerText = p.coins || 0;
      if (document.getElementById("pf-pic")) document.getElementById("pf-pic").src = user.photoURL || "https://via.placeholder.com/120";
    }

  } catch (err) {
    console.error("onAuthStateChanged handler error:", err);
  }
});

// ---------- LOGOUT ----------
window.logout = async function() {
  try {
    await auth.signOut();
    window.location.href = "index.html";
  } catch (e) {
    console.error("logout failed", e);
    showModal("Logout failed");
  }
};

// ---------- Simple demo timer and other small helpers used by dashboard.html ----------
var roundSeconds = 60, roundInterval = null;
window.startTimer = function() {
  try {
    roundSeconds = 60;
    if (roundInterval) clearInterval(roundInterval);
    roundInterval = setInterval(function(){
      roundSeconds--;
      var el = document.getElementById("timerDisplay");
      if (el) {
        var mm = Math.floor(roundSeconds/60), ss = roundSeconds%60;
        el.innerText = (mm<10?"0"+mm:mm) + ":" + (ss<10?"0"+ss:ss);
      }
      if (roundSeconds <= 0) roundSeconds = 60;
    }, 1000);
  } catch(e) { console.error(e); }
};

// Minimal stub functions for dashboard game so you won't see "not defined" errors if HTML calls them:
window.selectColor = function(c){ showModal("Selected: " + c, 700); window.__selectedColor = c; };
window.autoRandom = function(){ var a=['red','green','violet']; var r=a[Math.floor(Math.random()*a.length)]; window.selectColor(r); };
window.placeBet = async function() {
  var betInput = document.getElementById("betInput");
  if (!betInput) { showModal("Bet UI missing"); return; }
  var bet = parseInt(betInput.value||"0",10);
  if (!bet || bet<=0) { showModal("Enter bet amount"); return; }
  var color = window.__selectedColor || "random";
  showModal("Placing bet " + bet + " on " + color);
  // transaction logic is in the bigger app.js you already had — this minimal flow prevents errors.
};

// ---------- End of app.js ----------
