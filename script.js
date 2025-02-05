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

// Fonction pour valider l'ISBN
function isValidISBN(isbn) {
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
}

// Gestion du formulaire de recherche
document.getElementById('isbn-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const isbn = document.getElementById('isbn').value.trim();

    if (!isValidISBN(isbn)) {
        alert("Veuillez entrer un ISBN valide (10 ou 13 chiffres).");
        return;
    }

    document.getElementById('book-info').classList.add('hidden');
    await fetchBookData(isbn);
});

// Récupérer ou ajouter les données d'un livre
async function fetchBookData(isbn) {
    try {
        const snapshot = await get(child(booksDataRef, isbn));
        if (snapshot.exists()) {
            const book = snapshot.val();
            displayBookData(isbn, book);
            displayStock(isbn);
        } else {
            const apiUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
            const response = await fetch(apiUrl);

            if (!response.ok) throw new Error(`Erreur API : ${response.status}`);

            const data = await response.json();
            if (data.totalItems > 0) {
                const book = data.items[0].volumeInfo;
                const bookData = {
                    title: book.title || 'Titre non disponible',
                    author: book.authors ? book.authors.join(', ') : 'Auteur inconnu',
                    summary: book.description || 'Aucun résumé disponible.',
                    cover: book.imageLinks?.thumbnail || 'image.png'
                };

                await set(child(booksDataRef, isbn), bookData);
                displayBookData(isbn, bookData);
                displayStock(isbn);
            } else {
                alert('Aucun livre trouvé avec cet ISBN.');
            }
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des données :", error);
        alert(`Erreur : ${error.message}`);
    }
}

// Afficher les données d'un livre
function displayBookData(isbn, bookData) {
    document.getElementById('title').innerText = bookData.title;
    document.getElementById('author').innerText = bookData.author;
    document.getElementById('summary').innerText = bookData.summary;
    document.getElementById('cover').src = bookData.cover;
    document.getElementById('book-info').classList.remove('hidden');
}

// Afficher le stock d'un livre
async function displayStock(isbn) {
    const stockElement = document.getElementById('stock');
    try {
        const snapshot = await get(child(stocksRef, isbn));
        const stockValue = snapshot.val();

        if (stockValue !== null) {
            stockElement.innerText = stockValue > 0
                ? `En stock : ${stockValue} exemplaires`
                : 'Hors stock';
        } else {
            stockElement.innerText = 'Stock non défini.';
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du stock :", error);
    }
}

// Fonction pour gérer la mise à jour du stock
document.getElementById('stock-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const newStock = parseInt(document.getElementById('new-stock').value);
    const isbn = document.getElementById('isbn').value.trim();

    if (!isValidISBN(isbn)) {
        alert("ISBN non valide.");
        return;
    }

    if (!isNaN(newStock) && newStock >= 0) {
        try {
            await set(child(stocksRef, isbn), newStock);
            alert('Stock mis à jour avec succès !');
            displayStock(isbn);
        } catch (error) {
            console.error("Erreur lors de la mise à jour du stock :", error);
            alert('Impossible de mettre à jour le stock.');
        }
    } else {
        alert('Veuillez entrer une quantité valide.');
    }
});

// Initialiser la liste des livres avec écoute en temps réel
function initializeBookListListener() {
    const bookListElement = document.getElementById('book-list');

    onValue(booksDataRef, (booksDataSnapshot) => {
        onValue(stocksRef, (stocksSnapshot) => {
            const booksData = booksDataSnapshot.val() || {};
            const stocks = stocksSnapshot.val() || {};

            bookListElement.innerHTML = ''; // Réinitialiser la liste

            for (const isbn in booksData) {
                const bookData = booksData[isbn];
                const stock = stocks[isbn] || 0;

                const bookItem = document.createElement('div');
                bookItem.classList.add('book-item');

                bookItem.innerHTML = `
                    <div class="book-title"><strong>${bookData.title}</strong></div>
                    <div>Auteur : ${bookData.author}</div>
                    <div>Résumé : ${bookData.summary}</div>
                    <div>ISBN : <strong>${isbn}</strong></div>
                    <div class="stock-info ${stock > 0 ? 'in-stock' : 'out-of-stock'}">
                        ${stock > 0 ? `En stock : ${stock} exemplaire(s)` : 'Hors stock'}
                    </div>
                    <button class="delete-button" data-isbn="${isbn}">Supprimer</button>
                `;

                const deleteButton = bookItem.querySelector('.delete-button');
                deleteButton.addEventListener('click', function () {
                    deleteBook(isbn);
                });

                bookListElement.appendChild(bookItem);
            }
        });
    });
}

// Fonction pour supprimer un livre
function deleteBook(isbn) {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le livre avec l'ISBN ${isbn} ?`)) {
        Promise.all([
            set(child(stocksRef, isbn), null), // Supprime le stock
            set(child(booksDataRef, isbn), null) // Supprime les données du livre
        ])
            .then(() => {
                alert('Livre supprimé avec succès.');
            })
            .catch(error => {
                console.error('Erreur lors de la suppression :', error);
            });
    }
}

// Filtrer les livres par titre ou auteur
function filterBookList() {
    const searchText = document.getElementById('search-book').value.toLowerCase();
    const bookItems = document.querySelectorAll('#book-list .book-item');

    bookItems.forEach(item => {
        const title = item.querySelector('.book-title').textContent.toLowerCase();
        const author = item.querySelector('div:nth-child(2)').textContent.toLowerCase();
        if (title.includes(searchText) || author.includes(searchText)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Initialiser la liste des livres au chargement
initializeBookListListener();

// Ajouter un écouteur pour la barre de recherche
document.getElementById('search-book').addEventListener('input', filterBookList);
