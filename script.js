import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, push, child, get } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// Your web app's Firebase configuration
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

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Références aux données dans la base de données
const stocksRef = ref(database, 'stocks');
const booksDataRef = ref(database, 'booksData');

// Fonction de gestion de la recherche par ISBN
document.getElementById('isbn-form').addEventListener('submit', function(event) {
    event.preventDefault();
    const isbn = document.getElementById('isbn').value.trim();

    // Validation basique de l'ISBN
    if (!isValidISBN(isbn)) {
        alert("Veuillez entrer un ISBN valide (ex: 10 ou 13 chiffres).");
        return;
    }

    // Masquer les informations du livre (au cas où elles étaient affichées)
    document.getElementById('book-info').classList.add('hidden');

    fetchBookData(isbn);
});

// Fonction de validation de l'ISBN (simple vérification de longueur)
function isValidISBN(isbn) {
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
}

// Récupération des données du livre (depuis Firebase ou l'API Google Books)
async function fetchBookData(isbn) {
    // Vérifier si le livre est déjà dans la base de données Firebase
    const snapshot = await get(child(booksDataRef, isbn));
    if (snapshot.exists()) {
        const book = snapshot.val();
        displayBookData(isbn, book);
    } else {
        // Faire la requête à l'API Google Books
        const apiUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erreur HTTP ! statut : ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.totalItems > 0) {
                    const book = data.items[0].volumeInfo;
                    const coverImage = book.imageLinks && book.imageLinks.thumbnail ? book.imageLinks.thumbnail : 'image.png';
                    const bookData = {
                        title: book.title || 'Titre non disponible',
                        author: book.authors ? book.authors.join(', ') : 'Auteur inconnu',
                        summary: book.description || 'Aucun résumé disponible.',
                        cover: coverImage
                    };

                    // Enregistrer les données du livre dans Firebase
                    set(ref(database, 'booksData/' + isbn), bookData);

                    // Afficher les informations du livre
                    displayBookData(isbn, bookData);
                } else {
                    alert('Aucun livre trouvé avec cet ISBN.');
                }
            })
            .catch(error => {
                alert(`Une erreur est survenue : ${error.message}`);
            });
    }
}

// Fonction pour afficher les données du livre
function displayBookData(isbn, bookData) {
    document.getElementById('title').innerText = bookData.title;
    document.getElementById('author').innerText = bookData.author;
    document.getElementById('summary').innerText = bookData.summary;
    document.getElementById('cover').src = bookData.cover;

    // Afficher les informations du livre MAINTENANT que l'ISBN est valide
    document.getElementById('book-info').classList.remove('hidden');

    // Afficher la section "Mettre à jour le stock"
    displayStock(isbn);
    document.getElementById('stock-form').classList.remove('hidden');
}

// Fonction pour afficher et mettre à jour le stock
function displayStock(isbn) {
    const stockElement = document.getElementById('stock');
    const stockForm = document.getElementById('stock-form');
    const updateStockButton = stockForm.querySelector('button');

    // Récupérer le stock actuel depuis Firebase
    onValue(ref(database, 'stocks/' + isbn), (snapshot) => {
        const stockValue = snapshot.val();

        // Vérification du stock pour l'ISBN
        if (stockValue !== null) {
            if (stockValue > 0) {
                stockElement.innerText = `En stock : ${stockValue} exemplaires`;
                stockElement.classList.add('in-stock');
                stockElement.classList.remove('out-of-stock');
            } else {
                stockElement.innerText = 'Hors stock';
                stockElement.classList.add('out-of-stock');
                stockElement.classList.remove('in-stock');
            }
        } else {
            stockElement.innerText = 'ISBN inconnu dans la base de données. Ajoutez une quantité.';
            stockElement.classList.remove('in-stock', 'out-of-stock');
        }
    });

    // Gérer la mise à jour du stock
    stockForm.onsubmit = function(event) {
        event.preventDefault();
        const newStock = parseInt(document.getElementById('new-stock').value);

        if (!isNaN(newStock) && newStock >= 0) {
            // Mettre à jour le stock dans Firebase
            set(ref(database, 'stocks/' + isbn), newStock);

            // Mettre à jour l'affichage après modification
            if (newStock > 0) {
                stockElement.innerText = `En stock : ${newStock} exemplaires`;
                stockElement.classList.add('in-stock');
                stockElement.classList.remove('out-of-stock');
            } else {
                stockElement.innerText = 'Hors stock';
                stockElement.classList.add('out-of-stock');
                stockElement.classList.remove('in-stock');
            }

            // Changer la couleur du bouton après la mise à jour (vert)
            updateStockButton.style.backgroundColor = '#5cb85c';

            // Actualiser la page (vous pouvez optimiser cela pour ne mettre à jour que la liste des livres)
            location.reload();
        } else {
            alert('Veuillez entrer une quantité valide.');
        }
    };
}

