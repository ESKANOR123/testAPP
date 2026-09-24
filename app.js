// Akbar Family — frontend demo: auth + rollar + video + prevyu.
// Video fayllar IndexedDB da saqlanadi — sahifa yangilanganda ham o'chmaydi.
// Metadata (sarlavha, prevyu) localStorage da. Real loyihada backend kerak.

var USERS_KEY = 'akbarFamily_users';
var VIDEOS_KEY = 'akbarFamily_videos';
var SESSION_KEY = 'akbarFamily_session';
var DB_NOMI = 'akbarFamilyDB';
var DB_DOKON = 'videofayllar';
var MANGA_DOKON = 'mangasahifalar';
var MANGA_KEY = 'akbarFamily_mangalar';
var TARJIMA_KEY = 'akbarFamily_tarjima';
var PAPKA_KEY = 'akbarFamily_papkalar';
var MANGA_PAPKA_KEY = 'akbarFamily_mangaPapkalar';
var CHAT_KEY = 'akbarFamily_chat';
var mangaTili = 'uz';
var ochiqPapkaId = null;
var ochiqMangaPapkaId = null;

// GitHub repo ichidagi umumiy fayllar (videolar.json / kitoblar.json)
// Bu ro'yxat HAMMAGA korinadi — o'chirish/qoshish faqat GitHub orqali.
var manifestVideo = [];
var manifestKitob = [];

function manifestYukla() {
  function ol(url, bazaviyId, papkaKalit) {
    return fetch(url).then(function (j) { return j.json(); }).then(function (arr) {
      if (!arr || !arr.length) return [];
      return arr.map(function (x, i) {
        x.id = bazaviyId + i;
        x.turgun = true;
        return x;
      });
    }).catch(function () { return []; });
  }
  return Promise.all([ol('videolar.json', 900001), ol('kitoblar.json', 800001)]).then(function (r) {
    manifestVideo = r[0].filter(function (v) { return v && v.url; });
    manifestKitob = r[1].map(function (m) {
      m.sahifalar = m.sahifalar || [];
      if (m.pdf && !m.pdfFile) m.pdfFile = { url: m.pdf };
      return m;
    });
  });
}

function barchaVideolar() {
  return manifestVideo.concat(oqi(VIDEOS_KEY, []));
}
function videoTop(id) {
  id = parseInt(id, 10);
  var hamma = barchaVideolar();
  for (var i = 0; i < hamma.length; i++) { if (hamma[i].id === id) return hamma[i]; }
  return null;
}
function barchaKitoblar() {
  return manifestKitob.concat(oqi(MANGA_KEY, []));
}
function kitobTop(id) {
  id = parseInt(id, 10);
  var hamma = barchaKitoblar();
  for (var i = 0; i < hamma.length; i++) { if (hamma[i].id === id) return hamma[i]; }
  return null;
}

// Ruscha janrlarni o'zbekchaga (bir zumda, internet kerak emas)
var JANR_XARITASI = {
  'Фэнтези': 'Fantastika',
  'Приключения': 'Sarguzasht',
  'Драма': 'Drama',
  'Романтика': 'Romantika',
  'Боевик': 'Jangari',
  'Другое': 'Boshqa'
};
function mangaJanr(m) {
  if (mangaTili === 'uz' && JANR_XARITASI[m.janr]) return JANR_XARITASI[m.janr];
  return m.janr;
}

function oqi(kalit, standart) {
  try {
    var x = localStorage.getItem(kalit);
    return x ? JSON.parse(x) : standart;
  } catch (e) { return standart; }
}
function yoz(kalit, qiymat) {
  localStorage.setItem(kalit, JSON.stringify(qiymat));
}

// IndexedDB: video va manga fayllarni doimiy saqlash
function idbOch() {
  return new Promise(function (hal, rad) {
    var sorov = indexedDB.open(DB_NOMI, 2);
    sorov.onupgradeneeded = function () {
      var db = sorov.result;
      if (!db.objectStoreNames.contains(DB_DOKON)) db.createObjectStore(DB_DOKON);
      if (!db.objectStoreNames.contains(MANGA_DOKON)) db.createObjectStore(MANGA_DOKON);
    };
    sorov.onsuccess = function () { hal(sorov.result); };
    sorov.onerror = function () { rad(sorov.error); };
  });
}
function idbQoy(dokon, id, blob) {
  return idbOch().then(function (db) {
    return new Promise(function (hal, rad) {
      var tr = db.transaction(dokon, 'readwrite');
      tr.objectStore(dokon).put(blob, id);
      tr.oncomplete = function () { hal(); };
      tr.onerror = function () { rad(tr.error); };
    });
  });
}
function idbOl(dokon, id) {
  return idbOch().then(function (db) {
    return new Promise(function (hal, rad) {
      var tr = db.transaction(dokon, 'readonly');
      var q = tr.objectStore(dokon).get(id);
      q.onsuccess = function () { hal(q.result || null); };
      q.onerror = function () { rad(q.error); };
    });
  });
}
function idbOchir(dokon, id) {
  return idbOch().then(function (db) {
    return new Promise(function (hal) {
      try {
        var tr = db.transaction(dokon, 'readwrite');
        tr.objectStore(dokon).delete(id);
        tr.oncomplete = function () { hal(); };
        tr.onerror = function () { hal(); };
      } catch (e) { hal(); }
    });
  });
}

// Tayyorlangan object URL lar keshi (IDB dagi videolar uchun)
var urlKesh = {};

function videoSrc(v) {
  if (v.url && v.url.indexOf('blob:') !== 0) return Promise.resolve(v.url);
  if (v.url && v.url.indexOf('blob:') === 0) return Promise.resolve(null);
  if (v.dataUrl) return Promise.resolve(v.dataUrl);
  if (v.idb) {
    if (urlKesh[v.id]) return Promise.resolve(urlKesh[v.id]);
    return idbOl(DB_DOKON, v.id).then(function (blob) {
      if (!blob) return null;
      var u = URL.createObjectURL(blob);
      urlKesh[v.id] = u;
      return u;
    }).catch(function () { return null; });
  }
  return Promise.resolve(null);
}

// Har qanday rasmni video uchun kichik prevyu (thumbnail) qilib qaytaradi
function rasmniKichiklat(fayl, maxKeng, maxBaland, sifat) {
  maxKeng = maxKeng || 640;
  maxBaland = maxBaland || 360;
  sifat = sifat || 0.8;
  return new Promise(function (hal, rad) {
    var img = new Image();
    var url = URL.createObjectURL(fayl);
    img.onload = function () {
      var w = img.width || maxKeng;
      var h = img.height || maxBaland;
      var k = Math.min(1, maxKeng / w, maxBaland / h);
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      hal(c.toDataURL('image/jpeg', sifat));
    };
    img.onerror = function () { URL.revokeObjectURL(url); rad(new Error('rasm')); };
    img.src = url;
  });
}

function seed() {
  if (!localStorage.getItem(USERS_KEY)) {
    yoz(USERS_KEY, [
      { login: 'admin', parol: 'Akbarali09', rol: 'admin' },
      { login: 'user', parol: 'user123', rol: 'user' }
    ]);
  } else {
    // Eski admin kodi yangilansa — avtomatik almashtiramiz
    var us = oqi(USERS_KEY, []);
    var ozg = false;
    us.forEach(function (u) {
      if (u.login === 'admin' && u.parol === 'admin123') { u.parol = 'Akbarali09'; ozg = true; }
    });
    if (ozg) { try { yoz(USERS_KEY, us); } catch (e) {} }
  }
  if (!localStorage.getItem(VIDEOS_KEY)) {
    yoz(VIDEOS_KEY, [
      { id: 1, sarlavha: 'Oilaviy sayohat', janr: 'Sayohat', tavsif: 'Demo video.', url: 'https://www.w3schools.com/html/mov_bbb.mp4', idb: false, prevyu: null, muqova: 1, muallif: 'admin' },
      { id: 2, sarlavha: 'Bogda bir kun', janr: 'Oilaviy', tavsif: 'Demo video.', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', idb: false, prevyu: 'https://picsum.photos/seed/akbar1/640/360', muqova: 2, muallif: 'admin' },
      { id: 3, sarlavha: 'Bolalar tabassumi', janr: 'Bolalar', tavsif: 'Demo video.', url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4', idb: false, prevyu: null, muqova: 3, muallif: 'admin' }
    ]);
  } else {
    var vs = oqi(VIDEOS_KEY, []);
    var ozgardimi = false;
    vs.forEach(function (v) {
      if (v.url && v.url.indexOf('blob:') === 0) { v.url = null; v.buzilgan = true; ozgardimi = true; }
    });
    if (ozgardimi) {
      try { yoz(VIDEOS_KEY, vs); } catch (e) {}
    }
  }
  if (!localStorage.getItem(MANGA_KEY)) {
    yoz(MANGA_KEY, [
      { id: 101, sarlavha_ru: 'Demo kitob', janr: 'Фэнтези', tavsif_ru: 'Demo tavsif.', muallif: 'admin', muqova: 4, prevyu: 'https://picsum.photos/seed/manga1/640/360',
        sahifalar: [
          { url: 'https://picsum.photos/seed/manga1/700/1000' },
          { url: 'https://picsum.photos/seed/manga2/700/1000' },
          { url: 'https://picsum.photos/seed/manga3/700/1000' }
        ] }
    ]);
  }
  if (!localStorage.getItem(PAPKA_KEY)) {
    yoz(PAPKA_KEY, [
      { id: 201, nom: 'Demo serial (3 qism)', tavsif: 'Sinov uchun papka — qismlar bitta joyda.', muallif: 'admin' }
    ]);
    var dv = oqi(VIDEOS_KEY, []);
    dv.forEach(function (v, i) {
      if (v.id === 1 || v.id === 2 || v.id === 3) { v.papkaId = 201; v.qism = i + 1; v.fasl = 1; }
    });
    try { yoz(VIDEOS_KEY, dv); } catch (e) {}
  }
}

// Ruscha — O'zbekcha avtomatik tarjima (bepul API + kesh)
function tarjimaQil(matn) {
  if (!matn) return Promise.resolve('');
  var kesh = oqi(TARJIMA_KEY, {});
  if (kesh[matn]) return Promise.resolve(kesh[matn]);
  var qismlar = [];
  var qoldi = matn;
  while (qoldi.length > 450) {
    var kes = qoldi.lastIndexOf(' ', 450);
    if (kes < 0) kes = 450;
    qismlar.push(qoldi.slice(0, kes));
    qoldi = qoldi.slice(kes);
  }
  qismlar.push(qoldi);
  var zanjir = Promise.resolve([]);
  qismlar.forEach(function (q) {
    zanjir = zanjir.then(function (nat) {
      return fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) + '&langpair=ru|uz')
        .then(function (j) { return j.json(); })
        .then(function (d) {
          var t = (d && d.responseData && d.responseData.translatedText) || q;
          nat.push(t);
          return nat;
        })
        .catch(function () { nat.push(q); return nat; });
    });
  });
  return zanjir.then(function (nat) {
    var yakun = nat.join(' ');
    try {
      var k = oqi(TARJIMA_KEY, {});
      k[matn] = yakun;
      yoz(TARJIMA_KEY, k);
    } catch (e) {}
    return yakun;
  });
}

// Manga: ro'yxat, o'qish
var mangaUrlKesh = {};
var mangaTarjimaKesh = {};
var ochiqManga = null;
var sahifaIndex = 0;

function mangaSahifaURL(s) {
  if (s.url) return Promise.resolve(s.url);
  if (s.idb && s.key) {
    if (mangaUrlKesh[s.key]) return Promise.resolve(mangaUrlKesh[s.key]);
    return idbOl(MANGA_DOKON, s.key).then(function (blob) {
      if (!blob) return null;
      var u = URL.createObjectURL(blob);
      mangaUrlKesh[s.key] = u;
      return u;
    }).catch(function () { return null; });
  }
  return Promise.resolve(null);
}

