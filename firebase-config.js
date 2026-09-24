// 1-QADAM: https://console.firebase.google.com da bepul loyiha yarating.
// 2-QADAM: Project settings (tishli g'ildirak) -> General -> Your apps -> Web (</>) ->
//          firebaseConfig dagi 6 ta qiymatni ko'chirib, pastga qo'ying.
// 3-QADAM: Batafsil yo'riqnoma: FIREBASE-QOLLANMA.txt
// OSON YOL: saytda admin bilan kiring -> Videolar -> Admin panel ->
// "Saytga yuklash (bulut baza)" qutisiga kalitlarni yozing (faylni tahrirlash shart emas).
var firebaseConfig = {
  apiKey: "BU_YERGA_API_KEY",
  authDomain: "BU_YERGA_AUTH_DOMAIN",
  projectId: "BU_YERGA_PROJECT_ID",
  storageBucket: "BU_YERGA_STORAGE_BUCKET",
  messagingSenderId: "BU_YERGA_SENDER_ID",
  appId: "BU_YERGA_APP_ID"
};

// Google orqali kirganda ADMIN bo'ladigan emaillar (o'zingiznikini yozing!)
var ADMIN_EMAILS = ["sizning@gmail.com"];
