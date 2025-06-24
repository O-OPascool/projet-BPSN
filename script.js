// script.js
// Gestion de stock de livres + catégories "salle" + scan de codes-barres + intégration Firebase

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getDatabase, ref, child, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

// — Variables globales pour édition manuelle —
let isEditing   = false;
let editingISBN = null;

// — Configuration Firebase —
const firebaseConfig = {
  apiKey: "AIzaSyDKE…",
  authDomain: "bpsn-74f1b.firebaseapp.com",
  databaseURL: "https://bpsn-74f1b-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bpsn-74f1b",
  storageBucket: "bpsn-74f1b.firebasestorage.app",
  messagingSenderId: "1057707303676",
  appId: "1:1057707303676:web:63dd292678dead41c2ed79",
  measurementId: "G-DZGXBJERKQ"
};

// Convertit un ISBN10 en ISBN13
function convertISBN10toISBN13(isbn10) {
  const core = isbn10.substring(0, 9);
  const isbn13WithoutCheck = "978" + core;
  let sum = 0;
  for (let i = 0; i < isbn13WithoutCheck.length; i++) {
    const d = parseInt(isbn13WithoutCheck[i], 10);
    sum += (i % 2 === 0 ? d : d * 3);
  }
  const check = sum % 10;
  const checkDigit = check === 0 ? 0 : 10 - check;
  return isbn13WithoutCheck + checkDigit;
}