function mangaChiz() {
  var mangalar = barchaKitoblar();
  var f = joriyFoydalanuvchi();
  var admin = f && f.rol === 'admin';
  $('mangaSoni').textContent = mangalar.length + ' ta kitob (ruscha qoshiladi, ozbekcha korinadi)';
  var panjara = $('mangaPanjara');
  panjara.innerHTML = '';
  if (!mangalar.length) {
    panjara.innerHTML = '<p class="eslatma">Hali kitob qoshilmagan.</p>';
    return;
  }
  mangalar.forEach(function (m) {
    var janrKor = mangaJanr(m);
    var karta = document.createElement('article');
    karta.className = 'anime-karta';
    var muqova = m.prevyu
      ? '<div class="muqova rasmli"><img alt="Kitob muqovasi"><span>' + janrKor + '</span></div>'
      : '<div class="muqova muqova-' + (m.muqova || 4) + '"><span>' + janrKor + '</span></div>';
    karta.innerHTML =
      muqova +
      '<h3></h3><p class="tarjima-sar"></p><p class="meta"></p>' +
      '<div class="karta-tugmalar">' +
        '<button class="tugma tugma-asosiy kichik btn-oqi" type="button">Oqish</button>' +
        ((admin && !m.turgun) ? '<button class="tugma tugma-xavf kichik btn-ochirish" type="button">Ochirish</button>' : '') +
      '</div>';
    karta.querySelector('h3').textContent = m.sarlavha_ru;
    var mp = m.mangaPapkaId ? mangaPapkaTop(m.mangaPapkaId) : null;
    var mpNom = mp ? mp.nom : (m.papka || null);
    var turMatn = m.pdfFile ? 'PDF kitob' : ((m.sahifalar ? m.sahifalar.length : 0) + ' sahifa');
    karta.querySelector('.meta').textContent = janrKor + ' | ' + (mpNom ? mpNom + ' | ' : '') + turMatn + ' | ' + (m.muallif || 'repo') + (m.turgun ? ' | GitHub' : '');
    if (m.prevyu) {
      var img = karta.querySelector('.muqova img');
      if (img) img.setAttribute('src', m.prevyu);
    }
    var tarEl = karta.querySelector('.tarjima-sar');
    if (mangaTili === 'uz') {
      tarEl.textContent = 'Tarjima qilinmoqda...';
      tarjimaQil(m.sarlavha_ru).then(function (t) { tarEl.textContent = t; });
    } else {
      tarEl.textContent = '';
    }
    karta.querySelector('.btn-oqi').onclick = function () { location.hash = '#/kitob/' + m.id; };
    if (admin && !m.turgun) {
      karta.querySelector('.btn-ochirish').onclick = function () {
        if (confirm('"' + m.sarlavha_ru + '" ochirilsinmi?')) {
          (m.sahifalar || []).forEach(function (s) {
            if (s.idb && s.key) {
              if (mangaUrlKesh[s.key]) { URL.revokeObjectURL(mangaUrlKesh[s.key]); delete mangaUrlKesh[s.key]; }
              idbOchir(MANGA_DOKON, s.key);
            }
          });
          if (m.pdfFile && m.pdfFile.key) {
            if (mangaUrlKesh[m.pdfFile.key]) { URL.revokeObjectURL(mangaUrlKesh[m.pdfFile.key]); delete mangaUrlKesh[m.pdfFile.key]; }
            idbOchir(MANGA_DOKON, m.pdfFile.key);
          }
          yoz(MANGA_KEY, oqi(MANGA_KEY, []).filter(function (x) { return x.id !== m.id; }));
          if (typeof Cloud !== 'undefined' && Cloud.faol) cloudMangaOchir(m.id);
          mangaChiz();
          mangaPapkalarChiz();
          mangaPapkaSelectYangila();
        }
      };
    }
    panjara.appendChild(karta);
  });
}

function mangaMatniniKorish() {
  if (!ochiqManga) return;
  if (mangaTili === 'uz') {
    var kalit = ochiqManga.id + '_uz';
    if (mangaTarjimaKesh[kalit]) {
      $('mangaSarlavha').textContent = mangaTarjimaKesh[kalit].sar;
      $('mangaTavsif').textContent = mangaTarjimaKesh[kalit].tav;
      return;
    }
    $('mangaSarlavha').textContent = 'Tarjima qilinmoqda...';
    $('mangaTavsif').textContent = 'Tarjima qilinmoqda...';
    Promise.all([tarjimaQil(ochiqManga.sarlavha_ru), tarjimaQil(ochiqManga.tavsif_ru || '')]).then(function (r) {
      if (!ochiqManga) return;
      mangaTarjimaKesh[ochiqManga.id + '_uz'] = { sar: r[0], tav: r[1] };
      $('mangaSarlavha').textContent = r[0] + ' — ' + mangaJanr(ochiqManga);
      $('mangaTavsif').textContent = r[1];
    });
  } else {
    $('mangaSarlavha').textContent = ochiqManga.sarlavha_ru + ' — ' + ochiqManga.janr;
    $('mangaTavsif').textContent = ochiqManga.tavsif_ru || '';
  }
}

function sahifaniKorish() {
  if (!ochiqManga) return;
  if (ochiqManga.pdfFile) {
    $('mangaSahifa').style.display = 'none';
    document.querySelector('.manga-boshqaruv').style.display = 'none';
    var pdf = $('mangaPdf');
    pdf.style.display = 'block';
    pdf.removeAttribute('src');
    var kk = ochiqManga.pdfFile.key;
    var tayyor = mangaUrlKesh[kk] ? Promise.resolve(mangaUrlKesh[kk]) : idbOl(MANGA_DOKON, kk).then(function (blob) {
      if (!blob) return null;
      var u = URL.createObjectURL(blob);
      mangaUrlKesh[kk] = u;
      return u;
    }).catch(function () { return null; });
    tayyor.then(function (u) {
      if (u) pdf.src = u;
    });
    return;
  }
  $('mangaPdf').style.display = 'none';
  $('mangaPdf').removeAttribute('src');
  $('mangaSahifa').style.display = '';
  document.querySelector('.manga-boshqaruv').style.display = '';
  if (!ochiqManga.sahifalar.length) return;
  sahifaIndex = Math.max(0, Math.min(sahifaIndex, ochiqManga.sahifalar.length - 1));
  $('mangaSana').textContent = (sahifaIndex + 1) + ' / ' + ochiqManga.sahifalar.length;
  $('mangaSahifa').removeAttribute('src');
  $('mangaSahifa').alt = 'Yuklanmoqda...';
  mangaSahifaURL(ochiqManga.sahifalar[sahifaIndex]).then(function (u) {
    if (u) { $('mangaSahifa').src = u; $('mangaSahifa').alt = 'Kitob sahifasi'; }
    else { $('mangaSahifa').alt = 'Sahifa topilmadi'; }
  });
}

function mangaOch(id) {
  ochiqManga = kitobTop(id);
  if (!ochiqManga) return;
  sahifaIndex = 0;
  qutilarniTop();
  if (kitobQuti.parentNode === kitobUy) { kitobUy.style.display = 'flex'; }
  mangaMatniniKorish();
  sahifaniKorish();
}
function mangaYop() {
  $('mangaModal').style.display = 'none';
  $('mangaPdf').removeAttribute('src');
  ochiqManga = null;
}

