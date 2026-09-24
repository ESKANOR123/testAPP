// Cloud qatlam — Firebase (Firestore + Storage + Auth).
// firebase-config.js toldirilmagan bolsa Cloud.faol = false va sayt
// lokal demo rejimda ishlayveradi (IndexedDB + localStorage).
var Cloud = { faol: false, auth: null, db: null, storage: null, user: null };

function cloudConfigOqi() {
  var baza = (typeof firebaseConfig !== 'undefined') ? firebaseConfig : {};
  try {
    var saq = JSON.parse(localStorage.getItem('akbarFamily_firebase') || 'null');
    if (saq && saq.apiKey && saq.apiKey.indexOf('BU_YERGA') !== 0) {
      var n = {};
      for (var k in baza) { if (baza.hasOwnProperty(k)) n[k] = baza[k]; }
      for (var k2 in saq) { if (saq.hasOwnProperty(k2)) n[k2] = saq[k2]; }
      return n;
    }
  } catch (e) {}
  return baza;
}

function cloudSozlangan() {
  try {
    var c = cloudConfigOqi();
    return !!(c && c.apiKey && c.apiKey.indexOf('BU_YERGA') !== 0);
  } catch (e) { return false; }
}

function skriptYukla(src) {
  return new Promise(function (hal, rad) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { hal(); };
    s.onerror = function () { rad(new Error('sdk')); };
    document.head.appendChild(s);
  });
}

function cloudInit() {
  if (!cloudSozlangan()) return Promise.resolve(false);
  if (Cloud.faol) return Promise.resolve(true);
  var V = 'https://www.gstatic.com/firebasejs/10.12.2/';
  return skriptYukla(V + 'firebase-app-compat.js')
    .then(function () { return skriptYukla(V + 'firebase-auth-compat.js'); })
    .then(function () { return skriptYukla(V + 'firebase-firestore-compat.js'); })
    .then(function () { return skriptYukla(V + 'firebase-storage-compat.js'); })
    .then(function () {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        try { firebase.app(); } catch (e) { firebase.initializeApp(cloudConfigOqi()); }
      } else {
        firebase.initializeApp(cloudConfigOqi());
      }
      Cloud.auth = firebase.auth();
      Cloud.db = firebase.firestore();
      Cloud.storage = firebase.storage();
      Cloud.faol = true;
      Cloud.auth.onAuthStateChanged(function (u) {
        Cloud.user = u || null;
        if (typeof cloudAuthYangila === 'function') cloudAuthYangila();
      });
      return true;
    })
    .catch(function () { Cloud.faol = false; return false; });
}

function cloudAuthYangila() {
  if (typeof authKorinishi === 'function') authKorinishi();
  if (typeof chatChiz === 'function') chatChiz();
}

function cloudAdminmi() {
  try {
    if (!(Cloud.user && Cloud.user.email)) return false;
    if (typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.indexOf(Cloud.user.email) !== -1) return true;
    var mahalliy = JSON.parse(localStorage.getItem('akbarFamily_admins') || '[]');
    return mahalliy.indexOf(Cloud.user.email) !== -1;
  } catch (e) { return false; }
}

// Bulutdagi jadvallarni yuklab, lokal nusxaga yozamiz (player o'zgarishsiz ishlaydi)
function cloudToplamYukla() {
  var jadvallar = [
    ['videolar', 'akbarFamily_videos'],
    ['papkalar', 'akbarFamily_papkalar'],
    ['mangalar', 'akbarFamily_mangalar'],
    ['mangaPapkalar', 'akbarFamily_mangaPapkalar']
  ];
  var zanjir = Promise.resolve();
  var jami = 0;
  jadvallar.forEach(function (j) {
    zanjir = zanjir.then(function () {
      return Cloud.db.collection(j[0]).get().then(function (snap) {
        var arr = [];
        snap.forEach(function (d) { arr.push(d.data()); });
        jami += arr.length;
        arr.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
        try { localStorage.setItem(j[1], JSON.stringify(arr)); } catch (e) {}
      }).catch(function () {});
    });
  });
  return zanjir.then(function () { return { bush: jami === 0 }; });
}

