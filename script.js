// script.js
// Combinaison Google Books / Open Library, édition manuelle, scan de codes-barres et gestion optimisée des couvertures

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getDatabase, ref, child, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

// ————————————————————————————————————————————
// Variables globales pour le mode édition manuel
let isEditing   = false;
let editingISBN = null;
// ————————————————————————————————————————————

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

function convertISBN10toISBN13(isbn10) {
  let core = isbn10.substring(0, 9);
  let isbn13WithoutCheck = "978"  core;
  let sum = 0;
  for (let i = 0; i < isbn13WithoutCheck.length; i) {
    let digit = parseInt(isbn13WithoutCheck[i]);
    sum = (i % 2 === 0 ? digit : digit * 3);
  }
  let remainder = sum % 10;
  let checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return isbn13WithoutCheck  checkDigit;
}

document.addEventListener('DOMContentLoaded', () => {
  // --------- Gestion du mode sombre / clair ---------
  const modeToggleBtn = document.getElementById('mode-toggle');
  if (modeToggleBtn) {
    function updateToggleIcon() {
      modeToggleBtn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
    }
    modeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateToggleIcon();
    });
    updateToggleIcon();
  }
  // -------------------------------------------------

  const app      = initializeApp(firebaseConfig);
  const database = getDatabase(app);

  const stocksRef    = ref(database, 'stocks');
  const booksDataRef = ref(database, 'booksData');

 // ----- GESTION DES SALLES -----
 const roomsRef         = ref(database, 'rooms');
 const newRoomInput     = document.getElementById('new-room');
 const addRoomBtn       = document.getElementById('add-room');
 const roomListEl       = document.getElementById('room-list');
 const manualRoomSelect = document.getElementById('manual-room');
 const roomSelect       = document.getElementById('room-select');

 // Écoute et rendu des salles
 onValue(roomsRef, snap => {
   const rooms = snap.val() || {};
   renderRooms(rooms);
 });

 function renderRooms(rooms) {
   roomListEl.innerHTML       = '';
   manualRoomSelect.innerHTML = '<option value="">Salle…</option>';
   roomSelect.innerHTML       = '<option value="">—</option>';
   Object.values(rooms).forEach(name => {
     // liste  suppression
     const li = document.createElement('li');
     li.textContent = name  ' ';
     const del = document.createElement('button');
     del.textContent = '🗑️';
     del.onclick = () => set(child(roomsRef, name), null);
     li.appendChild(del);
     roomListEl.appendChild(li);
     // options select
     [manualRoomSelect, roomSelect].forEach(sel => {
       const opt = document.createElement('option'); opt.value = name; opt.text = name;
       sel.appendChild(opt);
     });
   });
 }

 // ajout salle
 addRoomBtn.addEventListener('click', async () => {
   const name = newRoomInput.value.trim();
   if (!name) return alert('Nom de salle requis');
   await set(ref(database, 'rooms/'  encodeURIComponent(name)), name);
   newRoomInput.value = '';
 });
 // ----- FIN GESTION DES SALLES -----


  const spinner = document.getElementById('spinner');
  function showSpinner() { spinner.classList.remove('hidden'); }
  function hideSpinner() { spinner.classList.add('hidden'); }

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

  function setCoverImage(img, isbn, fallback='https://via.placeholder.com/150x200?text=NoCover') {
    img.src = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    img.onerror = () => {
      if (fallback) {
        img.src = fallback;
        img.onerror = () => { img.style.display = 'none'; };
      } else {
        img.style.display = 'none';
      }
    };
  }

  function parseVolumeInfo(volumeInfo) {
    const title   = volumeInfo.title || "Sans titre";
    const author  = (volumeInfo.authors?.length > 0) ? volumeInfo.authors[0] : "Auteur inconnu";
    const summary = volumeInfo.description || "Aucune information";
    const cover   = volumeInfo.imageLinks?.thumbnail || null;
    return { title, author, summary, cover };
  }

  async function fetchBookDataFromAPIs(isbn) {
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const data = await res.json();
      if (data.items?.length) return { googleBooksResults: data.items };
    } catch (e) { console.warn("Erreur Google Books:", e); }
    try {
      const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if (res.ok) {
        const d = await res.json();
        let author = "Auteur inconnu", summary = "Aucune information";
        if (typeof d.by_statement === 'string') author = d.by_statement;
        if (typeof d.description   === 'string') summary = d.description;
        else if (d.description?.value) summary = d.description.value;
        return { openLibraryResult: { title: d.title || "Sans titre", author, summary } };
      }
    } catch (e) { console.warn("Erreur Open Library:", e); }
    return null;
  }

  async function completeWithGoogleIfNeeded(isbn, baseData) {
    let { title, author, summary } = baseData;
    const MIN = 50;
    if (author === "Auteur inconnu" || summary.length < MIN) {
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const d   = await res.json();
        if (d.items?.length) {
          const vi = d.items[0].volumeInfo || {};
          if (author === "Auteur inconnu" && vi.authors?.[0]) author = vi.authors[0];
          if (vi.description?.length > summary.length) summary = vi.description;
        }
      } catch {}
    }
    return { title, author, summary };
  }

  let globalBooksData = {}, globalStocksData = {};

  function updateTotalBooksCount(){
    const total = Object.values(globalStocksData).reduce((a,v)=>a(v||0),0);
    document.getElementById('total-books-count').textContent = `Total des livres disponibles : ${total}`;
  }

  function renderBookList(filter='') {
    const list = document.getElementById('book-list');
    if (!list) return;
    list.innerHTML = '';
    const f = filter.toLowerCase();
    for (const isbn in globalBooksData) {
      const b = globalBooksData[isbn];
      const title   = b.title   || "Sans titre";
      const author  = b.author  || "Auteur inconnu";
      const summary = b.summary || "Aucune information";
      const stock   = globalStocksData[isbn] || 0;
      if (f && !title.toLowerCase().includes(f) && !author.toLowerCase().includes(f)) continue;

      const item = document.createElement('div');
      item.className = 'book-item';

      const img = document.createElement('img');
      img.className = 'book-cover';
      img.loading   = 'lazy';
      if (b.cover) {
        img.src = b.cover;
        img.onerror = () => setCoverImage(img, isbn, '');
      } else {
        setCoverImage(img, isbn, '');
      }
      item.appendChild(img);

      const det = document.createElement('div');
      det.className = 'book-details';
      det.innerHTML = `
        <div class="book-title"><strong>Titre : ${title}</strong></div>
        <div class="book-identifier">ISBN : <strong>${isbn}</strong></div>
        <div class="book-summary">Résumé : ${summary}</div>
        <div class="stock-info">${stock>0?`En stock : ${stock} exemplaires`:'Hors stock'}</div>
        <span class="book-author">Auteur : ${author}</span>
        <button class="delete-button" onclick="deleteBook('${isbn}')">Supprimer</button>
        <button class="edit-button"   onclick="editManualBook('${isbn}')">Modifier</button>
      `;
      item.appendChild(det);
      list.appendChild(item);
    }
    updateTotalBooksCount();
  }

  window.deleteBook = isbn => {
    if (confirm(`Confirme la suppression du livre ${isbn} ?`)) {
      Promise.all([
        set(child(stocksRef, isbn), null),
        set(child(booksDataRef, isbn), null)
      ]).then(() => {
        alert("Livre supprimé.");
        updateTotalBooksCount();
      }).catch(console.error);
    }
  };

  // Récupération des éléments du DOM
  const isbnForm       = document.getElementById('isbn-form');
  const bookInfo       = document.getElementById('book-info');
  const coverImgEl     = document.getElementById('cover');
  const titleEl        = document.getElementById('title');
  const authorEl       = document.getElementById('author');
  const summaryEl      = document.getElementById('summary');
  const stockEl        = document.getElementById('stock');
  const confirmBtn     = document.getElementById('confirm-add-book');
  const cancelBtn      = document.getElementById('cancel-add-book');
  const stockForm      = document.getElementById('stock-form');
  const searchIn       = document.getElementById('search-book');
  const tabsDiv        = document.getElementById('search-results');
  const fillBtn        = document.getElementById('fill-info-button');
  const editDiv        = document.getElementById('manual-edit');
  const editAuthor     = document.getElementById('manual-author');
  const editSum        = document.getElementById('manual-summary');
  const saveEdit       = document.getElementById('save-manual-info');
  const cancelEdit     = document.getElementById('cancel-manual-info');

  let bookPending = null, currentISBN = null;
  function checkIfManualNeeded(a, s) {
    if (a==="Auteur inconnu" || s==="Aucune information") fillBtn.classList.remove('hidden');
    else fillBtn.classList.add('hidden');
  }

  // Edition manuelle d'un résultat API
  fillBtn.addEventListener('click', () => {
    editDiv.classList.remove('hidden');
    editAuthor.value = bookPending.author;
    editSum.value    = bookPending.summary;
  });
  saveEdit.addEventListener('click', () => {
    const na = editAuthor.value.trim();
    const ns = editSum.value.trim();
    if (na) bookPending.author  = na;
    if (ns) bookPending.summary = ns;
    authorEl.textContent  = bookPending.author;
    summaryEl.textContent = bookPending.summary;
    editDiv.classList.add('hidden');
    checkIfManualNeeded(bookPending.author, bookPending.summary);
  });
  cancelEdit.addEventListener('click', () => editDiv.classList.add('hidden'));

  // Soumission du formulaire ISBN
  isbnForm.addEventListener('submit', async e => {
    e.preventDefault();
    showSpinner();
    const raw = sanitizeISBN(document.getElementById('isbn').value.trim());
    if (!isValidISBN(raw)) {
      alert('ISBN invalide');
      hideSpinner();
      return;
    }
    currentISBN = raw;

    // Récupération des données
    let data = null;
    const eng = engineSelect.value;
    if (eng === 'google') {
      data = await fetchBookDataFromAPIs(raw);
    } else if (eng === 'openlibrary') {
      data = await fetchBookDataFromAPIs(raw);
      if (data?.openLibraryResult) {
        data.openLibraryResult = await completeWithGoogleIfNeeded(raw, data.openLibraryResult);
      }
    } else {
      data = await fetchBookDataFromAPIs(raw);
      if (!data && raw.length === 10) {
        const i13 = convertISBN10toISBN13(raw);
        data = await fetchBookDataFromAPIs(i13);
        if (data) currentISBN = i13;
      }
    }

    // Masquage des anciens résultats
    bookInfo.classList.add('hidden');
    tabsDiv .classList.add('hidden');
    tabsDiv .innerHTML = '';

    // Affichage selon résultats
    if (data?.googleBooksResults) {
      const arr = data.googleBooksResults;
      if (arr.length > 1) {
        tabsDiv.classList.remove('hidden');
        arr.forEach((item, i) => {
          const vi = item.volumeInfo || {};
          const { title, author, summary, cover } = parseVolumeInfo(vi);
          const btn = document.createElement('button');
          btn.className = 'tab';
          btn.textContent = `${title} – ${author}`;
          btn.onclick = () => showBookInfos(title, author, summary, cover);
          if (i === 0) {
            btn.classList.add('active');
            showBookInfos(title, author, summary, cover);
          }
          tabsDiv.appendChild(btn);
        });
        hideSpinner();
        return;
      } else {
        const { title, author, summary, cover } = parseVolumeInfo(arr[0].volumeInfo || {});
        showBookInfos(title, author, summary, cover);
      }
    } else if (data?.openLibraryResult) {
      const { title, author, summary } = data.openLibraryResult;
      showBookInfos(title, author, summary, null);
    } else {
      showBookInfos("Nouveau livre", "Auteur inconnu", "Aucune information", null);
    }

    hideSpinner();
  });

  function showBookInfos(t, a, s, cover) {
    bookPending = { title: t, author: a, summary: s, cover };
    bookInfo.classList.remove('hidden');
    if (cover) coverImgEl.src = cover;
    else       setCoverImage(coverImgEl, currentISBN);
    titleEl.textContent   = t;
    authorEl.textContent  = a;
    summaryEl.textContent = s;
    checkIfManualNeeded(a, s);

    get(child(stocksRef, currentISBN)).then(snap => {
      const v = snap.exists() ? snap.val() : 0;
      stockEl.textContent = v > 0 ? `En stock : ${v} exemplaires` : 'Hors stock';
      stockEl.classList.toggle('in-stock',  v>0);
      stockEl.classList.toggle('out-of-stock', v<=0);
    });

    get(child(booksDataRef, currentISBN)).then(snap => {
      if (snap.exists()) {
        confirmBtn.style.display = 'none';
        cancelBtn .style.display = 'none';
      } else {
        confirmBtn.style.display = 'inline-block';
        cancelBtn .style.display = 'inline-block';
      }
    });
  }

  confirmBtn.addEventListener('click', async () => {
    if (!bookPending || !currentISBN) {
      alert("Aucune donnée à ajouter.");
      return;
    }
    await Promise.all([
      set(child(booksDataRef, currentISBN), bookPending),
      set(child(stocksRef, currentISBN), 0)
    ]);
    alert("Livre ajouté, stock = 0");
    confirmBtn.style.display = 'none';
    cancelBtn .style.display = 'none';
    isbnForm.dispatchEvent(new Event('submit'));
  });

  cancelBtn.addEventListener('click', () => {
    bookInfo.classList.add('hidden');
    confirmBtn.style.display = 'none';
    cancelBtn .style.display = 'none';
    bookPending = null;
    currentISBN = null;
  });

  // Mise à jour du stock
  if (stockForm) {
    stockForm.addEventListener('submit', async e => {
      e.preventDefault();
      const r  = sanitizeISBN(document.getElementById('isbn').value.trim());
      const nv = parseInt(document.getElementById('new-stock').value, 10);
      if (!isValidISBN(r) || isNaN(nv) || nv < 0) {
        alert("Quantité invalide");
        return;
      }
      await set(child(stocksRef, r), nv);
      alert("Stock mis à jour");
      showBookInfos(titleEl.textContent, authorEl.textContent, summaryEl.textContent, coverImgEl.src);
    });
  }

  // Filtre de la liste
  if (searchIn) {
    searchIn.addEventListener('input', () => renderBookList(searchIn.value));
  }

  // ————————————————————————————————————————————
  // Ajout manuel  édition directe
  const manualToggleBtn = document.getElementById('manual-add-toggle');
  const manualForm      = document.getElementById('manual-add-form');
  manualToggleBtn.addEventListener('click', () => manualForm.classList.toggle('hidden'));

  window.editManualBook = async isbn => {
    const [bs, ss] = await Promise.all([
      get(child(booksDataRef, isbn)),
      get(child(stocksRef, isbn))
    ]);
    if (!bs.exists()) {
      alert("Livre non trouvé");
      return;
    }
    const d  = bs.val();
    const sv = ss.exists() ? ss.val() : 0;
    document.getElementById('manual-title').value        = d.title;
    document.getElementById('manual-author-full').value  = d.author;
    document.getElementById('manual-summary-full').value = d.summary;
    document.getElementById('manual-isbn').value         = isbn;
    document.getElementById('manual-cover-url').value    = d.cover || "";
    document.getElementById('manual-stock').value        = sv;
    isEditing   = true;
    editingISBN = isbn;
    document.getElementById('manual-isbn').setAttribute('readonly', '');
    manualForm.classList.remove('hidden');
  };

  manualForm.addEventListener('submit', async e => {
    e.preventDefault();
    const t = document.getElementById('manual-title').value.trim();
    const a = document.getElementById('manual-author-full').value.trim();
    const s = document.getElementById('manual-summary-full').value.trim();
    const i = sanitizeISBN(document.getElementById('manual-isbn').value.trim());
    const c = document.getElementById('manual-cover-url').value.trim();
    const cover = (c.startsWith('http') || c.startsWith('data:')) ? c : "";
    const sv    = parseInt(document.getElementById('manual-stock').value, 10) || 0;
    if (sv < 0) {
      alert("Stock négatif");
      return;
    }
    if (!t || !a || !s || !i || !isValidISBN(i)) {
      alert("Tous les champs obligatoires doivent être remplis");
      return;
    }
    if (!isEditing) {
      const dup = await get(child(booksDataRef, i));
      if (dup.exists()) {
        alert("Cet ISBN existe déjà");
        return;
      }
    }
    const key = isEditing ? editingISBN : i;
    const bd  = { title: t, author: a, summary: s, cover };
    await Promise.all([
      set(child(booksDataRef, key), bd),
      set(child(stocksRef, key), sv)
    ]);
    alert(isEditing ? `Livre ${key} mis à jour` : "Livre ajouté");
    isEditing   = false;
    editingISBN = null;
    document.getElementById('manual-isbn').removeAttribute('readonly');
    manualForm.reset();
    manualForm.classList.add('hidden');
  });

  // Écouteurs Firebase pour la liste
  function initializeBookListListener() {
    onValue(booksDataRef, sb => {
      globalBooksData = sb.val() || {};
      onValue(stocksRef, ss => {
        globalStocksData = ss.val() || {};
        renderBookList(searchIn.value);
      });
    });
  }
  initializeBookListListener();

  
  // ——— Gestion du scanner ———
  const scannerContainer   = document.getElementById('scanner-container');
  const scannerVideoTarget = document.getElementById('scanner-video');
  const stopScanBtn        = document.getElementById('stop-scan');
  const scanSearchToggle   = document.getElementById('scan-search-toggle');
  const scanManualToggle   = document.getElementById('scan-manual-toggle');

  // 1) Au chargement : on cache le scanner
  scannerContainer.classList.add('hidden');

  function startScanner(onDetected) {
    // toujours cibler scannerContainer et scannerVideoTarget
    scannerContainer.classList.remove('hidden');
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerVideoTarget,  // on y injecte le flux
        constraints: { facingMode: "environment" }
      },
      decoder: { readers: ["ean_reader", "ean_13_reader"] }
    }, err => {
      if (err) {
        console.error(err);
        alert("Pas d'accès à la caméra");
        scannerContainer.classList.add('hidden');
        return;
      }
      Quagga.start();
      Quagga.onDetected(data => {
        const code = data.codeResult.code;
        if (/^\d{10,13}$/.test(code)) {
          Quagga.stop();
          scannerContainer.classList.add('hidden');
          onDetected(code);
        }
      });
    });
  }

  function stopScanner() {
    Quagga.stop();
    scannerContainer.classList.add('hidden');
  }

  scanSearchToggle.addEventListener('click', () => {
    startScanner(code => {
      document.getElementById('isbn').value = code;
      isbnForm.dispatchEvent(new Event('submit'));
    });
  });

  scanManualToggle.addEventListener('click', () => {
    startScanner(code => {
      const mi = document.getElementById('manual-isbn');
      mi.value = code;
      mi.focus();
    });
  });

  stopScanBtn.addEventListener('click', stopScanner);
  // —————————————————————————————
});
