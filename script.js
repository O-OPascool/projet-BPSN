// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import {
  getDatabase, ref, child,
  set, get, onValue
} from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
  // — Dark/light toggle —
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
  const isbnForm        = document.getElementById('isbn-form');
  const scanISBNBtn     = document.getElementById('scan-search-toggle');
  const engineSelect    = document.getElementById('search-engine');
  const filterRoomSel   = document.getElementById('filter-room');
  const newRoomInput    = document.getElementById('new-room');
  const addRoomBtn      = document.getElementById('add-room');
  const roomListEl      = document.getElementById('room-list');
  const manualRoomSel   = document.getElementById('manual-room');
  const roomSelectEl    = document.getElementById('room-select');
  const manualToggleBtn = document.getElementById('manual-add-toggle');
  const manualForm      = document.getElementById('manual-add-form');
  const scanManualBtn   = document.getElementById('scan-manual-toggle');
  const spinner         = document.getElementById('spinner');
  const searchTabs      = document.getElementById('search-results');
  const bookInfoEl      = document.getElementById('book-info');
  const coverImg        = document.getElementById('cover');
  const titleEl         = document.getElementById('title');
  const authorEl        = document.getElementById('author');
  const summaryEl       = document.getElementById('summary');
  const fillBtn         = document.getElementById('fill-info-button');
  const manualEditDiv   = document.getElementById('manual-edit');
  const editAuthor      = document.getElementById('manual-author');
  const editSummary     = document.getElementById('manual-summary');
  const stockSpan       = document.getElementById('stock');
  const confirmBtn      = document.getElementById('confirm-add-book');
  const cancelBtn       = document.getElementById('cancel-add-book');
  const textFilter      = document.getElementById('search-book');
  const bookListEl      = document.getElementById('book-list');
  const totalCountEl    = document.getElementById('total-books-count');
  const scannerCont     = document.getElementById('scanner-container');
  const scannerVideo    = document.getElementById('scanner-video');
  const stopScanBtn     = document.getElementById('stop-scan');
  const stockForm       = document.getElementById('stock-form');
  const newStockInput   = document.getElementById('new-stock');
  const manualRoomAdd   = document.getElementById('manual-room');

  // — Utils —
  const showSpinner  = () => spinner.classList.remove('hidden');
  const hideSpinner  = () => spinner.classList.add('hidden');
  const sanitizeISBN = s => s.replace(/[-\s]/g, '');
  const isValidISBN  = s => (s.length===10||s.length===13) && /^\d+$/.test(s);

  function convertISBN10toISBN13(isbn10) {
    const core = isbn10.slice(0,9), prefix="978"+core;
    let sum=0;
    for (let i=0;i<prefix.length;i++){
      const d=+prefix[i];
      sum += (i%2===0?d:d*3);
    }
    const rem=sum%10;
    return prefix + (rem===0?0:10-rem);
  }

  // — API calls —
  async function fetchBookDataFromAPIs(isbn){
    try {
      const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
                         .then(r=>r.json());
      if (g.items?.length) return { googleBooksResults:g.items };
    } catch{}
    try {
      const o = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if (o.ok){
        const d=await o.json();
        let a="Auteur inconnu", s="Aucune information";
        if (typeof d.by_statement==="string") a=d.by_statement;
        if (typeof d.description==="string") s=d.description;
        else if (d.description?.value) s=d.description.value;
        return { openLibraryResult:{ title:d.title||"Sans titre", author:a, summary:s }};
      }
    } catch{}
    return null;
  }

  async function completeWithGoogleIfNeeded(isbn, base){
    let { title, author, summary } = base;
    if (author==="Auteur inconnu"||summary.length<50){
      try {
        const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
                           .then(r=>r.json());
        const vi = g.items?.[0]?.volumeInfo||{};
        if (author==="Auteur inconnu" && vi.authors?.[0]) author=vi.authors[0];
        if (vi.description?.length>summary.length) summary=vi.description;
      } catch{}
    }
    return { title, author, summary };
  }

  function parseVolumeInfo(v){
    return {
      title:   v.title||"Sans titre",
      author:  v.authors?.[0]||"Auteur inconnu",
      summary: v.description||"Aucune information",
      cover:   v.imageLinks?.thumbnail||null
    };
  }

  // — Rooms management —
  onValue(roomsRef, snap=>{
    const rooms=snap.val()||{};
    roomListEl.innerHTML="";
    manualRoomAdd.innerHTML='<option value="">Salle…</option>';
    roomSelectEl.innerHTML='<option value="">—</option>';
    filterRoomSel.innerHTML='<option value="">Toutes</option>';
    Object.values(rooms).forEach(name=>{
      // list
      const li=document.createElement('li');
      li.textContent=name+" ";
      const del=document.createElement('button');
      del.textContent="🗑️";
      del.onclick=()=> set(child(roomsRef,encodeURIComponent(name)),null);
      li.appendChild(del);
      roomListEl.appendChild(li);
      // selects
      [manualRoomAdd,roomSelectEl,filterRoomSel].forEach(sel=>{
        const o=document.createElement('option');
        o.value=name; o.textContent=name;
        sel.appendChild(o);
      });
    });
  });

  addRoomBtn.addEventListener('click',async()=>{
    const n=newRoomInput.value.trim();
    if(!n) return alert("Nom requis");
    await set(child(roomsRef,encodeURIComponent(n)),n);
    newRoomInput.value="";
  });

  // — Book list filtering & rendering —
  textFilter.addEventListener('input',renderBookList);
  filterRoomSel.addEventListener('change',renderBookList);

  let allBooks={}, allStocks={};
  function updateTotal(){
    const t=Object.values(allStocks).reduce((a,v)=>a+(v||0),0);
    totalCountEl.textContent=`Total : ${t}`;
  }
  function renderBookList(){
    bookListEl.innerHTML="";
    const tf=textFilter.value.toLowerCase();
    const rf=filterRoomSel.value;
    for(const isbn in allBooks){
      const b=allBooks[isbn], st=allStocks[isbn]||0;
      if(tf&&! (b.title.toLowerCase().includes(tf)||b.author.toLowerCase().includes(tf))) continue;
      if(rf && b.room!==rf) continue;
      const item=document.createElement('div');
      item.className="book-item";
      // cover
      const img=document.createElement('img');
      img.className="book-cover";
      if(b.cover){ img.src=b.cover; img.onerror=()=>img.style.display="none"; }
      else img.style.display="none";
      item.appendChild(img);
      // details
      const det=document.createElement('div');
      det.className="book-details";
      const cls = st>0?(st<5?'stock-low':'stock-ok'):'stock-out';
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
    if(!confirm(`Supprimer ${isbn}?`)) return;
    Promise.all([
      set(child(stocksRef,isbn),null),
      set(child(booksDataRef,isbn),null)
    ]);
  };

  onValue(booksDataRef,snap=>{
    allBooks=snap.val()||{};
    onValue(stocksRef,snap2=>{
      allStocks=snap2.val()||{};
      renderBookList();
    });
  });

  // — ISBN search & add —
  let pending=null, currentISBN=null;

  function checkIfManualNeeded(a,s){
    fillBtn.classList.toggle('hidden',!(a==="Auteur inconnu"||s==="Aucune information"));
  }
  fillBtn.onclick=()=>{
    manualEditDiv.classList.remove('hidden');
    editAuthor.value=pending.author;
    editSummary.value=pending.summary;
  };
  document.getElementById('save-manual-info').onclick=()=>{
    if(editAuthor.value) pending.author=editAuthor.value.trim();
    if(editSummary.value) pending.summary=editSummary.value.trim();
    authorEl.textContent=pending.author;
    summaryEl.textContent=pending.summary;
    manualEditDiv.classList.add('hidden');
    checkIfManualNeeded(pending.author,pending.summary);
  };
  document.getElementById('cancel-manual-info').onclick=()=>{
    manualEditDiv.classList.add('hidden');
  };

  isbnForm.addEventListener('submit',async e=>{
    e.preventDefault();
    showSpinner();
    let raw=sanitizeISBN(document.getElementById('isbn').value.trim());
    if(!isValidISBN(raw)){ alert("ISBN invalide"); hideSpinner(); return; }
    currentISBN=raw;

    let data=await fetchBookDataFromAPIs(raw);
    if(!data && raw.length===10){
      const alt=convertISBN10toISBN13(raw);
      data=await fetchBookDataFromAPIs(alt);
      if(data) currentISBN=alt;
    }

    // clear tabs
    searchTabs.innerHTML="";
    searchTabs.classList.add("hidden");
    // multiple Google
    if(data?.googleBooksResults?.length>1){
      searchTabs.classList.remove("hidden");
      data.googleBooksResults.forEach((vol,i)=>{
        const info=parseVolumeInfo(vol.volumeInfo||{});
        const btn=document.createElement("button");
        btn.className="tab";
        btn.textContent=info.title;
        btn.onclick=()=>showBookInfos(info);
        if(i===0){
          btn.classList.add("active");
          showBookInfos(info);
        }
        searchTabs.appendChild(btn);
      });
    }
    else if(data?.googleBooksResults){
      showBookInfos(parseVolumeInfo(data.googleBooksResults[0].volumeInfo||{}));
    }
    else if(data?.openLibraryResult){
      const {title,author,summary}=data.openLibraryResult;
      showBookInfos({title,author,summary,cover:null});
    }
    else {
      showBookInfos({title:"Nouveau livre",author:"Auteur inconnu",summary:"—",cover:null});
    }
    hideSpinner();
  });

  function showBookInfos({title,author,summary,cover}){
    pending={title,author,summary,cover};
    bookInfoEl.classList.remove("hidden");
    titleEl.textContent=title;
    authorEl.textContent=author;
    summaryEl.textContent=summary;
    checkIfManualNeeded(author,summary);

    if(cover){
      coverImg.src=cover; coverImg.style.display="block";
      coverImg.onerror=()=>coverImg.style.display="none";
    } else {
      coverImg.style.display="none";
    }

    get(child(stocksRef,currentISBN)).then(s=>{
      stockSpan.textContent=s.exists()?s.val():"0";
    });
    get(child(booksDataRef,currentISBN)).then(s=>{
      if(s.exists()){
        confirmBtn.classList.add("hidden");
        cancelBtn.classList.add("hidden");
      } else {
        confirmBtn.classList.remove("hidden");
        cancelBtn.classList.remove("hidden");
      }
    });
  }

  confirmBtn.onclick=async()=>{
    const room=roomSelectEl.value;
    await Promise.all([
      set(child(booksDataRef,currentISBN),{...pending,room}),
      set(child(stocksRef,currentISBN),0)
    ]);
    alert("Ajouté!");
    isbnForm.dispatchEvent(new Event("submit"));
  };
  cancelBtn.onclick=()=>bookInfoEl.classList.add("hidden");

  // — Stock update form —
  stockForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const q=+newStockInput.value;
    if(isNaN(q)||q<0) return alert("Quantité invalide");
    await set(child(stocksRef,currentISBN),q);
    alert("Stock mis à jour");
    stockSpan.textContent=q;
  });

  // — Manual add/edit —
  let isEditing=false, editingISBN=null;
  manualToggleBtn.onclick=()=>manualForm.classList.toggle("hidden");
  manualForm.onsubmit=async e=>{
    e.preventDefault();
    const t=document.getElementById("manual-title").value.trim();
    const a=document.getElementById("manual-author-full").value.trim();
    const s=document.getElementById("manual-summary-full").value.trim();
    const i=sanitizeISBN(document.getElementById("manual-isbn").value.trim());
    const c=document.getElementById("manual-cover-url").value.trim();
    const r=document.getElementById("manual-room").value;
    const sv=+document.getElementById("manual-stock").value||0;
    if(!t||!a||!s||!i||!isValidISBN(i)) return alert("Champs obligatoires");
    if(sv<0) return alert("Stock négatif");
    if(!isEditing){
      if((await get(child(booksDataRef,i))).exists()) return alert("ISBN existant");
    }
    const key=isEditing?editingISBN:i;
    await Promise.all([
      set(child(booksDataRef,key),{
        title:t,author:a,summary:s,
        cover:(c.startsWith("http")||c.startsWith("data:")?c:""),
        room:r
      }),
      set(child(stocksRef,key),sv)
    ]);
    alert(isEditing?"Modifié!":"Ajouté!");
    isEditing=false; editingISBN=null;
    document.getElementById("manual-isbn").removeAttribute("readonly");
    manualForm.reset();
    manualForm.classList.add("hidden");
  };

  window.editManualBook=async isbn=>{
    const [bs,ss]=await Promise.all([
      get(child(booksDataRef,isbn)),
      get(child(stocksRef,isbn))
    ]);
    if(!bs.exists()) return alert("Non trouvé");
    const d=bs.val(), sv=ss.exists()?ss.val():0;
    document.getElementById("manual-title").value=d.title;
    document.getElementById("manual-author-full").value=d.author;
    document.getElementById("manual-summary-full").value=d.summary;
    document.getElementById("manual-isbn").value=isbn;
    document.getElementById("manual-cover-url").value=d.cover||"";
    document.getElementById("manual-room").value=d.room||"";
    document.getElementById("manual-stock").value=sv;
    isEditing=true; editingISBN=isbn;
    document.getElementById("manual-isbn").setAttribute("readonly","");
    manualForm.classList.remove("hidden");
    manualForm.scrollIntoView({behavior:"smooth",block:"start"});
  };

  // — Barcode scanner —
  function startScanner(cb){
    scannerCont.classList.remove("hidden");
    Quagga.init({
      inputStream:{ name:"Live", type:"LiveStream", target:scannerVideo, constraints:{facingMode:"environment"} },
      decoder:{ readers:["ean_reader","ean_13_reader"] }
    },err=>{
      if(err){ alert("Caméra KO"); scannerCont.classList.add("hidden"); return; }
      Quagga.start();
      Quagga.onDetected(({codeResult})=>{
        const code=codeResult.code;
        if(/^\d{10,13}$/.test(code)){
          Quagga.stop();
          scannerCont.classList.add("hidden");
          cb(code);
        }
      });
    });
  }
  scanISBNBtn.onclick   =()=>startScanner(code=>{
    document.getElementById("isbn").value=code;
    isbnForm.dispatchEvent(new Event("submit"));
  });
  scanManualBtn.onclick =()=>startScanner(code=>{
    const mi=document.getElementById("manual-isbn");
    mi.value=code; mi.focus();
  });
  stopScanBtn.onclick   =()=>{
    Quagga.stop();
    scannerCont.classList.add("hidden");
  };
});