// Fonction pour supprimer un livre
function deleteBook(isbn) {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le livre avec l'ISBN ${isbn} ?`)) {
        // Supprimer le livre de stocks et booksData dans Firebase
        remove(ref(database, 'stocks/' + isbn));
        remove(ref(database, 'booksData/' + isbn));

        // Mettre à jour la liste des livres
        updateBookList();
    }
}

// Fonction pour mettre à jour la liste des livres
function updateBookList() {
    const bookListElement = document.getElementById('book-list');
    bookListElement.innerHTML = ''; // Réinitialiser la liste

    // Récupérer les données de stocks et booksData depuis Firebase
    Promise.all([get(stocksRef), get(booksDataRef)])
        .then(([stocksSnapshot, booksDataSnapshot]) => {
            const stocks = stocksSnapshot.val() || {};
            const booksData = booksDataSnapshot.val() || {};

            for (const isbn in stocks) {
                if (booksData[isbn]) {
                    const bookData = booksData[isbn];
                    const bookItem = document.createElement('div');
                    bookItem.classList.add('book-item');
                    bookItem.innerHTML = `
                        <div class="book-title">${bookData.title}</div>
                        <div>ISBN : ${isbn}</div>
                        <div>Auteur : ${bookData.author}</div>
                        <div>Résumé : ${bookData.summary}</div>
                        <div class="stock-info ${stocks[isbn] > 0 ? 'in-stock' : 'out-of-stock'}">
                            ${stocks[isbn] > 0 ? `En stock : ${stocks[isbn]} exemplaires` : 'Hors stock'}
                        </div>
                        <button class="delete-button" data-isbn="${isbn}">Supprimer</button>
                    `;
                    bookListElement.appendChild(bookItem);

                    // Ajouter un écouteur d'événement au bouton "Supprimer"
                    const deleteButton = bookItem.querySelector('.delete-button');
                    deleteButton.addEventListener('click', function() {
                        deleteBook(isbn);
                    });
                } else {
                    console.warn(`Données manquantes pour l'ISBN : ${isbn}`);
                }
            }
        })
        .catch(error => {
            console.error("Erreur lors de la récupération des données :", error);
        });
}

// Fonction pour filtrer la liste des livres par titre et auteur
function filterBookList() {
    const searchText = document.getElementById('search-book').value.toLowerCase();
    const bookItems = document.querySelectorAll('#book-list .book-item');

    bookItems.forEach(item => {
        const title = item.querySelector('.book-title').textContent.toLowerCase();
        const author = item.querySelector('div:nth-child(3)').textContent.toLowerCase(); // Cibler le 3ème div (auteur)
        if (title.includes(searchText) || author.includes(searchText)) {
            item.style.display = 'block'; // Afficher l'élément
        } else {
            item.style.display = 'none'; // Masquer l'élément
        }
    });
}

// Initialiser la liste des livres au chargement de la page
updateBookList();

// Ajouter un écouteur d'événement à la barre de recherche pour filtrer la liste en temps réel
document.getElementById('search-book').addEventListener('input', filterBookList);
