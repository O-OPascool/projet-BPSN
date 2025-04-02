// Import des modules Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getDatabase, ref, child, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDKEewyRf8TgMjXCsfHfzvnCpBUG-GYDig",
    authDomain: "bpsn-74f1b.firebaseapp.com",
    databaseURL: "https://bpsn-74f1b-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "bpsn-74f1b",
    storageBucket: "bpsn-74f1b.firebasestorage.app",
    messagingSenderId: "1057707303676",
    appId: "1:1057707303676:web:63dd292678dead41c2ed79",
    measurementId: "G-DZGXBJERKQ"
};

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Références Firebase
const stocksRef = ref(database, 'stocks');
const booksDataRef = ref(database, 'booksData');

// Validation ISBN
function isValidISBN(isbn) {
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
}

// Image couverture avec fallback
function getCoverUrl(isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

function setCoverImage(imgElement, isbn, defaultCover) {
    imgElement.src = getCoverUrl(isbn);
    imgElement.onerror = () => { imgElement.style.display = 'none'; };
}

// Normalisation auteurs avancée
function normalizeAuthorName(name) {
    return name.toLowerCase().replace(/[\.,]/g, '').replace(/\s+/g, ' ').trim();
}

let globalBooksData = {};
let globalStocksData = {};

function updateTotalBooksCount() {
    const totalCount = Object.values(globalStocksData).reduce((acc, val) => acc + (val || 0), 0);
    document.getElementById('total-books-count').innerText = `Total des livres disponibles : ${totalCount}`;
}

function renderBookList(filter = '') {
    const bookListElement = document.getElementById('book-list');
    bookListElement.innerHTML = '';

    const normalizedFilter = filter.toLowerCase();

    for (const isbn in globalBooksData) {
        const bookData = globalBooksData[isbn];
        const normalizedAuthor = normalizeAuthorName(bookData.author || 'Auteur inconnu');

        if (filter && !(bookData.title.toLowerCase().includes(normalizedFilter) || normalizedAuthor.includes(normalizedFilter))) {
            continue;
        }

        const stock = globalStocksData[isbn] || 0;
        const bookItem = document.createElement('div');
        bookItem.classList.add('book-item');

        const imgElement = document.createElement('img');
        imgElement.classList.add('book-cover');
        setCoverImage(imgElement, isbn, 'default_cover.jpg');
        bookItem.appendChild(imgElement);

        const contentElement = document.createElement('div');
        contentElement.classList.add('book-details');
        contentElement.innerHTML = `
            <div class="book-title"><strong>Titre : ${bookData.title}</strong></div>
            <div class="book-identifier">ISBN : <strong>${isbn}</strong></div>
            <div class="book-summary">Résumé : ${bookData.summary}</div>
            <div class="stock-info">${stock > 0 ? 'En stock : ' + stock + ' exemplaires' : 'Hors stock'}</div>
            <span class="book-author">Auteur : ${bookData.author}</span>
            <button class="delete-button" onclick="deleteBook('${isbn}')">Supprimer</button>
        `;
        bookItem.appendChild(contentElement);

        bookListElement.appendChild(bookItem);
    }

    updateTotalBooksCount();
}

function deleteBook(isbn) {
    if (confirm(`Confirmer la suppression du livre avec l'ISBN ${isbn} ?`)) {
        Promise.all([
            set(child(stocksRef, isbn), null),
            set(child(booksDataRef, isbn), null)
        ]).then(() => {
            alert(`Livre supprimé.`);
            updateTotalBooksCount();
        }).catch(console.error);
    }
}

// Barre recherche principale pour ISBN
const stockForm = document.getElementById('stock-form');
stockForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const isbn = document.getElementById('isbn').value.trim();
    const newStock = parseInt(document.getElementById('new-stock').value, 10);

    if (!isValidISBN(isbn)) return alert('ISBN non valide.');

    if (newStock >= 0) {
        set(child(stocksRef, isbn), newStock).then(() => {
            alert('Stock mis à jour.');
            updateTotalBooksCount();
        });
    } else {
        alert('Quantité invalide.');
    }
});

// Barre de recherche filtrage
const searchInput = document.getElementById('search-book');
searchInput.addEventListener('input', () => {
    renderBookList(searchInput.value);
});

// Initialisation listener Firebase
function initializeBookListListener() {
    onValue(booksDataRef, snapshot => {
        globalBooksData = snapshot.val() || {};
        onValue(stocksRef, snap => {
            globalStocksData = snap.val() || {};
            renderBookList(searchInput.value);
        });
    });
}

initializeBookListListener();
window.deleteBook = deleteBook;