// Kitob papkalari: manga va kitoblar bitta papkada
function mangaPapkalarOqi() {
  return oqi(MANGA_PAPKA_KEY, []);
}
function mangaPapkaTop(id) {
  var ps = mangaPapkalarOqi();
  for (var i = 0; i < ps.length; i++) { if (ps[i].id === id) return ps[i]; }
  return null;
}
function mangaPapkaMangalari(papkaId) {
  return oqi(MANGA_KEY, []).filter(function (m) { return m.mangaPapkaId === papkaId; });
}
function mangaPapkaSelectYangila() {
  var sel = $('mMangaPapka');
  if (!sel) return;
  var tanlangan = sel.value;
  sel.innerHTML = '<option value="">Papkasiz (alohida kitob)</option>';
  mangaPapkalarOqi().forEach(function (p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nom + ' (' + mangaPapkaMangalari(p.id).length + ' kitob)';
    sel.appendChild(opt);
  });
  sel.value = tanlangan;
}
function mangaPapkalarChiz() {
  var ps = mangaPapkalarOqi();
  var f = joriyFoydalanuvchi();
  var admin = f && f.rol === 'admin';
  $('mangaPapkaSoni').textContent = ps.length + ' ta papka';
  var panjara = $('mangaPapkaPanjara');
  panjara.innerHTML = '';
  if (!ps.length) {
    panjara.innerHTML = '<p class="eslatma">Hali papka yoq — admin kitob qoshishda yangi papka ochadi.</p>';
    return;
  }
  ps.forEach(function (p) {
    var kitoblar = mangaPapkaMangalari(p.id);
    var muqovaRasm = null;
    for (var i = 0; i < kitoblar.length; i++) {
      if (kitoblar[i].prevyu) { muqovaRasm = kitoblar[i].prevyu; break; }
    }
    var karta = document.createElement('article');
    karta.className = 'anime-karta';
    karta.innerHTML =
      (muqovaRasm
        ? '<div class="muqova rasmli"><img alt="Papka muqovasi"><span>' + kitoblar.length + ' kitob</span></div>'
        : '<div class="muqova muqova-' + (1 + (p.id % 6)) + '"><span>' + kitoblar.length + ' kitob</span></div>') +
      '<h3></h3><p class="meta"></p>' +
      '<div class="karta-tugmalar">' +
        '<button class="tugma tugma-asosiy kichik btn-ochish" type="button">Ochish</button>' +
        (admin ? '<button class="tugma tugma-xavf kichik btn-ochirish" type="button">Ochirish</button>' : '') +
      '</div>';
    karta.querySelector('h3').textContent = p.nom;
    karta.querySelector('.meta').textContent = kitoblar.length + ' kitob | ' + p.muallif;
    if (muqovaRasm) {
      var img = karta.querySelector('.muqova img');
      if (img) img.setAttribute('src', muqovaRasm);
    }
    karta.querySelector('.btn-ochish').onclick = function () { mangaPapkaOch(p.id); };
    if (admin) {
      karta.querySelector('.btn-ochirish').onclick = function () {
        if (confirm('"' + p.nom + '" papkasi ochirilsinmi? (ichidagi kitoblar alohida boladi)')) {
          var ms = oqi(MANGA_KEY, []);
          var mozgardi = [];
          ms.forEach(function (m) { if (m.mangaPapkaId === p.id) { delete m.mangaPapkaId; mozgardi.push(m); } });
          yoz(MANGA_KEY, ms);
          yoz(MANGA_PAPKA_KEY, mangaPapkalarOqi().filter(function (x) { return x.id !== p.id; }));
          if (typeof Cloud !== 'undefined' && Cloud.faol) {
            cloudMangaPapkaOchir(p.id);
            mozgardi.forEach(function (mm) { cloudMangaSaqla(mm); });
          }
          ochiqMangaPapkaId = null;
          $('mangaPapkaKorinish').style.display = 'none';
          mangaPapkalarChiz();
          mangaPapkaSelectYangila();
          mangaChiz();
        }
      };
    }
    panjara.appendChild(karta);
  });
}
function mangaPapkaOch(id) {
  var p = mangaPapkaTop(id);
  if (!p) return;
  ochiqMangaPapkaId = id;
  $('mangaPapkaNomi').textContent = p.nom;
  var royxat = $('mangaPapkaRoyxat');
  royxat.innerHTML = '';
  var kitoblar = mangaPapkaMangalari(id);
  if (!kitoblar.length) {
    royxat.innerHTML = '<p class="eslatma">Bu papkada hali kitob yoq.</p>';
  }
  kitoblar.forEach(function (m) {
    var qator = document.createElement('article');
    qator.className = 'jadval-qator qism-qator';
    qator.innerHTML =
      '<span class="vaqt">Kitob</span>' +
      '<div><b></b><span></span></div>' +
      '<button class="tugma tugma-asosiy kichik btn-oqi" type="button">Oqish</button>';
    qator.querySelector('b').textContent = m.sarlavha_ru;
    qator.querySelector('span').textContent = mangaJanr(m);
    qator.querySelector('.btn-oqi').onclick = function () { location.hash = '#/kitob/' + m.id; };
    royxat.appendChild(qator);
  });
  $('mangaPapkaKorinish').style.display = 'grid';
  $('mangaPapkaKorinish').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Chat: admin bilan suhbat
function chatChiz() {
  var f = joriyFoydalanuvchi();
  var xabarlar = (typeof Cloud !== 'undefined' && Cloud.faol && window._chatCloud) ? window._chatCloud : oqi(CHAT_KEY, []);
  var royxat = $('chatRoyxat');
  royxat.innerHTML = '';
  if (!xabarlar.length) {
    royxat.innerHTML = '<p class="eslatma">Hali xabar yoq — birinchilardan bolib yozing!</p>';
  }
  xabarlar.forEach(function (x) {
    var div = document.createElement('div');
    var meniki = f && x.kim === f.login;
    div.className = 'chat-xabar' + (meniki ? ' meniki' : '');
    var bosh = document.createElement('div');
    bosh.className = 'kim';
    var ism = document.createElement('b');
    ism.textContent = x.kim;
    bosh.appendChild(ism);
    if (x.rol === 'admin') {
      var belgi = document.createElement('span');
      belgi.className = 'rol rol-admin';
      belgi.textContent = 'ADMIN';
      bosh.appendChild(belgi);
    }
    if (f && (meniki || f.rol === 'admin')) {
      var del = document.createElement('button');
      del.className = 'ochirish';
      del.type = 'button';
      del.textContent = 'Ochirish';
      (function (xid) {
        del.onclick = function () {
          if (typeof Cloud !== 'undefined' && Cloud.faol) { cloudXabarOchir(xid); }
          else { yoz(CHAT_KEY, oqi(CHAT_KEY, []).filter(function (y) { return y.id !== xid; })); }
          chatChiz();
        };
      })(x.id);
      bosh.appendChild(del);
    }
    var matn = document.createElement('div');
    matn.className = 'matn';
    matn.textContent = x.matn;
    var vaqt = document.createElement('span');
    vaqt.className = 'vaqt';
    try { vaqt.textContent = new Date(x.vaqt).toLocaleString('uz-UZ'); }
    catch (e) { vaqt.textContent = ''; }
    div.appendChild(bosh);
    div.appendChild(matn);
    div.appendChild(vaqt);
    royxat.appendChild(div);
  });
  royxat.scrollTop = royxat.scrollHeight;
  $('chatForma').style.display = f ? 'grid' : 'none';
  $('chatMehmon').style.display = f ? 'none' : '';
}

function joriyFoydalanuvchi() {
  // Firebase orqali kirgan bolsa — bulut hisobi ustun
  try {
    if (typeof Cloud !== 'undefined' && Cloud.faol && Cloud.user) {
      var em = Cloud.user.email || Cloud.user.phoneNumber || 'foydalanuvchi';
      return { login: em, rol: cloudAdminmi() ? 'admin' : 'user', usul: 'firebase' };
    }
  } catch (e) {}
  var login = oqi(SESSION_KEY, null);
  if (!login) return null;
  var users = oqi(USERS_KEY, []);
  for (var i = 0; i < users.length; i++) {
    if (users[i].login === login) return users[i];
  }
  return null;
}

var $ = function (id) { return document.getElementById(id); };

function authKorinishi() {
  var f = joriyFoydalanuvchi();
  $('kirishBtn').style.display = f ? 'none' : '';
  $('foydalanuvchiBlok').style.display = f ? 'flex' : 'none';
  var admin = f && f.rol === 'admin';
  $('adminNav').style.display = admin ? '' : 'none';
  if (f) {
    $('foydalanuvchiNomi').textContent = f.login;
    $('rolBelgisi').textContent = f.rol === 'admin' ? 'ADMIN' : 'USER';
    $('rolBelgisi').className = 'rol ' + (f.rol === 'admin' ? 'rol-admin' : 'rol-user');
  }
  if (typeof marshrut === 'function') marshrut();
}

function muqovaHTML(v) {
  if (v.prevyu) {
    return '<div class="muqova rasmli"><img alt="Video prevyusi"><span>' + v.janr + '</span></div>';
  }
  return '<div class="muqova muqova-' + (v.muqova || 1) + '"><span>' + v.janr + '</span></div>';
}

// Bulut sinxron: yangi videolar + papkani Firestore ga yozish
function cloudSinxronVideo(videos, baza, n, yangiPapkaObj) {
  if (typeof Cloud === 'undefined' || !Cloud.faol) return;
  if (yangiPapkaObj) cloudPapkaSaqla(yangiPapkaObj);
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < videos.length; j++) {
      if (videos[j].id === baza + i) { cloudVideoSaqla(videos[j]); break; }
    }
  }
}

// Manga bulutga saqlash (fayllar Storage ga, meta Firestore ga — hammaga korinadi)
function mangaBulutSaqlash(o) {
  $('mangaXabar').textContent = 'Bulutga yuklanmoqda...';
  var sahifalar = [];
  var yuklashlar = [];
  for (var i = 0; i < o.fayllar.length; i++) {
    (function (fl, idx) {
      var ext = ((fl.name || '').match(/\.[a-z0-9]+$/i) || ['.jpg'])[0];
      yuklashlar.push(cloudFaylYukla('manga/' + o.id + '_' + idx + ext, fl, function () {
        $('mangaXabar').textContent = 'Bulutga yuklanmoqda... sahifa ' + (idx + 1) + '/' + o.fayllar.length;
      }).then(function (dl) { sahifalar[idx] = { url: dl }; }));
    })(o.fayllar[i], i);
  }
  o.urllar.forEach(function (u) { sahifalar.push({ url: u }); });
  var pdfIsh = Promise.resolve(null);
  if (o.pdfFayl) {
    pdfIsh = cloudFaylYukla('pdf/' + o.id + '.pdf', o.pdfFayl, function () {
      $('mangaXabar').textContent = 'Bulutga yuklanmoqda... PDF';
    }).then(function (dl) { return { url: dl }; });
  }
  var muqovaIsh;
  if (o.muqovaFayl) muqovaIsh = rasmniKichiklat(o.muqovaFayl).catch(function () { return null; });
  else if (o.fayllar.length) muqovaIsh = rasmniKichiklat(o.fayllar[0]).catch(function () { return null; });
  else muqovaIsh = Promise.resolve(o.urllar[0] || null);
  Promise.all(yuklashlar).then(function () { return pdfIsh; }).then(function (pdfObj) {
    return muqovaIsh.then(function (muqova) {
      if (muqova && muqova.indexOf('data:') === 0) {
        return cloudMatnYukla('prevyular/m' + o.id + '.jpg', muqova).catch(function () { return muqova; }).then(function (mu) {
          return { muqova: mu, pdfObj: pdfObj };
        });
      }
      return { muqova: muqova, pdfObj: pdfObj };
    });
  }).then(function (r) {
    var mangalar = oqi(MANGA_KEY, []);
    var meta = {
      id: o.id,
      sarlavha_ru: o.sar,
      janr: $('mJanr').value,
      tavsif_ru: $('mTavsif').value.trim(),
      muallif: $('mMuallif').value.trim() || o.f.login,
      muqova: 1 + (mangalar.length % 6),
      prevyu: r.muqova,
      sahifalar: sahifalar.filter(function (s) { return !!s; }),
      mangaPapkaId: o.mpapkaId
    };
    if (meta.mangaPapkaId === null || typeof meta.mangaPapkaId === 'undefined') delete meta.mangaPapkaId;
    if (r.pdfObj) meta.pdfFile = r.pdfObj;
    mangalar.unshift(meta);
    try { yoz(MANGA_KEY, mangalar); } catch (e) {}
    cloudMangaSaqla(meta);
    if (o.mpapkaId) { var mp = mangaPapkaTop(o.mpapkaId); if (mp) cloudMangaPapkaSaqla(mp); }
    $('mangaForma').reset();
    $('mangaXabar').textContent = 'Kitob bulutga qoshildi — endi hammaga korinadi';
    mangaChiz();
    mangaPapkalarChiz();
    mangaPapkaSelectYangila();
    if (o.mpapkaId) mangaPapkaOch(o.mpapkaId);
    tarjimaQil(o.sar);
    tarjimaQil(o.ultavsif);
  }).catch(function () {
    $('mangaXabar').textContent = 'Bulutga yuklashda xato. Config va internetni tekshiring.';
  });
}

// Baza holati ko'rsatkichi (admin panelda)
function dbHolatYangila() {
  var el = $('dbHolat');
  if (!el) return;
  if (typeof Cloud !== 'undefined' && Cloud.faol) {
    el.textContent = 'Bulut BAZA ulangan — yuklagan har bir narsangiz (video, rasm, PDF, chat) bazaga yoziladi va hammaga korinadi.';
  } else {
    el.textContent = 'Lokal rejim — yuklagan narsa faqat SHU qurilmada saqlanadi. Hammaga korinishi uchun FIREBASE-QOLLANMA.txt ni bajaring.';
  }
}

// Qism belgisi: papkada "1-fasl: 3-qism", alohida videoda "3-qism"
function qismBelgi(v) {
  if (v.papkaId || v.papka) return (v.fasl || 1) + '-fasl: ' + (v.qism || '?') + '-qism';
  if (v.qism) return v.qism + '-qism';
  return '';
}

function videolarniChiz(filter) {
  var videos = barchaVideolar();
  var f = joriyFoydalanuvchi();
  var admin = f && f.rol === 'admin';
  filter = (filter || '').toLowerCase();
  var natija = videos.filter(function (v) {
    return !filter || (v.sarlavha + ' ' + v.janr).toLowerCase().indexOf(filter) !== -1;
  });
  $('soniMatn').textContent = natija.length + ' ta video topildi';
  var panjara = $('panjara');
  panjara.innerHTML = '';
  if (!natija.length) {
    panjara.innerHTML = '<p class="eslatma">Hech narsa topilmadi.</p>';
    return;
  }
  natija.forEach(function (v) {
    var karta = document.createElement('article');
    karta.className = 'anime-karta';
    var buzilgan = v.buzilgan || (!v.url && !v.idb && !v.dataUrl);
    karta.innerHTML =
      muqovaHTML(v) +
      '<h3></h3><p class="meta"></p><p class="tavsif-qisqa"></p>' +
      (buzilgan ? '<p class="eslatma">Fayl topilmadi — admin qayta yuklasin.</p>' : '') +
      '<div class="karta-tugmalar">' +
        '<button class="tugma tugma-asosiy kichik btn-korish" type="button"' + (buzilgan ? ' disabled' : '') + '>Tomosha</button>' +
        ((admin && !v.turgun) ? '<button class="tugma tugma-xavf kichik btn-ochirish" type="button">Ochirish</button>' : '') +
      '</div>';
    karta.querySelector('h3').textContent = v.sarlavha;
    var papkaNomi = (v.papkaId && papkaTop(v.papkaId)) ? papkaTop(v.papkaId).nom : (v.papka || null);
    var qb = qismBelgi(v);
    karta.querySelector('.meta').textContent =
      (qb ? qb + ' | ' : '') + (papkaNomi ? papkaNomi + ' | ' : '') + v.janr + ' | ' + v.muallif + (v.idb ? ' | saqlangan' : '');
    karta.querySelector('.tavsif-qisqa').textContent = v.tavsif || '';
    if (v.prevyu) {
      var img = karta.querySelector('.muqova img');
      if (img) img.setAttribute('src', v.prevyu);
    }
    if (!buzilgan) {
      karta.querySelector('.btn-korish').onclick = function () { location.hash = '#/tomosha/' + v.id; };
    }
    if (admin && !v.turgun) {
      karta.querySelector('.btn-ochirish').onclick = function () {
        if (confirm('"' + v.sarlavha + '" ochirilsinmi?')) {
          yoz(VIDEOS_KEY, oqi(VIDEOS_KEY, []).filter(function (x) { return x.id !== v.id; }));
          if (urlKesh[v.id]) { URL.revokeObjectURL(urlKesh[v.id]); delete urlKesh[v.id]; }
          idbOchir(DB_DOKON, v.id); if (typeof Cloud !== 'undefined' && Cloud.faol) cloudVideoOchir(v.id);
          videolarniChiz($('qidiruvInput').value);
          papkalarChiz();
          if (ochiqPapkaId) papkaOch(ochiqPapkaId);
        }
      };
    }
    panjara.appendChild(karta);
  });
}

