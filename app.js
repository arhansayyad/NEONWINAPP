const firebaseConfig = {
  apiKey: "AIzaSyCDCOZEeVLGiApRiJdhGOBNaAkZMaWfiPs",
  authDomain: "neonwin-a8b02.firebaseapp.com",
  projectId: "neonwin-a8b02",
  storageBucket: "neonwin-a8b02.firebasestorage.app",
  messagingSenderId: "1032353146602",
  appId: "1:1032353146602:web:18a0b748a3cd684d845993"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const admins = {
  "Arhan":"444444",
  "Admin":"141466",
  "Alex":"676757",
  "Rudra":"882288",
  "Jonathan":"696969",
  "Bihari":"141414",
  "India":"112233",
  "NEONWIN":"334455",
  "NeonBachha":"121314",
  "Chief":"777777",
  "Satta":"141619",
  "Wallet":"565656",
  "Escobar":"725639",
  "Label":"991026",
  "Work":"537728",
  "Hello":"555378",
  "Armyboi":"552779",
  "Meow":"636373",
  "Void":"366378",
  "Bullet":"881288"
};

function googleLogin(){
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).then(result=>{
    saveUser(result.user);
  });
}

function sendOTP(){
  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container');
  const phone = document.getElementById("phone").value;
  auth.signInWithPhoneNumber(phone, window.recaptchaVerifier)
  .then(result=>{
    window.confirmationResult = result;
    alert("OTP Sent");
  });
}

function verifyOTP(){
  const code = document.getElementById("otp").value;
  confirmationResult.confirm(code).then(result=>{
    saveUser(result.user);
  });
}

function saveUser(user){
  db.collection("users").doc(user.uid).set({
    name: user.displayName || "User",
    phone: user.phoneNumber || "",
    wallet: 0
  },{merge:true}).then(()=>{
    window.location="dashboard.html";
  });
}

function adminLogin(){
  const u = document.getElementById("adminUser").value;
  const p = document.getElementById("adminPass").value;
  if(admins[u] && admins[u]===p){
    localStorage.setItem("admin","true");
    window.location="admin.html";
  } else {
    alert("Invalid Admin Credentials");
  }
}

function addPoints(){
  const uid = document.getElementById("uid").value;
  const points = parseInt(document.getElementById("points").value);
  db.collection("users").doc(uid).update({
    wallet: firebase.firestore.FieldValue.increment(points)
  }).then(()=>{
    alert("Points Added");
  });
}

function logout(){
  auth.signOut();
  localStorage.clear();
  window.location="index.html";
}

auth.onAuthStateChanged(user=>{
  if(user && document.getElementById("wallet")){
    db.collection("users").doc(user.uid).onSnapshot(doc=>{
      document.getElementById("userName").innerText = user.displayName || user.phoneNumber;
      document.getElementById("wallet").innerText = doc.data().wallet;
    });
  }
});