// Katalog yozuvlari (videolar ham URL korinishda saqlanadi — hamma kora oladi)
function cloudVideoSaqla(m) {
  if (!Cloud.faol || !m) return Promise.resolve();
  var nusxa = {};
  for (var k in m) { if (m.hasOwnProperty(k)) nusxa[k] = m[k]; }
  if (nusxa.papkaId === null || typeof nusxa.papkaId === 'undefined') delete nusxa.papkaId;
  return Cloud.db.collection('videolar').doc(String(m.id)).set(nusxa).catch(function () {});
}
function cloudVideoOchir(id) {
  if (!Cloud.faol) return Promise.resolve();
  return Cloud.db.collection('videolar').doc(String(id)).delete().catch(function () {});
}
function cloudPapkaSaqla(p) {
  if (!Cloud.faol || !p) return Promise.resolve();
  return Cloud.db.collection('papkalar').doc(String(p.id)).set(p).catch(function () {});
}
function cloudPapkaOchir(id) {
  if (!Cloud.faol) return Promise.resolve();
  return Cloud.db.collection('papkalar').doc(String(id)).delete().catch(function () {});
}
function cloudMangaSaqla(m) {
  if (!Cloud.faol || !m) return Promise.resolve();
  var nusxa = {};
  for (var k in m) { if (m.hasOwnProperty(k)) nusxa[k] = m[k]; }
  if (nusxa.mangaPapkaId === null || typeof nusxa.mangaPapkaId === 'undefined') delete nusxa.mangaPapkaId;
  if (nusxa.pdfFile === null) delete nusxa.pdfFile;
  return Cloud.db.collection('mangalar').doc(String(m.id)).set(nusxa).catch(function () {});
}
function cloudMangaOchir(id) {
  if (!Cloud.faol) return Promise.resolve();
  return Cloud.db.collection('mangalar').doc(String(id)).delete().catch(function () {});
}
function cloudMangaPapkaSaqla(p) {
  if (!Cloud.faol || !p) return Promise.resolve();
  return Cloud.db.collection('mangaPapkalar').doc(String(p.id)).set(p).catch(function () {});
}
function cloudMangaPapkaOchir(id) {
  if (!Cloud.faol) return Promise.resolve();
  return Cloud.db.collection('mangaPapkalar').doc(String(id)).delete().catch(function () {});
}

// Faylni Storage ga yuklash (jarayon foizi bilan)
function cloudFaylYukla(yol, fayl, foizFn) {
  return new Promise(function (hal, rad) {
    var ref = Cloud.storage.ref(yol);
    var task = ref.put(fayl);
    task.on('state_changed',
      function (snap) {
        if (foizFn) {
          try { foizFn(Math.round(snap.bytesTransferred * 100 / snap.totalBytes)); } catch (e) {}
        }
      },
      function (err) { rad(err); },
      function () { task.snapshot.ref.getDownloadURL().then(hal).catch(rad); }
    );
  });
}
function cloudMatnYukla(yol, dataUrl) {
  return Cloud.storage.ref(yol).putString(dataUrl, 'data_url').then(function (snap) {
    return snap.ref.getDownloadURL();
  });
}

// Chat (real vaqt)
function cloudXabarYubor(x) {
  if (!Cloud.faol) return Promise.resolve();
  return Cloud.db.collection('xabarlar').add(x).then(function () {}).catch(function () {});
}
function cloudXabarOchir(id) {
  if (!Cloud.faol) return Promise.resolve();
  return Cloud.db.collection('xabarlar').doc(String(id)).delete().catch(function () {});
}
function cloudChatKuzat(cb) {
  if (!Cloud.faol) return;
  Cloud.db.collection('xabarlar').orderBy('vaqt').limit(200).onSnapshot(function (snap) {
    var arr = [];
    snap.forEach(function (d) {
      var x = d.data();
      x.id = d.id;
      arr.push(x);
    });
    window._chatCloud = arr;
    if (cb) cb();
  });
}

// Auth: Google va Telefon
function cloudGoogle() {
  var prov = new firebase.auth.GoogleAuthProvider();
  return Cloud.auth.signInWithPopup(prov);
}
var _telTasdiq = null;
function cloudSmsYubor(tel) {
  if (!window._recaptcha) {
    window._recaptcha = new firebase.auth.RecaptchaVerifier('recaptcha', { size: 'invisible' });
  }
  return Cloud.auth.signInWithPhoneNumber(tel, window._recaptcha).then(function (conf) {
    _telTasdiq = conf;
  });
}
function cloudSmsTasdiq(kod) {
  if (!_telTasdiq) return Promise.reject(new Error('kod'));
  return _telTasdiq.confirm(kod);
}
function cloudChiqish() {
  if (Cloud.faol && Cloud.auth) { try { Cloud.auth.signOut(); } catch (e) {} }
}