// Serial papkalari: 12 qism bitta papkada
function papkalarOqi() {
  return oqi(PAPKA_KEY, []);
}
function papkaTop(id) {
  if (typeof id === 'string' && id.indexOf('m_') === 0) {
    return { id: id, nom: id.slice(2), virtual: true, muallif: 'repo' };
  }
  var ps = papkalarOqi();
  for (var i = 0; i < ps.length; i++) { if (ps[i].id === id) return ps[i]; }
  return null;
}
function papkaQismlari(papkaId) {
  var pk = papkaTop(papkaId);
  var nom = pk ? pk.nom : '';
  var vs = barchaVideolar().filter(function (v) {
    return v.papkaId === papkaId || (nom && v.papka === nom);
  });
  vs.sort(function (a, b) { return ((a.fasl || 1) - (b.fasl || 1)) || ((a.qism || 9999) - (b.qism || 9999)) || (a.id - b.id); });
  return vs;
}
function papkaSelectYangila() {
  var sel = $('vPapka');
  if (!sel) return;
  var tanlangan = sel.value;
  sel.innerHTML = '<option value="">Papkasiz (alohida video)</option>';
  papkalarOqi().forEach(function (p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nom + ' (' + papkaQismlari(p.id).length + ' qism)';
    sel.appendChild(opt);
  });
  sel.value = tanlangan;
}
function papkalarChiz() {
  var ps = papkalarOqi();
  // GitHub dagi papkalar (videolar.json) — virtual, faqat oqiladi
  var borNom = {};
  ps.forEach(function (p) { borNom[p.nom] = true; });
  manifestVideo.forEach(function (v) {
    if (v.papka && !borNom[v.papka]) {
      borNom[v.papka] = true;
      ps.push({ id: 'm_' + v.papka, nom: v.papka, virtual: true, muallif: 'repo' });
    }
  });
  var f = joriyFoydalanuvchi();
  var admin = f && f.rol === 'admin';
  $('papkaSoni').textContent = ps.length + ' ta papka';
  var panjara = $('papkaPanjara');
  panjara.innerHTML = '';
  if (!ps.length) {
    panjara.innerHTML = '<p class="eslatma">Hali papka yoq — admin video qoshishda yangi papka ochadi.</p>';
    return;
  }
  ps.forEach(function (p) {
    var qismlar = papkaQismlari(p.id);
    var muqovaRasm = null;
    for (var i = qismlar.length - 1; i >= 0; i--) {
      if (qismlar[i].prevyu) { muqovaRasm = qismlar[i].prevyu; break; }
    }
    var rando = 1;
    for (var ri = 0; ri < p.nom.length; ri++) { rando += p.nom.charCodeAt(ri); }
    var karta = document.createElement('article');
    karta.className = 'anime-karta';
    karta.innerHTML =
      (muqovaRasm
        ? '<div class="muqova rasmli"><img alt="Papka muqovasi"><span>' + qismlar.length + ' qism</span></div>'
        : '<div class="muqova muqova-' + (1 + (rando % 6)) + '"><span>' + qismlar.length + ' qism</span></div>') +
      '<h3></h3><p class="meta"></p>' +
      '<div class="karta-tugmalar">' +
        '<button class="tugma tugma-asosiy kichik btn-ochish" type="button">Ochish</button>' +
        ((admin && !p.virtual) ? '<button class="tugma tugma-xavf kichik btn-ochirish" type="button">Ochirish</button>' : '') +
      '</div>';
    karta.querySelector('h3').textContent = p.nom;
    karta.querySelector('.meta').textContent = qismlar.length + ' qism | ' + p.muallif + (p.virtual ? ' | GitHub' : '');
    if (muqovaRasm) {
      var img = karta.querySelector('.muqova img');
      if (img) img.setAttribute('src', muqovaRasm);
    }
    karta.querySelector('.btn-ochish').onclick = function () { papkaOch(p.id); };
    if (admin && !p.virtual) {
      karta.querySelector('.btn-ochirish').onclick = function () {
        if (confirm('"' + p.nom + '" papkasi ochirilsinmi? (ichidagi qismlar alohida videoga aylanadi)')) {
          var vs = oqi(VIDEOS_KEY, []);
          var ozgarganlar = [];
          vs.forEach(function (v) { if (v.papkaId === p.id) { delete v.papkaId; ozgarganlar.push(v); } });
          yoz(VIDEOS_KEY, vs);
          yoz(PAPKA_KEY, papkalarOqi().filter(function (x) { return x.id !== p.id; }));
          if (typeof Cloud !== 'undefined' && Cloud.faol) {
            cloudPapkaOchir(p.id);
            ozgarganlar.forEach(function (v) { cloudVideoSaqla(v); });
          }
          ochiqPapkaId = null;
          $('papkaKorinish').style.display = 'none';
          papkalarChiz();
          papkaSelectYangila();
          videolarniChiz($('qidiruvInput').value);
        }
      };
    }
    panjara.appendChild(karta);
  });
}
function papkaOch(id) {
  var p = papkaTop(id);
  if (!p) return;
  ochiqPapkaId = id;
  var f = joriyFoydalanuvchi();
  var admin = f && f.rol === 'admin';
  $('papkaNomi').textContent = p.nom;
  $('papkaTavsifMatn').textContent = (p.tavsif || '') + ' | ' + papkaQismlari(id).length + ' qism';
  var royxat = $('qismRoyxat');
  royxat.innerHTML = '';
  var qismlar = papkaQismlari(id);
  if (!qismlar.length) {
    royxat.innerHTML = '<p class="eslatma">Bu papkada hali qism yoq.</p>';
  }
  qismlar.forEach(function (v) {
    var qator = document.createElement('article');
    qator.className = 'jadval-qator qism-qator';
    var buzilgan = v.buzilgan || (!v.url && !v.idb && !v.dataUrl);
    qator.innerHTML =
      '<span class="vaqt">' + (qismBelgi(v) || '-') + '</span>' +
      '<div><b></b><span></span></div>' +
      '<button class="tugma tugma-asosiy kichik btn-korish" type="button"' + (buzilgan ? ' disabled' : '') + '>Tomosha</button>' +
      ((admin && !v.turgun) ? '<button class="tugma tugma-xavf kichik btn-ochirish" type="button">Ochirish</button>' : '');
    qator.querySelector('b').textContent = v.sarlavha;
    qator.querySelector('span').textContent = v.janr + (buzilgan ? ' | fayl topilmadi' : '');
    if (!buzilgan) {
      qator.querySelector('.btn-korish').onclick = function () { location.hash = '#/tomosha/' + v.id; };
    }
    if (admin && !v.turgun) {
      qator.querySelector('.btn-ochirish').onclick = function () {
        if (confirm('"' + v.sarlavha + '" ochirilsinmi?')) {
          yoz(VIDEOS_KEY, oqi(VIDEOS_KEY, []).filter(function (x) { return x.id !== v.id; }));
          if (urlKesh[v.id]) { URL.revokeObjectURL(urlKesh[v.id]); delete urlKesh[v.id]; }
          idbOchir(DB_DOKON, v.id); if (typeof Cloud !== 'undefined' && Cloud.faol) cloudVideoOchir(v.id);
          papkalarChiz();
          papkaOch(id);
          papkaSelectYangila();
          videolarniChiz($('qidiruvInput').value);
        }
      };
    }
    royxat.appendChild(qator);
  });
  $('papkaKorinish').style.display = 'grid';
  $('papkaKorinish').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Player ostidagi QISM TANLASH paneli
var joriyPlayerId = null;
var tanlanganFasl = 1;

function qismPanelYangila() {
  var hozir = videoTop(joriyPlayerId);
  if (!hozir || (!hozir.papkaId && !hozir.papka)) return;
  var papkaKalit = hozir.papkaId || ('m_' + hozir.papka);
  var qismlar = papkaQismlari(papkaKalit);
  var qb = qismBelgi(hozir);
  var pk = papkaTop(papkaKalit);
  $('qismHozir').textContent = (pk ? pk.nom : '') + ': ' + qb;
  var fasllar = [];
  qismlar.forEach(function (v) {
    var fl = v.fasl || 1;
    if (fasllar.indexOf(fl) === -1) fasllar.push(fl);
  });
  fasllar.sort(function (a, b) { return a - b; });
  var fq = $('faslQator');
  fq.innerHTML = '';
  fasllar.forEach(function (fl) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'kun fasl-btn' + (fl === tanlanganFasl ? ' faol' : '');
    b.textContent = fl + '-fasl';
    b.onclick = function () { tanlanganFasl = fl; qismPanelYangila(); };
    fq.appendChild(b);
  });
  var soz = ($('qismQidiruv').value || '').toLowerCase();
  var grid = $('qismPanjarasi');
  grid.innerHTML = '';
  var topildi = 0;
  qismlar.forEach(function (v) {
    if ((v.fasl || 1) !== tanlanganFasl) return;
    var matn = ((v.qism || '') + ' ' + v.sarlavha).toLowerCase();
    if (soz && matn.indexOf(soz) === -1) return;
    topildi++;
    var tug = document.createElement('button');
    tug.type = 'button';
    tug.className = 'qism-btn' + (v.id === joriyPlayerId ? ' faol' : '');
    tug.innerHTML = '<span class="qplay">></span><span><small>' + (v.qism || '?') + '-qism</small><b>?</b></span>';
    tug.querySelector('b').textContent = v.qism || '?';
    tug.title = v.sarlavha;
    (function (vid) {
      tug.onclick = function () {
        try { history.replaceState(null, '', '#/tomosha/' + vid); } catch (e) {}
        playerOch(vid);
      };
    })(v.id);
    grid.appendChild(tug);
  });
  if (!topildi) {
    grid.innerHTML = '<p class="eslatma">Qism topilmadi.</p>';
  }
}

// YouTube havoladan ID ajratish (watch, youtu.be, shorts, embed, live)
function youtubeId(url) {
  if (!url) return null;
  var m = url.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
// Google Drive "file/d/ID" havolani to'g'ridan-to'g'ri ko'rinishga o'tkazish
function driveToDirect(url) {
  if (!url) return url;
  var m = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) return 'https://drive.google.com/uc?export=download&id=' + m[1];
  return url;
}

