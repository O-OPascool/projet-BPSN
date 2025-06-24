// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import {
  getDatabase, ref, child,
  set, get, onValue
} from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
  // — Toggle thème —
  const modeBtn = document.getElementById('mode-toggle');
  if (modeBtn) {
    const upd = () =>
      modeBtn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
    modeBtn.addEventListener('click', () => {
      const dark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', dark ? 'dark' : 'light');
      upd();
    });
    upd();
  }

  // — Firebase init —
  const cfg = {
    apiKey: "AIzaSyDKE…",
    authDomain: "bpsn-74f1b.firebaseapp.com",
    databaseURL: "https://bpsn-74f1b-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "bpsn-74f1b",
    storageBucket: "bpsn-74f1b.firebasestorage.app",
    messagingSenderId: "1057707303676",
    appId: "1:1057707303676:web:63dd292678dead41c2ed79",
    measurementId: "G-DZGXBJERKQ"
  };
  const app  = initializeApp(cfg);
  const db   = getDatabase(app);
  const stocksRef    = ref(db, 'stocks');
  const booksDataRef = ref(db, 'booksData');
  const roomsRef     = ref(db, 'rooms');

  // — DOM refs —
  const
    isbnForm      = document.getElementById('isbn-form'),
    scanISBNBtn   = document.getElementById('scan-search-toggle'),
    engineSelect  = document.getElementById('search-engine'),
    filterRoomSel = document.getElementById('filter-room'),
    newRoomInput  = document.getElementById('new-room'),
    addRoomBtn    = document.getElementById('add-room'),
    roomListEl    = document.getElementById('room-list'),
    manualRoomSel = document.getElementById('manual-room'),
    roomSelectEl  = document.getElementById('room-select'),
    manualToggle  = document.getElementById('manual-add-toggle'),
    manualForm    = document.getElementById('manual-add-form'),
    scanManualBtn = document.getElementById('scan-manual-toggle'),
    spinner       = document.getElementById('spinner'),
    searchTabs    = document.getElementById('search-results'),
    bookInfoEl    = document.getElementById('book-info'),
    coverImg      = document.getElementById('cover'),
    titleEl       = document.getElementById('title'),
    authorEl      = document.getElementById('author'),
    summaryEl     = document.getElementById('summary'),
    fillBtn       = document.getElementById('fill-info-button'),
    manualEditDiv = document.getElementById('manual-edit'),
    editAuthor    = document.getElementById('manual-author'),
    editSummary   = document.getElementById('manual-summary'),
    selectRoom    = document.getElementById('room-select'),
    stockSpan     = document.getElementById('stock'),
    confirmBtn    = document.getElementById('confirm-add-book'),
    cancelBtn     = document.getElementById('cancel-add-book'),
    stockForm     = document.getElementById('stock-form'),
    newStockInput = document.getElementById('new-stock'),
    textFilter    = document.getElementById('search-book'),
    bookListEl    = document.getElementById('book-list'),
    totalCountEl  = document.getElementById('total-books-count'),
    scannerCont   = document.getElementById('scanner-container'),
    scannerVideo  = document.getElementById('scanner-video'),
    stopScanBtn   = document.getElementById('stop-scan');

  // — Utilitaires —
  const showSpinner = () => spinner.classList.remove('hidden');
  const hideSpinner = () => spinner.classList.add('hidden');
  const sanitize    = s => s.replace(/[-\s]/g, '');
  const validISBN   = s => (s.length===10||s.length===13)&&!isNaN(s);

  function setCover(el,isbn){
    el.src = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    el.onerror = ()=>el.style.display='none';
    el.onload  = ()=>el.style.display='block';
  }

  function parseVol(v){
    return {
      title:   v.title            || "Sans titre",
      author:  v.authors?.[0]     || "Auteur inconnu",
      summary: v.description      || "Aucune info",
      cover:   v.imageLinks?.thumbnail|| null
    };
  }

  async function fetchAPIs(isbn){
    try {
      const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
                        .then(r=>r.json());
      if(g.items?.length) return { googleBooksResults: g.items };
    }catch{}
    try {
      const o = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if(o.ok){
        const d = await o.json();
        let author="Auteur inconnu", summary="Aucune info";
        if(typeof d.by_statement==='string') author=d.by_statement;
        if(typeof d.description==='string')  summary=d.description;
        else if(d.description?.value)       summary=d.description.value;
        return { openLibraryResult:{ title:d.title||"Sans titre",author,summary } };
      }
    }catch{}
    return null;
  }

  // — Chargement et rendu des salles —
  onValue(roomsRef, snap=>{
    const rooms = snap.val()||{};
    // remplir détail & selects
    roomListEl.innerHTML = '';
    ['',''].forEach( ()=>{} );
    manualRoomSel.innerHTML = '<option value="">Salle…</option>';
    roomSelectEl.innerHTML  = '<option value="">—</option>';
    filterRoomSel.innerHTML = '<option value="">Toutes les salles</option>';
    Object.values(rooms).forEach(name=>{
      // liste
      const li = document.createElement('li');
      li.textContent = name+' ';
      const del = document.createElement('button');
      del.textContent='🗑️';
      del.onclick = ()=> set(child(roomsRef, encodeURIComponent(name)),null);
      li.appendChild(del);
      roomListEl.appendChild(li);
      // selects
      [manualRoomSel,roomSelectEl,filterRoomSel].forEach(sel=>{
        const opt=document.createElement('option');
        opt.value=name; opt.textContent=name;
        sel.appendChild(opt);
      });
    });
  });

  addRoomBtn.addEventListener('click', async()=>{
    const nm=newRoomInput.value.trim();
    if(!nm) return alert('Nom requis');
    await set(child(roomsRef, encodeURIComponent(nm)), nm);
    newRoomInput.value='';
  });

  // — Stock, texte & salle filtres —
  textFilter.addEventListener('input', renderList);
  filterRoomSel.addEventListener('change', renderList);

  // — Données et rendu de la liste —
  let allBooks={}, allStocks={};
  function updateTotal(){
    const tot = Object.values(allStocks).reduce((a,v)=>a+(v||0),0);
    totalCountEl.textContent = `Total des livres disponibles : ${tot}`;
  }

  function renderList(){
    bookListEl.innerHTML = '';
    const txt   = textFilter.value.toLowerCase();
    const roomF = filterRoomSel.value;

    for(const isbn in allBooks){
      const b = allBooks[isbn], st = allStocks[isbn]||0;
      if(txt && !b.title.toLowerCase().includes(txt)&&!b.author.toLowerCase().includes(txt)) continue;
      if(roomF && b.room!==roomF) continue;

      const item=document.createElement('div');
      item.className='book-item';
      // image
      const img=document.createElement('img');
      img.className='book-cover';
      if(b.cover){ img.src=b.cover; img.onerror=()=>img.style.display='none'; }
      else img.style.display='none';
      item.appendChild(img);

      const det=document.createElement('div');
      det.className='book-details';
      const cls = st>0 ? (st<5?'stock-low':'stock-ok') : 'stock-out';
      det.innerHTML=`
        <div class="book-title">${b.title} <em>(${isbn})</em></div>
        <div class="book-author">Auteur : ${b.author}</div>
        <div class="book-summary">Résumé : ${b.summary}</div>
        <div class="book-stock ${cls}">${st>0?`Stock : ${st}`:'Hors stock'}</div>
        <div class="book-room">Salle : ${b.room||'—'}</div>
        <div class="book-actions">
          <button onclick="deleteBook('${isbn}')">🗑️</button>
          <button onclick="editManualBook('${isbn}')">✏️</button>
        </div>`;
      item.appendChild(det);
      bookListEl.appendChild(item);
    }

    updateTotal();
  }

  window.deleteBook = isbn=>{
    if(!confirm(`Supprimer ${isbn} ?`)) return;
    Promise.all([
      set(child(stocksRef, isbn), null),
      set(child(booksDataRef, isbn), null)
    ]);
  };

  // — Écoute Firebase pour liste —
  onValue(booksDataRef, snap=>{
    allBooks = snap.val()||{};
    onValue(stocksRef, snap2=>{
      allStocks = snap2.val()||{};
      renderList();
    });
  });


  // —— Recherche par ISBN ——
  let pending       = null;
  let currentISBN   = null;

  function checkIfManualNeeded(a, s) {
    fillBtn.classList.toggle('hidden', !(a === "Auteur inconnu" || s === "Aucune information"));
  }

  // Passage API → édition manuelle
  fillBtn.onclick = () => {
    manualEditDiv.classList.remove('hidden');
    editAuthor.value  = pending.author;
    editSummary.value = pending.summary;
  };
  document.getElementById('save-manual-info').onclick = () => {
    if (editAuthor.value)  pending.author  = editAuthor.value.trim();
    if (editSummary.value) pending.summary = editSummary.value.trim();
    authorEl.textContent  = pending.author;
    summaryEl.textContent = pending.summary;
    manualEditDiv.classList.add('hidden');
    checkIfManualNeeded(pending.author, pending.summary);
  };
  document.getElementById('cancel-manual-info').onclick = () => {
    manualEditDiv.classList.add('hidden');
  };

  isbnForm.addEventListener('submit', async e => {
    e.preventDefault();
    showSpinner();
    let raw = sanitizeISBN(document.getElementById('isbn').value.trim());
    if (!isValidISBN(raw)) { alert('ISBN invalide'); hideSpinner(); return; }
    currentISBN = raw;

    let data = null, eng = engineSelect.value;
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

    bookInfoEl.classList.add('hidden');
    searchTabs.innerHTML = ''; searchTabs.classList.add('hidden');

    // Plusieurs résultats Google → onglets
    if (data?.googleBooksResults?.length > 1) {
      searchTabs.classList.remove('hidden');
      data.googleBooksResults.forEach((it, i) => {
        const v = parseVolumeInfo(it.volumeInfo || {});
        const btn = document.createElement('button');
        btn.className = 'tab';
        btn.textContent = v.title;
        btn.onclick = () => showBookInfos(v.title, v.author, v.summary, v.cover);
        if (i === 0) {
          btn.classList.add('active');
          showBookInfos(v.title, v.author, v.summary, v.cover);
        }
        searchTabs.appendChild(btn);
      });

    // Un seul résultat Google
    } else if (data?.googleBooksResults) {
      const v = parseVolumeInfo(data.googleBooksResults[0].volumeInfo || {});
      showBookInfos(v.title, v.author, v.summary, v.cover);

    // OpenLibrary fallback
    } else if (data?.openLibraryResult) {
      const { title, author, summary } = data.openLibraryResult;
      showBookInfos(title, author, summary, null);

    // Aucune donnée
    } else {
      showBookInfos("Nouveau livre", "Auteur inconnu", "—", null);
    }

    hideSpinner();
  });

  function showBookInfos(title, author, summary, cover) {
    pending = { title, author, summary, cover };
    bookInfoEl.classList.remove('hidden');

    // Titre / Auteur / Résumé
    titleEl.textContent   = title;
    authorEl.textContent  = author;
    summaryEl.textContent = summary;
    checkIfManualNeeded(author, summary);

    // Jaquette
    if (cover) {
      coverImgEl.src         = cover;
      coverImgEl.style.display = 'block';
      coverImgEl.onerror     = () => { coverImgEl.style.display = 'none'; };
    } else {
      setCoverImage(coverImgEl, currentISBN);
    }

    // Stock & boutons
    get(child(stocksRef, currentISBN)).then(snap => {
      stockEl.textContent = snap.exists() ? snap.val() : '0';
    });
    get(child(booksDataRef, currentISBN)).then(snap => {
      if (snap.exists()) {
        confirmBtn.style.display = 'none';
        cancelBtn.style.display  = 'none';
      } else {
        confirmBtn.style.display = '';
        cancelBtn.style.display  = '';
      }
    });
  }

  confirmBtn.onclick = async () => {
    const room = roomSelectMain.value;
    await Promise.all([
      set(child(booksDataRef, currentISBN), { ...pending, room }),
      set(child(stocksRef, currentISBN), 0)
    ]);
    alert("Livre ajouté !");
    isbnForm.dispatchEvent(new Event('submit'));
  };
  cancelBtn.onclick = () => {
    bookInfoEl.classList.add('hidden');
  };

  // —— Formulaire manuel —__
  const manualToggleBtn = document.getElementById('manual-add-toggle');
  // manualForm déjà déclaré plus haut
  manualToggleBtn.onclick = () => manualForm.classList.toggle('hidden');

  manualForm.onsubmit = async e => {
    e.preventDefault();
    const t  = document.getElementById('manual-title').value.trim();
    const a  = document.getElementById('manual-author-full').value.trim();
    const s  = document.getElementById('manual-summary-full').value.trim();
    const i  = sanitizeISBN(document.getElementById('manual-isbn').value.trim());
    const c  = document.getElementById('manual-cover-url').value.trim();
    const r  = document.getElementById('manual-room').value;
    const sv = parseInt(document.getElementById('manual-stock').value, 10) || 0;
    if (!t||!a||!s||!i||!isValidISBN(i)) return alert("Champs obligatoires");
    if (sv < 0) return alert("Stock négatif");

    if (!isEditing) {
      if ((await get(child(booksDataRef, i))).exists()) return alert("ISBN déjà existant");
    }
    const key = isEditing ? editingISBN : i;
    await Promise.all([
      set(child(booksDataRef, key), {
        title: t, author: a, summary: s,
        cover: (c.startsWith('http')||c.startsWith('data:') ? c : ''), room: r
      }),
      set(child(stocksRef, key), sv)
    ]);
    alert(isEditing ? "Modifié !" : "Ajouté !");
    isEditing    = false;
    editingISBN  = null;
    document.getElementById('manual-isbn').removeAttribute('readonly');
    manualForm.reset();
    manualForm.classList.add('hidden');
  };

  window.editManualBook = async isbn => {
    const [bs, ss] = await Promise.all([
      get(child(booksDataRef, isbn)),
      get(child(stocksRef, isbn))
    ]);
    if (!bs.exists()) return alert("Non trouvé");
    const d  = bs.val(), sv = ss.exists() ? ss.val() : 0;
    document.getElementById('manual-title').value        = d.title;
    document.getElementById('manual-author-full').value  = d.author;
    document.getElementById('manual-summary-full').value = d.summary;
    document.getElementById('manual-isbn').value         = isbn;
    document.getElementById('manual-cover-url').value    = d.cover || "";
    document.getElementById('manual-room').value         = d.room  || "";
    document.getElementById('manual-stock').value        = sv;
      isEditing   = true;
  editingISBN = isbn;
  document.getElementById('manual-isbn').setAttribute('readonly', '');
  manualForm.classList.remove('hidden');
   manualForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  manualForm.focus(); // optionnel : met le focus dans le formulaire
};

  // —— Écoute temps réel Firebase pour la liste ——
  onValue(booksDataRef, snapB => {
    allBooks = snapB.val() || {};
    onValue(stocksRef, snapS => {
      allStocks = snapS.val() || {};
      renderBookList(searchIn.value);
    });
  });

  // —— Scanner QuaggaJS —__
  const scannerContainer   = document.getElementById('scanner-container');
  const scannerTarget      = document.getElementById('scanner-video');
  // stopScanBtn déjà déclaré plus haut
  const scanSearchToggle   = document.getElementById('scan-search-toggle');
  const scanManualToggle   = document.getElementById('scan-manual-toggle');
  scannerContainer.classList.add('hidden');

  function startScanner(callback) {
    scannerContainer.classList.remove('hidden');
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerTarget,
        constraints: { facingMode: "environment" }
      },
      decoder: { readers: ["ean_reader","ean_13_reader"] }
    }, err => {
      if (err) { alert("Erreur caméra"); scannerContainer.classList.add('hidden'); return; }
      Quagga.start();
      Quagga.onDetected(({ codeResult }) => {
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