document.addEventListener('DOMContentLoaded', () => {
  // —— Toggle clair/sombre ——  
  const modeToggleBtn = document.getElementById('mode-toggle');
  if (modeToggleBtn) {
    const updateIcon = () => {
      modeToggleBtn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
    };
    modeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateIcon();
    });
    updateIcon();
  }

  // —— Init Firebase ——  
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const stocksRef    = ref(db, 'stocks');
  const booksDataRef = ref(db, 'booksData');
  const roomsRef     = ref(db, 'rooms');

  // —— Gestion des salles ——  
  const newRoomInput     = document.getElementById('new-room');
  const addRoomBtn       = document.getElementById('add-room');
  const roomListEl       = document.getElementById('room-list');
  const manualRoomSelect = document.getElementById('manual-room');
  const roomSelect       = document.getElementById('room-select');

  onValue(roomsRef, snap => renderRooms(snap.val() || {}));
  function renderRooms(rooms) {
    roomListEl.innerHTML       = '';
    manualRoomSelect.innerHTML = '<option value="">Salle…</option>';
    roomSelect.innerHTML       = '<option value="">—</option>';
    Object.values(rooms).forEach(name => {
      // ligne + bouton suppr.
      const li = document.createElement('li');
      li.textContent = name + ' ';
      const del = document.createElement('button');
      del.textContent = '🗑️';
      del.onclick = () => set(child(roomsRef, encodeURIComponent(name)), null);
      li.appendChild(del);
      roomListEl.appendChild(li);
      // options selects
      [manualRoomSelect, roomSelect].forEach(sel => {
        const opt = document.createElement('option');
        opt.value = name; opt.text = name;
        sel.appendChild(opt);
      });
    });
  }

  addRoomBtn.addEventListener('click', async () => {
    const name = newRoomInput.value.trim();
    if (!name) return alert('Nom de salle requis');
    await set(child(roomsRef, encodeURIComponent(name)), name);
    newRoomInput.value = '';
  });

  // —— Utilitaires communs ——  
  const spinner = document.getElementById('spinner');
  const showSpinner = () => spinner.classList.remove('hidden');
  const hideSpinner = () => spinner.classList.add('hidden');

  const engineSelect = document.getElementById('search-engine');
  if (engineSelect) {
    const stored = localStorage.getItem('search-engine');
    if (stored) engineSelect.value = stored;
    engineSelect.addEventListener('change', () => {
      localStorage.setItem('search-engine', engineSelect.value);
    });
  }

  function sanitizeISBN(isbn) {
    return isbn.replace(/[-\s]/g, "");
  }
  function isValidISBN(isbn) {
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
  }
  function setCoverImage(img, isbn, fallback='https://via.placeholder.com/150x200?text=No+Cover') {
    img.src = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    img.onerror = () => { img.src = fallback; img.onerror = null; };
  }
  function parseVolumeInfo(v) {
    return {
      title:   v.title            || "Sans titre",
      author:  v.authors?.[0]     || "Auteur inconnu",
      summary: v.description       || "Aucune information",
      cover:   v.imageLinks?.thumbnail || null
    };
  }

  async function fetchBookDataFromAPIs(isbn) {
    try {
      const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`).then(r=>r.json());
      if (g.items?.length) return { googleBooksResults: g.items };
    } catch {}
    try {
      const o = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if (o.ok) {
        const d = await o.json();
        let author = "Auteur inconnu", summary = "Aucune information";
        if (typeof d.by_statement === 'string') author = d.by_statement;
        if (typeof d.description  === 'string') summary = d.description;
        else if (d.description?.value) summary = d.description.value;
        return { openLibraryResult: { title: d.title||"Sans titre", author, summary } };
      }
    } catch {}
    return null;
  }

  async function completeWithGoogleIfNeeded(isbn, baseData) {
    let { title, author, summary } = baseData;
    if (author==="Auteur inconnu" || summary.length < 50) {
      try {
        const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`).then(r=>r.json());
        const vi = g.items?.[0]?.volumeInfo || {};
        if (author==="Auteur inconnu" && vi.authors?.[0]) author = vi.authors[0];
        if (vi.description?.length > summary.length) summary = vi.description;
      } catch {}
    }
    return { title, author, summary };
  }

  // —— Liste & rendu ——  
  let allBooks = {}, allStocks = {};
  function updateTotalBooksCount() {
    const total = Object.values(allStocks).reduce((a,v) => a + (v||0), 0);
    document.getElementById('total-books-count').textContent = `Total des livres disponibles : ${total}`;
  }
  function renderBookList(filter='') {
    const list = document.getElementById('book-list');
    list.innerHTML = '';
    const f = filter.toLowerCase();
    for (const isbn in allBooks) {
      const b = allBooks[isbn], stock = allStocks[isbn]||0;
      if (f && !b.title.toLowerCase().includes(f) && !b.author.toLowerCase().includes(f)) continue;
      const item = document.createElement('div');
      item.className = 'book-item';
      item.innerHTML = `
        <img class="book-cover" src="${b.cover||''}" onerror="this.src='https://via.placeholder.com/80x120?text=No+Cover'">
        <div class="book-details">
          <div><strong>${b.title}</strong> <em>(${isbn})</em></div>
          <div>Auteur : ${b.author}</div>
          <div>Résumé : ${b.summary}</div>
          <div>Stock : ${stock}</div>
          <div>Salle : ${b.room||'—'}</div>
          <button onclick="deleteBook('${isbn}')">🗑️</button>
          <button onclick="editManualBook('${isbn}')">✏️</button>
        </div>`;
      list.appendChild(item);
    }
    updateTotalBooksCount();
  }
  window.deleteBook = isbn => {
    if (!confirm(`Supprimer ${isbn} ?`)) return;
    Promise.all([
      set(child(stocksRef,   isbn), null),
      set(child(booksDataRef,isbn),null)
    ]);
  };

  // —— Recherche par ISBN ——  
  const isbnForm       = document.getElementById('isbn-form');
  const bookInfo       = document.getElementById('book-info');
  const coverImgEl     = document.getElementById('cover');
  const titleEl        = document.getElementById('title');
  const authorEl       = document.getElementById('author');
  const summaryEl      = document.getElementById('summary');
  const stockEl        = document.getElementById('stock');
  const roomSelectMain = document.getElementById('room-select');
  const confirmBtn     = document.getElementById('confirm-add-book');
  const cancelBtn      = document.getElementById('cancel-add-book');
  const searchIn       = document.getElementById('search-book');
  const tabsDiv        = document.getElementById('search-results');
  const fillBtn        = document.getElementById('fill-info-button');
  const manualEditDiv  = document.getElementById('manual-edit');
  const editAuthor     = document.getElementById('manual-author');
  const editSummary    = document.getElementById('manual-summary');
  const saveEditBtn    = document.getElementById('save-manual-info');
  const cancelEditBtn  = document.getElementById('cancel-manual-info');

  let pending = null, currentISBN = null;
  function checkIfManualNeeded(a,s) {
    fillBtn.classList.toggle('hidden', !(a==="Auteur inconnu" || s==="Aucune information"));
  }

  // Edition API → manuel
  fillBtn.onclick = () => {
    manualEditDiv.classList.remove('hidden');
    editAuthor.value  = pending.author;
    editSummary.value = pending.summary;
  };
  saveEditBtn.onclick = () => {
    if (editAuthor.value)  pending.author  = editAuthor.value.trim();
    if (editSummary.value) pending.summary = editSummary.value.trim();
    authorEl.textContent  = pending.author;
    summaryEl.textContent = pending.summary;
    manualEditDiv.classList.add('hidden');
    checkIfManualNeeded(pending.author,pending.summary);
  };
  cancelEditBtn.onclick = () => manualEditDiv.classList.add('hidden');

  isbnForm.addEventListener('submit', async e => {
    e.preventDefault();
    showSpinner();
    let raw = sanitizeISBN(document.getElementById('isbn').value.trim());
    if (!isValidISBN(raw)) { alert('ISBN invalide'); hideSpinner(); return; }
    currentISBN = raw;

    let data = null, eng = engineSelect.value;
    if (eng==='google') data = await fetchBookDataFromAPIs(raw);
    else if (eng==='openlibrary') {
      data = await fetchBookDataFromAPIs(raw);
      if (data?.openLibraryResult) data.openLibraryResult = await completeWithGoogleIfNeeded(raw,data.openLibraryResult);
    } else {
      data = await fetchBookDataFromAPIs(raw);
      if (!data && raw.length===10) {
        const i13 = convertISBN10toISBN13(raw);
        data = await fetchBookDataFromAPIs(i13);
        if (data) currentISBN = i13;
      }
    }

    bookInfo.classList.add('hidden');
    tabsDiv.innerHTML = ''; tabsDiv.classList.add('hidden');

    if (data?.googleBooksResults?.length > 1) {
      tabsDiv.classList.remove('hidden');
      data.googleBooksResults.forEach((it,i) => {
        const v = parseVolumeInfo(it.volumeInfo||{});
        const btn = document.createElement('button');
        btn.className = 'tab';
        btn.textContent = `${v.title}`;
        btn.onclick = () => showBook(v.title,v.author,v.summary,v.cover);
        if (i===0) { btn.classList.add('active'); showBook(v.title,v.author,v.summary,v.cover); }
        tabsDiv.appendChild(btn);
      });
    } else if (data?.googleBooksResults) {
      const v = parseVolumeInfo(data.googleBooksResults[0].volumeInfo||{});
      showBook(v.title,v.author,v.summary,v.cover);
    } else if (data?.openLibraryResult) {
      const { title,author,summary } = data.openLibraryResult;
      showBook(title,author,summary,null);
    } else {
      showBook("Nouveau livre","Auteur inconnu","—",null);
    }
    hideSpinner();
  });

  function showBook(t,a,s,cover) {
    pending = { title:t,author:a,summary:s,cover,room:'' };
    bookInfo.classList.remove('hidden');
    coverImgEl.src = cover||'https://via.placeholder.com/100x150?text=No+Cover';
    titleEl.textContent   = t;
    authorEl.textContent  = a;
    summaryEl.textContent = s;
    roomSelectMain.value = '';
    checkIfManualNeeded(a,s);

    get(child(stocksRef,currentISBN)).then(snap=> {
      stockEl.textContent = snap.exists() ? snap.val() : '0';
    });
    get(child(booksDataRef,currentISBN)).then(snap=> {
      if (snap.exists()) {
        confirmBtn.style.display = 'none';
        cancelBtn .style.display = 'none';
      } else {
        confirmBtn.style.display = '';
        cancelBtn .style.display = '';
      }
    });
  }

  confirmBtn.onclick = async () => {
    const room = roomSelectMain.value;
    await Promise.all([
      set(child(booksDataRef,currentISBN), {...pending,room}),
      set(child(stocksRef,currentISBN), 0)
    ]);
    alert("Livre ajouté !");
    isbnForm.dispatchEvent(new Event('submit'));
  };
  cancelBtn.onclick = () => bookInfo.classList.add('hidden');


  // —— Formulaire manuel ——  
  const manualToggleBtn = document.getElementById('manual-add-toggle');
  const manualForm      = document.getElementById('manual-add-form');
  manualToggleBtn.onclick = () => manualForm.classList.toggle('hidden');

  manualForm.onsubmit = async e => {
    e.preventDefault();
    const t  = document.getElementById('manual-title').value.trim();
    const a  = document.getElementById('manual-author-full').value.trim();
    const s  = document.getElementById('manual-summary-full').value.trim();
    const i  = sanitizeISBN(document.getElementById('manual-isbn').value.trim());
    const c  = document.getElementById('manual-cover-url').value.trim();
    const r  = document.getElementById('manual-room').value;
    const sv = parseInt(document.getElementById('manual-stock').value,10)||0;
    if (!t||!a||!s||!i||!isValidISBN(i)) return alert("Champs obligatoires");
    if (sv<0) return alert("Stock négatif");

    if (!isEditing) {
      if ((await get(child(booksDataRef,i))).exists()) return alert("ISBN déjà existant");
    }
    const key = isEditing ? editingISBN : i;
    await Promise.all([
      set(child(booksDataRef,key), {title:t,author:a,summary:s,cover:(c.startsWith('http')||c.startsWith('data:')?c:''),room:r}),
      set(child(stocksRef,key), sv)
    ]);
    alert(isEditing ? "Modifié !" : "Ajouté !");
    isEditing = false;
    editingISBN = null;
    document.getElementById('manual-isbn').removeAttribute('readonly');
    manualForm.reset();
    manualForm.classList.add('hidden');
  };

  window.editManualBook = async isbn => {
    const [bs, ss] = await Promise.all([
      get(child(booksDataRef,isbn)),
      get(child(stocksRef,isbn))
    ]);
    if (!bs.exists()) return alert("Non trouvé");
    const d  = bs.val(), sv = ss.exists()?ss.val():0;
    document.getElementById('manual-title').value        = d.title;
    document.getElementById('manual-author-full').value  = d.author;
    document.getElementById('manual-summary-full').value = d.summary;
    document.getElementById('manual-isbn').value         = isbn;
    document.getElementById('manual-cover-url').value    = d.cover||"";
    document.getElementById('manual-room').value         = d.room||"";
    document.getElementById('manual-stock').value        = sv;
    isEditing   = true;
    editingISBN = isbn;
    document.getElementById('manual-isbn').setAttribute('readonly','');
    manualForm.classList.remove('hidden');
  };

  // —— Écoute temps réel Firebase pour la liste ——  
  onValue(booksDataRef, snapB => {
    allBooks = snapB.val()||{};
    onValue(stocksRef, snapS => {
      allStocks = snapS.val()||{};
      renderBookList(searchIn.value);
    });
  });

  // —— Scanner QuaggaJS ——  
  const scannerContainer   = document.getElementById('scanner-container');
  const scannerTarget      = document.getElementById('scanner-video');
  const stopScanBtn        = document.getElementById('stop-scan');
  const scanSearchToggle   = document.getElementById('scan-search-toggle');
  const scanManualToggle   = document.getElementById('scan-manual-toggle');
  scannerContainer.classList.add('hidden');

  function startScanner(callback) {
    scannerContainer.classList.remove('hidden');
    Quagga.init({
      inputStream: {
        name: "Live", type: "LiveStream",
        target: scannerTarget,
        constraints: { facingMode: "environment" }
      },
      decoder: { readers: ["ean_reader","ean_13_reader"] }
    }, err => {
      if (err) { alert("Erreur caméra"); scannerContainer.classList.add('hidden'); return; }
      Quagga.start();
      Quagga.onDetected(({codeResult}) => {
        const code = codeResult.code;
        if (/^\d{10,13}$/.test(code)) {
          Quagga.stop();
          scannerContainer.classList.add('hidden');
          callback(code);
        }
      });
    });
  }
  function stopScanner() {
    Quagga.stop();
    scannerContainer.classList.add('hidden');
  }

  scanSearchToggle.onclick = () => startScanner(code => {
    document.getElementById('isbn').value = code;
    isbnForm.dispatchEvent(new Event('submit'));
  });
  scanManualToggle.onclick = () => startScanner(code => {
    const mi = document.getElementById('manual-isbn');
    mi.value = code; mi.focus();
  });
  stopScanBtn.onclick = stopScanner;
});