function playerOch(id) {
  var v = videoTop(id);
  if (!v) return;
  var qb = qismBelgi(v);
  $('playerSarlavha').textContent = v.sarlavha + (qb ? ' — ' + qb : '') + ' — ' + v.janr;
  $('playerTavsif').textContent = 'Yuklanmoqda...';
  qutilarniTop();
  if (playerQuti.parentNode === playerUy) { playerUy.style.display = 'flex'; }
  joriyPlayerId = id;
  if (v.papkaId || v.papka) {
    tanlanganFasl = v.fasl || 1;
    $('qismQidiruv').value = '';
    qismPanelYangila();
    $('qismPanel').style.display = 'grid';
  } else {
    $('qismPanel').style.display = 'none';
  }
  // Oldingi manbalarni tozalaymiz
  var video = $('playerVideo');
  video.pause();
  video.removeAttribute('src');
  video.load();
  $('playerYoutube').removeAttribute('src');
  $('playerVideo').style.display = '';
  $('playerYoutubeWrap').style.display = 'none';
  videoSrc(v).then(function (src) {
    if (!src) {
      $('playerTavsif').textContent = 'Video fayli topilmadi — admin qayta yuklasin.';
      return;
    }
    $('playerTavsif').textContent = v.tavsif || '';
    var yt = youtubeId(src);
    if (yt) {
      // YouTube — hamma qurilmada ko'rinadi
      video.style.display = 'none';
      $('playerYoutubeWrap').style.display = '';
      $('playerYoutube').src = 'https://www.youtube.com/embed/' + yt;
      return;
    }
    video.src = driveToDirect(src);
    if (v.prevyu) video.poster = v.prevyu;
    else video.removeAttribute('poster');
    video.play().catch(function () {});
  });
}
function playerYop() {
  var video = $('playerVideo');
  video.pause();
  video.removeAttribute('src');
  video.removeAttribute('poster');
  video.load();
  video.style.display = '';
  $('playerYoutube').removeAttribute('src');
  $('playerYoutubeWrap').style.display = 'none';
  $('playerModal').style.display = 'none';
}

function authOch() { $('authModal').style.display = 'flex'; $('authXabar').textContent = ''; }
function authYop() { $('authModal').style.display = 'none'; }
function tabAlmash(qaysi) {
  $('tabKirish').classList.toggle('faol', qaysi === 'kirish');
  $('tabRoyxat').classList.toggle('faol', qaysi === 'royxat');
  $('tabTelefon').classList.toggle('faol', qaysi === 'telefon');
  $('kirishForma').style.display = qaysi === 'kirish' ? '' : 'none';
  $('royxatForma').style.display = qaysi === 'royxat' ? '' : 'none';
  $('telefonForma').style.display = qaysi === 'telefon' ? '' : 'none';
  $('authXabar').textContent = '';
}

// Telefon SMS kodlari (demo: xotirada, 5 daqiqa amal qiladi)
var telKodlar = {};

function hisobgaKirish(login) {
  yoz(SESSION_KEY, login);
  authYop();
  authKorinishi();
  papkalarChiz();
  mangaPapkalarChiz();
  videolarniChiz($('qidiruvInput').value);
  mangaChiz();
  chatChiz();
}

function prevyuKorikYangila() {
  var url = $('vPrevyuUrl').value.trim();
  var fayl = $('vPrevyuFayl').files[0];
  var img = $('prevyuKorik');
  if (fayl) {
    img.src = URL.createObjectURL(fayl);
    img.style.display = 'block';
  } else if (url) {
    img.src = url;
    img.style.display = 'block';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
  }
}

// Marshrutlar: har bolim alohida sahifa
var playerQuti = null, playerUy = null, kitobQuti = null, kitobUy = null;

function qutilarniTop() {
  if (playerQuti) return;
  playerQuti = document.querySelector('#playerModal .modal');
  playerUy = document.getElementById('playerModal');
  kitobQuti = document.querySelector('#mangaModal .modal');
  kitobUy = document.getElementById('mangaModal');
}

function sahifaRejim() {
  qutilarniTop();
  try { $('playerVideo').pause(); } catch (e) {}
  try { $('playerYoutube').removeAttribute('src'); } catch (e) {}
  if (playerQuti.parentNode !== playerUy) {
    playerUy.appendChild(playerQuti);
    playerQuti.classList.remove('sahifa-quti');
  }
  if (kitobQuti.parentNode !== kitobUy) {
    kitobUy.appendChild(kitobQuti);
    kitobQuti.classList.remove('sahifa-quti');
  }
  playerUy.style.display = 'none';
  kitobUy.style.display = 'none';
}

function faollashtir(yol) {
  document.querySelectorAll('[data-yonalish]').forEach(function (a) {
    a.classList.toggle('faol', a.getAttribute('data-yonalish') === yol);
  });
}

function orqagaQayt() {
  try {
    if (history.length > 1) { history.back(); return; }
  } catch (e) {}
  location.hash = '#/';
}

function marshrut() {
  sahifaRejim();
  var h = location.hash || '#/';
  var f = joriyFoydalanuvchi();
  var admin = f && f.rol === 'admin';
  var mt = h.match(/^#\/tomosha\/(\d+)$/);
  var kt = h.match(/^#\/kitob\/(\d+)$/);
  var vs = document.querySelectorAll('main section.sahifa');
  $('tomoshaSahifa').style.display = 'none';
  $('kitobSahifa').style.display = 'none';
  if (mt) {
    vs.forEach(function (s) { s.style.display = 'none'; });
    $('tomoshaSahifa').style.display = '';
    document.getElementById('tomoshaSahifaIch').appendChild(playerQuti);
    playerQuti.classList.add('sahifa-quti');
    document.title = 'Tomosha — Akbar Family';
    faollashtir('videolar');
    playerOch(parseInt(mt[1], 10));
  } else if (kt) {
    vs.forEach(function (s) { s.style.display = 'none'; });
    $('kitobSahifa').style.display = '';
    document.getElementById('kitobSahifaIch').appendChild(kitobQuti);
    kitobQuti.classList.add('sahifa-quti');
    document.title = 'Kitob — Akbar Family';
    faollashtir('manga');
    mangaOch(parseInt(kt[1], 10));
  } else {
    var yol = (h.replace('#/', '') || 'bosh').split('?')[0];
    if (['bosh', 'seriallar', 'videolar', 'manga', 'studiya', 'jadval', 'haqida', 'chat'].indexOf(yol) === -1) yol = 'bosh';
    vs.forEach(function (s) {
      var r = (s.getAttribute('data-sahifa') || '').split(' ');
      var kor = r.indexOf(yol) !== -1;
      if (s.id === 'adminBolim') kor = kor && admin;
      s.style.display = kor ? '' : 'none';
    });
    $('mangaAdmin').style.display = admin ? '' : 'none';
    var nomlar = { bosh: 'Akbar Family', seriallar: 'Seriallar', videolar: 'Videolar', manga: 'Kitoblar', studiya: 'Studiya', jadval: 'Jadval', haqida: 'Biz haqimizda', chat: 'Chat' };
    document.title = nomlar[yol] + ' — Akbar Family';
    faollashtir(yol);
  }
  window.scrollTo(0, 0);
}

// Bulutga ulash + birinchi galda lokalni kochirish
function bulutUlash() {
  if (typeof cloudInit !== 'function') { dbHolatYangila(); return Promise.resolve(false); }
  return cloudInit().then(function (ok) {
    if (!ok) { dbHolatYangila(); return false; }
    var zaxira = {
      v: oqi(VIDEOS_KEY, []), p: oqi(PAPKA_KEY, []),
      m: oqi(MANGA_KEY, []), mp: oqi(MANGA_PAPKA_KEY, [])
    };
    return cloudToplamYukla().then(function (info) {
      if (info && info.bush && (zaxira.v.length || zaxira.p.length || zaxira.m.length || zaxira.mp.length)) {
        try {
          yoz(VIDEOS_KEY, zaxira.v); yoz(PAPKA_KEY, zaxira.p);
          yoz(MANGA_KEY, zaxira.m); yoz(MANGA_PAPKA_KEY, zaxira.mp);
        } catch (e) {}
        zaxira.p.forEach(function (x) { cloudPapkaSaqla(x); });
        zaxira.mp.forEach(function (x) { cloudMangaPapkaSaqla(x); });
        zaxira.v.forEach(function (x) { if (!x.idb && !x.buzilgan) cloudVideoSaqla(x); });
        zaxira.m.forEach(function (x) {
          var idbBor = ((x.sahifalar || []).some(function (s) { return s.idb; })) || (x.pdfFile && x.pdfFile.idb);
          if (!idbBor) cloudMangaSaqla(x);
        });
      }
      papkaSelectYangila();
      papkalarChiz();
      videolarniChiz($('qidiruvInput').value);
      mangaChiz();
      mangaPapkalarChiz();
      mangaPapkaSelectYangila();
      dbHolatYangila();
      marshrut();
      return true;
    });
  }).then(function (ok) {
    if (ok) cloudChatKuzat(function () { chatChiz(); });
    return ok;
  });
}

// Admin paneldagi bulut formasi
function bulutFormaInit() {
  if (!$('bulutSaqlash')) return;
  try {
    var saq = JSON.parse(localStorage.getItem('akbarFamily_firebase') || '{}');
    if (saq.apiKey) {
      $('cApiKey').value = saq.apiKey || '';
      $('cAuthDomain').value = saq.authDomain || '';
      $('cProjectId').value = saq.projectId || '';
      $('cStorageBucket').value = saq.storageBucket || '';
      $('cSenderId').value = saq.messagingSenderId || '';
      $('cAppId').value = saq.appId || '';
    }
    var adm = JSON.parse(localStorage.getItem('akbarFamily_admins') || '[]');
    if (adm.length) $('cAdminEmail').value = adm[0];
  } catch (e) {}
  $('bulutSaqlash').onclick = function () {
    var c = {
      apiKey: $('cApiKey').value.trim(),
      authDomain: $('cAuthDomain').value.trim(),
      projectId: $('cProjectId').value.trim(),
      storageBucket: $('cStorageBucket').value.trim(),
      messagingSenderId: $('cSenderId').value.trim(),
      appId: $('cAppId').value.trim()
    };
    var email = $('cAdminEmail').value.trim();
    if (!c.apiKey || !c.projectId || !c.appId) { $('bulutXabar').textContent = 'Kamida apiKey, projectId, appId ni toldiring.'; return; }
    try {
      localStorage.setItem('akbarFamily_firebase', JSON.stringify(c));
      if (email) localStorage.setItem('akbarFamily_admins', JSON.stringify([email]));
    } catch (e) { $('bulutXabar').textContent = 'Saqlab bolmadi.'; return; }
    $('bulutXabar').textContent = 'Saqlandi, qayta ulanmoqda...';
    location.reload();
  };
  $('bulutNusxa').onclick = function () {
    var c = cloudConfigOqi();
    var adm = [];
    try { adm = JSON.parse(localStorage.getItem('akbarFamily_admins') || '[]'); } catch (e) {}
    var matn = 'var firebaseConfig = {\n' +
      '  apiKey: "' + (c.apiKey || '') + '",\n' +
      '  authDomain: "' + (c.authDomain || '') + '",\n' +
      '  projectId: "' + (c.projectId || '') + '",\n' +
      '  storageBucket: "' + (c.storageBucket || '') + '",\n' +
      '  messagingSenderId: "' + (c.messagingSenderId || '') + '",\n' +
      '  appId: "' + (c.appId || '') + '"\n' +
      '};\nvar ADMIN_EMAILS = ' + JSON.stringify(adm.length ? adm : ['sizning@gmail.com']) + ';';
    function ok() { $('bulutXabar').textContent = 'Nusxalandi — GitHub da firebase-config.js ga qoyib Commit qiling, shunda hammada bulut ishlaydi.'; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(matn).then(ok).catch(function () { $('bulutXabar').textContent = 'Nusxalashda xato.'; }); }
      else {
        var t = document.createElement('textarea');
        t.value = matn;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
        ok();
      }
    } catch (e) { $('bulutXabar').textContent = 'Nusxalashda xato.'; }
  };
  $('bulutUzish').onclick = function () {
    try { localStorage.removeItem('akbarFamily_firebase'); } catch (e) {}
    location.reload();
  };
}

document.addEventListener('DOMContentLoaded', function () {
  seed();
  authKorinishi();
  videolarniChiz('');
  papkaSelectYangila();
  papkalarChiz();
  mangaChiz();
  mangaPapkalarChiz();
  // GitHub dagi umumiy fayllar (hamma kora oladi)
  manifestYukla().then(function () {
    videolarniChiz($('qidiruvInput').value);
    papkalarChiz();
    mangaChiz();
    mangaPapkalarChiz();
    marshrut();
  });
  $('papkaOrqaga').onclick = function () {
    ochiqPapkaId = null;
    $('papkaKorinish').style.display = 'none';
  };
  $('tomoshaOrqaga').onclick = orqagaQayt;
  $('kitobOrqaga').onclick = orqagaQayt;
  window.addEventListener('hashchange', marshrut);
  window.addEventListener('storage', function (e) {
    if (e.key === CHAT_KEY) chatChiz();
  });
  mangaChiz();
  mangaPapkaSelectYangila();
  mangaPapkalarChiz();
  $('mangaPapkaOrqaga').onclick = function () {
    ochiqMangaPapkaId = null;
    $('mangaPapkaKorinish').style.display = 'none';
  };
  $('mangaTilBtn').textContent = 'Til: Ozbekcha';
  chatChiz();
  dbHolatYangila();
  $('chatKirishBtn').onclick = authOch;
  // Bulut sozlangan bolsa — umumiy katalog va chatni yuklaymiz
  bulutUlash();
  bulutFormaInit();

  $('kirishBtn').onclick = authOch;
  $('authYopish').onclick = authYop;
  $('tabKirish').onclick = function () { tabAlmash('kirish'); };
  $('tabRoyxat').onclick = function () { tabAlmash('royxat'); };
  $('tabTelefon').onclick = function () { tabAlmash('telefon'); };
  $('profilHavola').onclick = function (e) { e.preventDefault(); authOch(); };
  $('mobilProfil').onclick = function (e) { e.preventDefault(); authOch(); };

  $('chiqishBtn').onclick = function () {
    localStorage.removeItem(SESSION_KEY);
    if (typeof cloudChiqish === 'function') cloudChiqish();
    authKorinishi();
    papkalarChiz();
    mangaPapkalarChiz();
    videolarniChiz($('qidiruvInput').value);
    mangaChiz();
    chatChiz();
  };

  $('kirishForma').onsubmit = function (e) {
    e.preventDefault();
    var login = $('kLogin').value.trim();
    var parol = $('kParol').value;
    var users = oqi(USERS_KEY, []);
    var top = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].login === login && users[i].parol === parol) top = users[i];
    }
    if (!top) { $('authXabar').textContent = 'Login yoki parol xato.'; return; }
    yoz(SESSION_KEY, top.login);
    authYop();
    authKorinishi();
    papkalarChiz();
    mangaPapkalarChiz();
    videolarniChiz($('qidiruvInput').value);
    mangaChiz();
    chatChiz();
  };

  $('royxatForma').onsubmit = function (e) {
    e.preventDefault();
    var login = $('rLogin').value.trim();
    var parol = $('rParol').value;
    var users = oqi(USERS_KEY, []);
    for (var i = 0; i < users.length; i++) {
      if (users[i].login === login) { $('authXabar').textContent = 'Bu login band.'; return; }
    }
    users.push({ login: login, parol: parol, rol: 'user' });
    yoz(USERS_KEY, users);
    hisobgaKirish(login);
  };

  // Google orqali kirish (bulut bolsa real, bolmasa demo)
  $('googleBtn').onclick = function () {
    if (typeof Cloud !== 'undefined' && Cloud.faol) {
      cloudGoogle().catch(function () { $('authXabar').textContent = 'Google kirishda xato (qalqib chiquvchi oynaga ruxsat bering).'; });
      return;
    }
    var m = $('googleMaydon');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  };
  $('googleDavom').onclick = function () {
    var email = $('gEmail').value.trim().toLowerCase();
    if (!email || email.indexOf('@') === -1) { $('authXabar').textContent = 'Togri Gmail yozing.'; return; }
    var users = oqi(USERS_KEY, []);
    var bor = false;
    for (var i = 0; i < users.length; i++) { if (users[i].login === email) bor = true; }
    if (!bor) {
      users.push({ login: email, parol: null, rol: 'user', usul: 'google' });
      yoz(USERS_KEY, users);
    }
    hisobgaKirish(email);
  };

  // Telefon orqali kirish (bulut bolsa real SMS, bolmasa demo)
  $('tKodYuborish').onclick = function () {
    var tel = $('tTel').value.replace(/[^+\d]/g, '');
    if (tel.length < 9) { $('authXabar').textContent = 'Togri telefon yozing.'; return; }
    if (tel[0] !== '+') tel = '+' + tel;
    if (typeof Cloud !== 'undefined' && Cloud.faol) {
      $('authXabar').textContent = 'SMS yuborilmoqda...';
      cloudSmsYubor(tel).then(function () {
        $('authXabar').textContent = '';
        var dk = $('demoKod');
        dk.style.display = '';
        dk.textContent = 'SMS telefoningizga yuborildi. Kodni kiriting.';
      }).catch(function () {
        $('authXabar').textContent = 'SMS yuborishda xato. Console da raqam formati va domain ruxsatini tekshiring.';
      });
      return;
    }
    var kod = '' + (100000 + Math.floor(Math.random() * 900000));
    telKodlar[tel] = { kod: kod, vaqt: Date.now() };
    var dk = $('demoKod');
    dk.style.display = '';
    dk.textContent = 'Demo SMS kod (' + tel + '): ' + kod;
    $('authXabar').textContent = '';
  };
  $('telefonForma').onsubmit = function (e) {
    e.preventDefault();
    var tel = $('tTel').value.replace(/[^+\d]/g, '');
    var kod = $('tKod').value.trim();
    if (typeof Cloud !== 'undefined' && Cloud.faol) {
      cloudSmsTasdiq(kod).then(function () {
        hisobgaKirish(Cloud.user && (Cloud.user.phoneNumber || tel));
      }).catch(function () { $('authXabar').textContent = 'Kod xato.'; });
      return;
    };
    var yozuv = telKodlar[tel];
    if (!yozuv) { $('authXabar').textContent = 'Avval kod yuboring.'; return; }
    if (Date.now() - yozuv.vaqt > 5 * 60 * 1000) { $('authXabar').textContent = 'Kod eskirgan, qayta yuboring.'; return; }
    if (kod !== yozuv.kod) { $('authXabar').textContent = 'Kod xato.'; return; }
    delete telKodlar[tel];
    var users = oqi(USERS_KEY, []);
    var bor = false;
    for (var i = 0; i < users.length; i++) { if (users[i].login === tel) bor = true; }
    if (!bor) {
      users.push({ login: tel, parol: null, rol: 'user', usul: 'telefon' });
      yoz(USERS_KEY, users);
    }
    hisobgaKirish(tel);
  };

  $('qidiruvInput').oninput = function (e) {
    if ((location.hash || '#/') !== '#/videolar') { location.hash = '#/videolar'; }
    videolarniChiz(e.target.value);
  };
  $('qismQidiruv').oninput = function () { qismPanelYangila(); };

  $('playerYopish').onclick = function () {
    if (playerQuti && playerQuti.parentNode !== playerUy) { orqagaQayt(); return; }
    playerYop();
  };
  $('playerModal').onclick = function (e) { if (e.target === this) playerYop(); };
  $('authModal').onclick = function (e) { if (e.target === this) authYop(); };

  $('mangaTilBtn').onclick = function () {
    mangaTili = (mangaTili === 'uz') ? 'ru' : 'uz';
    $('mangaTilBtn').textContent = mangaTili === 'uz' ? 'Til: Ozbekcha' : 'Til: Ruscha';
    mangaChiz();
    mangaMatniniKorish();
  };
  $('mangaYopish').onclick = function () {
    if (kitobQuti && kitobQuti.parentNode !== kitobUy) { orqagaQayt(); return; }
    mangaYop();
  };
  $('mangaModal').onclick = function (e) { if (e.target === this) mangaYop(); };
  $('mangaOld').onclick = function () { sahifaIndex--; sahifaniKorish(); };
  $('mangaKey').onclick = function () { sahifaIndex++; sahifaniKorish(); };

  // Chat: xabar yuborish
  $('chatForma').onsubmit = function (e) {
    e.preventDefault();
    var f = joriyFoydalanuvchi();
    if (!f) { authOch(); return; }
    var matn = $('chatMatn').value.trim();
    if (!matn) return;
    var yangi = { id: Date.now(), kim: f.login, rol: f.rol, matn: matn, vaqt: Date.now() };
    if (typeof Cloud !== 'undefined' && Cloud.faol) {
      cloudXabarYubor(yangi);
      $('chatMatn').value = '';
      return;
    }
    var xabarlar = oqi(CHAT_KEY, []);
    xabarlar.push({ id: Date.now(), kim: f.login, rol: f.rol, matn: matn, vaqt: Date.now() });
    if (xabarlar.length > 200) xabarlar = xabarlar.slice(xabarlar.length - 200);
    try { yoz(CHAT_KEY, xabarlar); } catch (err) {}
    $('chatMatn').value = '';
    chatChiz();
  };

  // Manga qoshish (faqat admin, rus tilida)
  $('mangaForma').onsubmit = function (e) {
    e.preventDefault();
    var f = joriyFoydalanuvchi();
    if (!f || f.rol !== 'admin') { $('mangaXabar').textContent = 'Faqat admin qosha oladi.'; return; }
    var sar = $('mSarlavha').value.trim();
    if (!sar) { $('mangaXabar').textContent = 'Название kiriting.'; return; }
    var fayllar = $('mFayllar').files;
    var pdfFayl = $('mPdf').files[0];
    var muqovaFayl = $('mMuqovaFayl').files[0];
    var urlMatn = $('mUrllar').value.trim();
    var urllar = urlMatn ? urlMatn.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; }) : [];
    if (!fayllar.length && !urllar.length && !pdfFayl) { $('mangaXabar').textContent = 'Sahifa rasmlari, URL yoki PDF kerak.'; return; }
    $('mangaXabar').textContent = 'Saqlanmoqda...';
    var ultavsif = $('mTavsif').value.trim();
    var id = Date.now();
    var sahifalar = [];
    var ishlar = [];
    for (var i = 0; i < fayllar.length; i++) {
      (function (fl, idx) {
        var kalit = id + '_' + idx;
        sahifalar.push({ idb: true, key: kalit });
        ishlar.push(idbQoy(MANGA_DOKON, kalit, fl));
      })(fayllar[i], i);
    }
    urllar.forEach(function (u) { sahifalar.push({ url: u }); });
    var pdfKalit = pdfFayl ? id + '_pdf' : null;
    if (pdfFayl) ishlar.push(idbQoy(MANGA_DOKON, pdfKalit, pdfFayl));
    // Manga papkasi: yangi nom yozilsa ochamiz, bolmasa tanlangani
    var yangiMp = $('mYangiMangaPapka').value.trim();
    var mpapkaId = null;
    if (yangiMp) {
      mpapkaId = Date.now() + 2;
      var mps = mangaPapkalarOqi();
      mps.unshift({ id: mpapkaId, nom: yangiMp, muallif: f.login });
      try { yoz(MANGA_PAPKA_KEY, mps); } catch (err) {}
    } else if ($('mMangaPapka').value) {
      mpapkaId = parseInt($('mMangaPapka').value, 10);
    }
    if (typeof Cloud !== 'undefined' && Cloud.faol) {
      mangaBulutSaqlash({ id: id, sar: sar, f: f, fayllar: fayllar, pdfFayl: pdfFayl, muqovaFayl: muqovaFayl, urllar: urllar, mpapkaId: mpapkaId, ultavsif: ultavsif });
      return;
    }
    var muqovaIshi;
    if (muqovaFayl) muqovaIshi = rasmniKichiklat(muqovaFayl).catch(function () { return null; });
    else if (fayllar.length) muqovaIshi = rasmniKichiklat(fayllar[0]).catch(function () { return null; });
    else muqovaIshi = Promise.resolve(urllar[0] || null);
    Promise.all(ishlar).then(function () {
      return muqovaIshi;
    }).then(function (muqova) {
      var mangalar = oqi(MANGA_KEY, []);
      mangalar.unshift({
        id: id,
        sarlavha_ru: sar,
        janr: $('mJanr').value,
        tavsif_ru: $('mTavsif').value.trim(),
        muallif: $('mMuallif').value.trim() || f.login,
        muqova: 1 + (mangalar.length % 6),
        prevyu: muqova,
        sahifalar: sahifalar,
        pdfFile: pdfKalit ? { idb: true, key: pdfKalit } : null,
        mangaPapkaId: mpapkaId
      });
      try { yoz(MANGA_KEY, mangalar); }
      catch (err) { $('mangaXabar').textContent = 'Saqlashda xato: ombor tolgan.'; return; }
      $('mangaForma').reset();
      $('mangaXabar').textContent = 'Kitob qoshildi — oquvchiga ozbekchasi chiqadi.';
      mangaChiz();
      mangaPapkalarChiz();
      mangaPapkaSelectYangila();
      if (mpapkaId) mangaPapkaOch(mpapkaId);
      tarjimaQil(sar);
      tarjimaQil(ultavsif);
    }).catch(function () {
      $('mangaXabar').textContent = 'Saqlab bolmadi. Kichikroq fayllar yoki URL ishlating.';
    });
  };

  var kunlar = document.querySelectorAll('#kunlar .kun');
  kunlar.forEach(function (b) {
    b.onclick = function () {
      kunlar.forEach(function (x) { x.classList.remove('faol'); });
      b.classList.add('faol');
    };
  });

  $('vPrevyuUrl').oninput = prevyuKorikYangila;
  $('vPrevyuFayl').onchange = prevyuKorikYangila;

  // Admin: video + prevyu qoshish (video IndexedDB ga — yangilaganda ochmaydi)
  $('videoForma').onsubmit = function (e) {
    e.preventDefault();
    var f = joriyFoydalanuvchi();
    if (!f || f.rol !== 'admin') { $('formaXabar').textContent = 'Faqat admin qosha oladi.'; return; }
    var sarlavha = $('vSarlavha').value.trim();
    var janr = $('vJanr').value;
    var tavsif = $('vTavsif').value.trim();
    var url = $('vUrl').value.trim();
    var fayllar = $('vFayl').files;
    var prevyuUrl = $('vPrevyuUrl').value.trim();
    var prevyuFayl = $('vPrevyuFayl').files[0];
    if (!sarlavha) { $('formaXabar').textContent = 'Sarlavha kiriting.'; return; }
    if (!url && !fayllar.length) { $('formaXabar').textContent = 'Video URL yoki fayl kerak.'; return; }
    $('formaXabar').textContent = 'Saqlanmoqda...';

    var prevyuPromise;
    if (prevyuFayl) prevyuPromise = rasmniKichiklat(prevyuFayl).catch(function () { return null; });
    else prevyuPromise = Promise.resolve(prevyuUrl || null);

    prevyuPromise.then(function (prevyu) {
      var yangiPapkaNomi = $('vYangiPapka').value.trim();
      var papkaId = null;
      var yangiPapkaObj = null;
      if (yangiPapkaNomi) {
        papkaId = Date.now();
        yangiPapkaObj = { id: papkaId, nom: yangiPapkaNomi, tavsif: $('vPapkaTavsif').value.trim(), muallif: f.login };
        var ps = papkalarOqi();
        ps.unshift(yangiPapkaObj);
        try { yoz(PAPKA_KEY, ps); } catch (err) {}
      } else if ($('vPapka').value) {
        papkaId = parseInt($('vPapka').value, 10);
      }
      var boshQism = parseInt($('vQism').value, 10);
      var faslRaqam = parseInt($('vFasl').value, 10);
      if (isNaN(faslRaqam)) faslRaqam = 1;
      if (isNaN(boshQism)) {
        boshQism = 1;
        if (papkaId) {
          papkaQismlari(papkaId).forEach(function (v) {
            if (v.qism && v.qism >= boshQism) boshQism = v.qism + 1;
          });
        }
      }
      var royxat = [];
      if (fayllar.length) {
        for (var i = 0; i < fayllar.length; i++) {
          royxat.push({ fayl: fayllar[i], qism: boshQism + i });
        }
      } else {
        var qismBitta = parseInt($('vQism').value, 10);
        royxat.push({ url: url, qism: isNaN(qismBitta) ? (papkaId ? boshQism : null) : qismBitta });
      }
      var videos = oqi(VIDEOS_KEY, []);
      var baza = Date.now();
      royxat.forEach(function (el, idx) {
        videos.unshift({
          id: baza + idx,
          sarlavha: royxat.length > 1 ? (sarlavha + ' ' + el.qism + '-qism') : sarlavha,
          janr: janr,
          tavsif: tavsif,
          url: el.url || null,
          idb: false,
          prevyu: prevyu,
          muqova: 1 + ((videos.length + idx) % 6),
          muallif: f.login,
          papkaId: papkaId,
          qism: el.qism,
          fasl: faslRaqam
        });
      });
      function yakunla(okCount) {
        if (typeof Cloud !== 'undefined' && Cloud.faol) cloudSinxronVideo(videos, baza, royxat.length, yangiPapkaObj);
        try { yoz(VIDEOS_KEY, videos); }
        catch (err) { $('formaXabar').textContent = 'Saqlashda xato: ombor tolgan. Eski videolarni ochiring.'; return; }
        $('videoForma').reset();
        prevyuKorikYangila();
        papkaSelectYangila();
        papkalarChiz();
        if (papkaId) papkaOch(papkaId);
        $('formaXabar').textContent = (typeof Cloud !== 'undefined' && Cloud.faol)
          ? okCount + ' ta qism bulutga saqlandi — endi hammaga korinadi ✓'
          : okCount + ' ta qism saqlandi — yangilasangiz ham ochmaydi.';
        videolarniChiz($('qidiruvInput').value);
      }
      var bulut = (typeof Cloud !== 'undefined' && Cloud.faol);
      if (!fayllar.length) {
        yakunla(1);
        return;
      }
      if (bulut) {
        // Bulut rejim: prevyu va fayllar Storage ga, meta Firestore ga
        var prevyuIsh = Promise.resolve(prevyu);
        if (prevyu && prevyu.indexOf('data:') === 0) {
          prevyuIsh = cloudMatnYukla('prevyular/' + baza + '.jpg', prevyu).catch(function () { return prevyu; });
        }
        prevyuIsh.then(function (purl) {
          videos.forEach(function (v) { if (v.id >= baza && v.id < baza + royxat.length) v.prevyu = purl; });
          var yuklandi = 0;
          var xato = false;
          royxat.forEach(function (el, idx) {
            var ext = ((el.fayl.name || '').match(/\.[a-z0-9]+$/i) || ['.mp4'])[0];
            cloudFaylYukla('videolar/' + (baza + idx) + ext, el.fayl, function (foiz) {
              $('formaXabar').textContent = 'Bulutga yuklanmoqda... ' + (idx + 1) + '/' + royxat.length + ' (' + foiz + '%)';
            }).then(function (dl) {
              videos.forEach(function (v) { if (v.id === baza + idx) { v.url = dl; v.idb = false; } });
              yuklandi++;
              if (yuklandi === royxat.length && !xato) yakunla(royxat.length);
            }).catch(function () {
              xato = true;
              $('formaXabar').textContent = 'Bulutga yuklashda xato. Config va internetni tekshiring.';
            });
          });
        });
        return;
      }
      var saqlangan = 0;
      var xatolik = false;
      royxat.forEach(function (el, idx) {
        idbQoy(DB_DOKON, baza + idx, el.fayl).then(function () {
          videos.forEach(function (v) { if (v.id === baza + idx) v.idb = true; });
          saqlangan++;
          $('formaXabar').textContent = 'Saqlanmoqda... ' + saqlangan + '/' + royxat.length;
          if (saqlangan === royxat.length && !xatolik) yakunla(royxat.length);
        }).catch(function () {
          xatolik = true;
          $('formaXabar').textContent = 'Videoni saqlab bolmadi (brauzer ruxsat bermadi). Kichikroq fayl yoki URL ishlating.';
        });
      });
    });
  };

  // Foto-studiya: rasm yuklash + yuzni oval kesish + avtomatik kostyum
  var stRasm = null;
  var stKostyum = '1';
  var stKostyumRasm = null;

  function stFonChiz(ctx, W, H, tur) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    if (tur === 'oltin') { g.addColorStop(0, '#3a2b12'); g.addColorStop(1, '#121315'); }
    else if (tur === 'yashil') { g.addColorStop(0, '#123324'); g.addColorStop(1, '#121315'); }
    else if (tur === 'pushti') { g.addColorStop(0, '#3d1f33'); g.addColorStop(1, '#121315'); }
    else { g.addColorStop(0, '#1d3a5f'); g.addColorStop(1, '#121315'); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (var i = 0; i < 30; i++) {
      var x = (i * 173) % W, y = (i * 97) % (H - 250);
      ctx.fillRect(x, y, 3, 3);
    }
  }

  function stMato(ctx, x, y, w, h, och, ortacha, toq) {
    var g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, toq);
    g.addColorStop(0.25, ortacha);
    g.addColorStop(0.5, och);
    g.addColorStop(0.75, ortacha);
    g.addColorStop(1, toq);
    ctx.fillStyle = g;
    return g;
  }

  function stTana(ctx, markaz, ranglar) {
    stMato(ctx, markaz - 150, 440, 300, 310, ranglar[0], ranglar[1], ranglar[2]);
    ctx.beginPath();
    ctx.moveTo(markaz - 150, 440);
    ctx.lineTo(markaz + 150, 440);
    ctx.lineTo(markaz + 120, 750);
    ctx.lineTo(markaz - 120, 750);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(markaz - 150, 440); ctx.lineTo(markaz - 100, 440);
    ctx.lineTo(markaz - 90, 750); ctx.lineTo(markaz - 120, 750);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(markaz + 150, 440); ctx.lineTo(markaz + 100, 440);
    ctx.lineTo(markaz + 90, 750); ctx.lineTo(markaz + 120, 750);
    ctx.closePath(); ctx.fill();
  }

  function stKoylakGalstuk(ctx, markaz, galstukRangi) {
    var g = ctx.createLinearGradient(markaz - 30, 0, markaz + 30, 0);
    g.addColorStop(0, '#cbd5e1'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(markaz - 30, 440); ctx.lineTo(markaz + 30, 440);
    ctx.lineTo(markaz, 560); ctx.closePath(); ctx.fill();
    ctx.fillStyle = galstukRangi;
    ctx.beginPath();
    ctx.moveTo(markaz - 13, 458); ctx.lineTo(markaz + 13, 458);
    ctx.lineTo(markaz + 7, 478); ctx.lineTo(markaz - 7, 478);
    ctx.closePath(); ctx.fill();
    var tg = ctx.createLinearGradient(markaz - 18, 0, markaz + 18, 0);
    tg.addColorStop(0, 'rgba(0,0,0,0.4)'); tg.addColorStop(0.5, galstukRangi); tg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(markaz - 7, 478); ctx.lineTo(markaz + 7, 478);
    ctx.lineTo(markaz + 18, 560); ctx.lineTo(markaz, 592);
    ctx.lineTo(markaz - 18, 560); ctx.closePath(); ctx.fill();
  }

  function stKostyumChiz(ctx, W, tur) {
    var markaz = W / 2;
    if (tur === 'maxsus' && stKostyumRasm) {
      var iw = stKostyumRasm.width, ih = stKostyumRasm.height;
      var maqsadW = 420, maqsadH = 340;
      var s = Math.max(maqsadW / iw, maqsadH / ih);
      var dw = iw * s, dh = ih * s;
      ctx.drawImage(stKostyumRasm, markaz - dw / 2, 750 - dh, dw, dh);
      return;
    }
    if (tur === '3') {
      var pl = ctx.createLinearGradient(0, 430, 0, 750);
      pl.addColorStop(0, '#7f1d1d'); pl.addColorStop(1, '#450a0a');
      ctx.fillStyle = pl;
      ctx.beginPath();
      ctx.moveTo(markaz - 150, 430);
      ctx.quadraticCurveTo(60, 600, 90, 750);
      ctx.lineTo(W - 90, 750);
      ctx.quadraticCurveTo(W - 60, 600, markaz + 150, 430);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 5;
      [200, 300, 400].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo(markaz - x + 100, 470);
        ctx.quadraticCurveTo(markaz - x + 80, 600, markaz - x + 110, 745);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(markaz + x - 100, 470);
        ctx.quadraticCurveTo(markaz + x - 80, 600, markaz + x - 110, 745);
        ctx.stroke();
      });
      stMato(ctx, markaz - 140, 440, 280, 310, '#60a5fa', '#2563eb', '#1e3a8a');
      ctx.beginPath();
      ctx.moveTo(markaz - 140, 440);
      ctx.lineTo(markaz + 140, 440);
      ctx.lineTo(markaz + 110, 750);
      ctx.lineTo(markaz - 110, 750);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 4;
      [-70, 70].forEach(function (dx) {
        ctx.beginPath();
        ctx.moveTo(markaz + dx, 470);
        ctx.quadraticCurveTo(markaz + dx * 1.2, 540, markaz + dx, 600);
        ctx.stroke();
      });
      var kg = ctx.createLinearGradient(0, 600, 0, 626);
      kg.addColorStop(0, '#fde047'); kg.addColorStop(1, '#a16207');
      ctx.fillStyle = kg;
      ctx.fillRect(markaz - 118, 600, 236, 26);
      var eg = ctx.createRadialGradient(markaz - 10, 500, 5, markaz, 510, 36);
      eg.addColorStop(0, '#fef08a'); eg.addColorStop(1, '#a16207');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(markaz, 510, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 40px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('A', markaz, 512);
    } else if (tur === '4') {
      var lib = ctx.createLinearGradient(markaz - 150, 0, markaz + 150, 0);
      lib.addColorStop(0, '#9d174d'); lib.addColorStop(0.3, '#ec4899');
      lib.addColorStop(0.5, '#fbcfe8'); lib.addColorStop(0.7, '#ec4899'); lib.addColorStop(1, '#9d174d');
      ctx.fillStyle = lib;
      ctx.beginPath();
      ctx.moveTo(markaz - 130, 440);
      ctx.lineTo(markaz + 130, 440);
      ctx.quadraticCurveTo(markaz + 170, 600, markaz + 150, 750);
      ctx.lineTo(markaz - 150, 750);
      ctx.quadraticCurveTo(markaz - 170, 600, markaz - 130, 440);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (var i = 0; i < 24; i++) {
        var nx = markaz - 130 + ((i * 53) % 260);
        var ny = 500 + ((i * 89) % 230);
        ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#f9a8d4';
      ctx.beginPath(); ctx.arc(markaz - 140, 470, 42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(markaz + 140, 470, 42, 0, Math.PI * 2); ctx.fill();
      for (var j = 0; j < 5; j++) {
        var mg = ctx.createRadialGradient(markaz - 34 + j * 16, 450, 1, markaz - 32 + j * 16, 452, 7);
        mg.addColorStop(0, '#ffffff'); mg.addColorStop(1, '#cbd5e1');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(markaz - 32 + j * 16, 452 + Math.abs(j - 2) * 4, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      var toj = ctx.createLinearGradient(0, 60, 0, 108);
      toj.addColorStop(0, '#fef08a'); toj.addColorStop(1, '#a16207');
      ctx.fillStyle = toj;
      ctx.beginPath();
      ctx.moveTo(markaz - 55, 108);
      ctx.lineTo(markaz - 55, 70);
      ctx.lineTo(markaz - 28, 95);
      ctx.lineTo(markaz, 60);
      ctx.lineTo(markaz + 28, 95);
      ctx.lineTo(markaz + 55, 70);
      ctx.lineTo(markaz + 55, 108);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      [[-40, 92], [0, 84], [40, 92]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(markaz + p[0], p[1], 5, 0, Math.PI * 2); ctx.fill();
      });
    } else if (tur === '6') {
      var chapanRang = ['#1e3a8a', '#2563eb', '#172554'];
      stMato(ctx, markaz - 150, 440, 300, 310, chapanRang[0], chapanRang[1], chapanRang[2]);
      ctx.beginPath();
      ctx.moveTo(markaz - 150, 440);
      ctx.lineTo(markaz + 150, 440);
      ctx.lineTo(markaz + 125, 750);
      ctx.lineTo(markaz - 125, 750);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(250,204,21,0.8)';
      ctx.lineWidth = 4;
      [-100, -50, 50, 100].forEach(function (dx) {
        ctx.beginPath();
        ctx.moveTo(markaz + dx, 445);
        ctx.lineTo(markaz + dx * 0.85, 750);
        ctx.stroke();
      });
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(markaz - 150, 440); ctx.lineTo(markaz - 35, 440);
      ctx.lineTo(markaz - 75, 570); ctx.lineTo(markaz - 120, 470);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(markaz + 150, 440); ctx.lineTo(markaz + 35, 440);
      ctx.lineTo(markaz + 75, 570); ctx.lineTo(markaz + 120, 470);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(markaz - 35, 440); ctx.lineTo(markaz - 75, 570);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(markaz + 35, 440); ctx.lineTo(markaz + 75, 570);
      ctx.stroke();
      var bg = ctx.createLinearGradient(0, 610, 0, 650);
      bg.addColorStop(0, '#b45309'); bg.addColorStop(0.5, '#f59e0b'); bg.addColorStop(1, '#78350f');
      ctx.fillStyle = bg;
      ctx.fillRect(markaz - 125, 610, 250, 40);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(markaz - 14, 610, 28, 40);
    } else {
      var forma = tur === '2';
      var smoking = tur === '5';
      var asosiy = forma ? ['#6b7a3f', '#4d5b2f', '#2f3a1c']
        : smoking ? ['#3f3f46', '#18181b', '#09090b']
        : ['#475569', '#1f2937', '#0b1220'];
      stTana(ctx, markaz, asosiy);
      var yoqa = ctx.createLinearGradient(markaz - 150, 0, markaz - 30, 0);
      if (smoking) { yoqa.addColorStop(0, '#71717a'); yoqa.addColorStop(1, '#27272a'); }
      else if (forma) { yoqa.addColorStop(0, '#55632e'); yoqa.addColorStop(1, '#2f3a1c'); }
      else { yoqa.addColorStop(0, '#334155'); yoqa.addColorStop(1, '#0b1220'); }
      ctx.fillStyle = yoqa;
      ctx.beginPath();
      ctx.moveTo(markaz - 150, 440); ctx.lineTo(markaz - 30, 440);
      ctx.lineTo(markaz - 70, 560); ctx.lineTo(markaz - 120, 470);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(markaz + 150, 440); ctx.lineTo(markaz + 30, 440);
      ctx.lineTo(markaz + 70, 560); ctx.lineTo(markaz + 120, 470);
      ctx.closePath(); ctx.fill();
      stKoylakGalstuk(ctx, markaz, forma ? '#1f2937' : '#b91c1c');
      if (smoking) {
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.moveTo(markaz - 26, 452); ctx.lineTo(markaz, 462); ctx.lineTo(markaz - 26, 472);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(markaz + 26, 452); ctx.lineTo(markaz, 462); ctx.lineTo(markaz + 26, 472);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(markaz, 462, 6, 0, Math.PI * 2); ctx.fill();
      }
      if (forma) {
        var pg = ctx.createLinearGradient(0, 432, 0, 450);
        pg.addColorStop(0, '#fde047'); pg.addColorStop(1, '#a16207');
        ctx.fillStyle = pg;
        ctx.fillRect(markaz - 150, 432, 70, 18);
        ctx.fillRect(markaz + 80, 432, 70, 18);
        var medalRang = ['#dc2626', '#2563eb', '#16a34a'];
        medalRang.forEach(function (r, k) {
          ctx.fillStyle = r;
          ctx.fillRect(markaz - 110 + k * 26, 490, 20, 28);
          ctx.fillStyle = '#facc15';
          ctx.beginPath(); ctx.arc(markaz - 100 + k * 26, 522, 7, 0, Math.PI * 2); ctx.fill();
        });
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeRect(markaz - 110, 600, 80, 50);
        ctx.strokeRect(markaz + 30, 600, 80, 50);
        [490, 540, 590, 640, 690].forEach(function (y) {
          var yg = ctx.createRadialGradient(markaz - 2, y - 2, 1, markaz, y, 7);
          yg.addColorStop(0, '#fef08a'); yg.addColorStop(1, '#92400e');
          ctx.fillStyle = yg;
          ctx.beginPath(); ctx.arc(markaz, y, 7, 0, Math.PI * 2); ctx.fill();
        });
      } else {
        [600, 650, 700].forEach(function (y) {
          var tug = ctx.createRadialGradient(markaz + 58, y - 2, 1, markaz + 60, y, 6);
          tug.addColorStop(0, '#f8fafc'); tug.addColorStop(1, '#64748b');
          ctx.fillStyle = tug;
          ctx.beginPath(); ctx.arc(markaz + 60, y, 6, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = smoking ? '#e4e4e7' : '#f8fafc';
        ctx.fillRect(markaz + 70, 500, 44, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(markaz + 70, 508, 44, 4);
      }
    }
  }

  function stBoshKiyimChiz(ctx, cx, cy, rx, ry, tur) {
    var markaz = cx;
    var tepasi = cy - ry;
    if (tur === '6') {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.ellipse(markaz, tepasi - 6, rx + 12, 34, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      for (var i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(markaz + i * ((rx + 6) / 4), tepasi - 14 - Math.abs(i) * 2, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(markaz, tepasi - 30, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function stChiz() {
    var cv = $('stCanvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    stFonChiz(ctx, W, H, $('stFon').value);
    stKostyumChiz(ctx, W, stKostyum);
    var rx = parseInt($('stKattalik').value, 10);
    var ry = Math.round(rx * 1.25);
    var cx = W / 2;
    var cy = parseInt($('stYuqori').value, 10) + ry;
    if (stRasm) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      var iw = stRasm.width, ih = stRasm.height;
      var s = Math.max((rx * 2) / iw, (ry * 2) / ih);
      var dw = iw * s, dh = ih * s;
      ctx.drawImage(stRasm, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      stBoshKiyimChiz(ctx, cx, cy, rx, ry, stKostyum);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Bola rasmini yuklang', W / 2, 200);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Akbar Family - Foto-studiya', W / 2, H - 18);
  }

  var stFayl = $('stFayl');
  if (stFayl) {
    stFayl.onchange = function () {
      var fl = stFayl.files[0];
      if (!fl) return;
      var img = new Image();
      img.onload = function () { stRasm = img; URL.revokeObjectURL(img.src); stChiz(); };
      img.src = URL.createObjectURL(fl);
    };
    document.querySelectorAll('.kostyum-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.kostyum-btn').forEach(function (x) { x.classList.remove('faol'); });
        b.classList.add('faol');
        stKostyum = b.getAttribute('data-kostyum');
        var kf = $('stKostyumFayl');
        if (kf) kf.value = '';
        stKostyumRasm = null;
        stChiz();
      };
    });
    var stKf = $('stKostyumFayl');
    if (stKf) {
      stKf.onchange = function () {
        var fl = stKf.files[0];
        if (!fl) return;
        var img = new Image();
        img.onload = function () {
          stKostyumRasm = img;
          URL.revokeObjectURL(img.src);
          stKostyum = 'maxsus';
          document.querySelectorAll('.kostyum-btn').forEach(function (x) { x.classList.remove('faol'); });
          stChiz();
        };
        img.src = URL.createObjectURL(fl);
      };
    }
    $('stKattalik').oninput = stChiz;
    $('stYuqori').oninput = stChiz;
    $('stFon').onchange = stChiz;
    $('stYuklabOlish').onclick = function () {
      var a = document.createElement('a');
      a.download = 'akbar-family-studiya.png';
      a.href = $('stCanvas').toDataURL('image/png');
      a.click();
    };
    stChiz();
  }
});
