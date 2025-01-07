// Tableau simulant les stocks par ISBN
let stocks = JSON.parse(localStorage.getItem('stocks')) || {
    "9783161484100": 10,  // Exemple ISBN avec 10 exemplaires
    "9781234567897": 0,   // Exemple ISBN avec 0 exemplaires (Hors stock)
};

// Tableau simulant les informations des livres par ISBN
// Charger booksData depuis localStorage OU utiliser l'objet initial s'il n'y a rien dans localStorage
let booksData = JSON.parse(localStorage.getItem('booksData')) || {
    "9783161484100": {
        title: "Le Petit Prince",
        author: "Antoine de Saint-Exupéry",
        summary: "Un aviateur échoue dans le désert du Sahara et rencontre un jeune prince qui vient d'une autre planète.",
        cover: "image.png"
    },
    "9781234567897": {
        title: "1984",
        author: "George Orwell",
        summary: "Un roman dystopique sur un régime totalitaire qui surveille chaque aspect de la vie humaine.",
        cover: "image.png"
    }
};

// Fonction pour sauvegarder les stocks dans le localStorage
function saveStocks() {
    localStorage.setItem('stocks', JSON.stringify(stocks));
}

// Fonction pour sauvegarder booksData dans le localStorage
function saveBooksData() {
    localStorage.setItem('booksData', JSON.stringify(booksData));
}

// Fonction de gestion de la recherche par ISBN
document.getElementById('isbn-form').addEventListener('submit', function(event) {
    event.preventDefault(); // Empêcher le rechargement de la page lors de la soumission du formulaire
    const isbn = document.getElementById('isbn').value.trim(); // Récupérer l'ISBN saisi et enlever les espaces avant et après

    // Validation basique de l'ISBN
    if (!isValidISBN(isbn)) {
        alert("Veuillez entrer un ISBN valide (ex: 10 ou 13 chiffres).");
        return; // Arrêter la fonction si l'ISBN n'est pas valide
    }

    // Masquer les informations du livre (au cas où elles étaient affichées)
    document.getElementById('book-info').classList.add('hidden');

    fetchBookData(isbn); // Lancer la recherche du livre par ISBN
});

// Fonction de validation de l'ISBN (simple vérification de longueur)
function isValidISBN(isbn) {
    // Vérifier si l'ISBN a une longueur de 10 ou 13 caractères et si ce n'est pas NaN
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
}

// Fonction de récupération des données du livre (depuis booksData ou l'API Google Books)
function fetchBookData(isbn) {
    if (booksData[isbn]) {
        // Utiliser les données locales si disponibles
        const book = booksData[isbn];
        document.getElementById('title').innerText = book.title || 'Titre non disponible';
        document.getElementById('author').innerText = book.author || 'Auteur inconnu';
        document.getElementById('summary').innerText = book.summary || 'Aucun résumé disponible.';
        document.getElementById('cover').src = book.cover || 'image.png'; // Image par défaut

        // Afficher les informations du livre MAINTENANT que l'ISBN est valide
        document.getElementById('book-info').classList.remove('hidden');

        // Afficher la section "Mettre à jour le stock"
        displayStock(isbn);
        document.getElementById('stock-form').classList.remove('hidden');
    } else {
        // Faire la requête à l'API Google Books
        const apiUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;

        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erreur HTTP ! statut : ${response.status}`);
                }
                return response.json(); // Convertir la réponse en JSON
            })
            .then(data => {
                if (data.totalItems > 0) {
                    // Extraire les informations du premier livre trouvé
                    const book = data.items[0].volumeInfo;
                    document.getElementById('title').innerText = book.title || 'Titre non disponible';
                    document.getElementById('author').innerText = book.authors ? book.authors.join(', ') : 'Auteur inconnu';
                    document.getElementById('summary').innerText = book.description || 'Aucun résumé disponible.';

                    // Charger l'image de couverture ou utiliser une image par défaut
                    const coverImage = book.imageLinks && book.imageLinks.thumbnail
                        ? book.imageLinks.thumbnail
                        : 'image.png';
                    document.getElementById('cover').src = coverImage;

                    // Stocker les données dans booksData pour éviter des requêtes futures
                    booksData[isbn] = {
                        title: book.title,
                        author: book.authors ? book.authors.join(', ') : 'Auteur inconnu',
                        summary: book.description,
                        cover: coverImage
                    };

                    // Sauvegarder booksData dans localStorage
                    saveBooksData();

                    // Afficher les informations du livre MAINTENANT que l'ISBN est valide
                    document.getElementById('book-info').classList.remove('hidden');

                    // Afficher la section "Mettre à jour le stock"
                    displayStock(isbn);
                    document.getElementById('stock-form').classList.remove('hidden');
                } else {
                    alert('Aucun livre trouvé avec cet ISBN.');
                }
            })
            .catch(error => {
                alert(`Une erreur est survenue : ${error.message}`);
            });
    }
}

// Fonction pour afficher et mettre à jour le stock
function displayStock(isbn) {
    const stockElement = document.getElementById('stock');
    const stockForm = document.getElementById('stock-form');
    const updateStockButton = stockForm.querySelector('button'); // Cibler le bouton

    // Vérification du stock pour l'ISBN
    if (isbn in stocks) {
        if (stocks[isbn] > 0) {
            stockElement.innerText = `En stock : ${stocks[isbn]} exemplaires`;
            stockElement.classList.add('in-stock');
            stockElement.classList.remove('out-of-stock');
        } else {
            stockElement.innerText = 'Hors stock';
            stockElement.classList.add('out-of-stock');
            stockElement.classList.remove('in-stock');
        }
    } else {
        stockElement.innerText = ' ISBN inconnu dans la base de données locale. Ajoutez une quantité.';
        stockElement.classList.remove('in-stock', 'out-of-stock');
    }

    // Gérer la mise à jour du stock
    stockForm.onsubmit = function(event) {
        event.preventDefault(); // Empêcher le rechargement de la page
        const newStock = parseInt(document.getElementById('new-stock').value); // Récupérer la nouvelle valeur du stock

        if (!isNaN(newStock) && newStock >= 0) {
            stocks[isbn] = newStock; // Mettre à jour le stock dans l'objet stocks

            // Mettre à jour l'affichage après modification
            if (newStock > 0) {
                stockElement.innerText = `En stock : ${stocks[isbn]} exemplaires`;
                stockElement.classList.add('in-stock');
                stockElement.classList.remove('out-of-stock');
            } else {
                stockElement.innerText = 'Hors stock';
                stockElement.classList.add('out-of-stock');
                stockElement.classList.remove('in-stock');
            }

            // Changer la couleur du bouton après la mise à jour (vert)
            updateStockButton.style.backgroundColor = '#5cb85c';

            // Supprimer la boite de dialogue
            // alert(`Le stock a été mis à jour à ${stocks[isbn]} exemplaires.`);

            // Sauvegarder les modifications dans le localStorage
            saveStocks();
            // Actualiser la page après la modification
            location.reload();
            // updateBookList();
        } else {
            alert('Veuillez entrer une quantité valide.');
        }
    };
}

// Fonction pour supprimer un livre
function deleteBook(isbn) {
    // Demander une confirmation avant de supprimer le livre
    if (confirm(`Êtes-vous sûr de vouloir supprimer le livre avec l'ISBN ${isbn} ?`)) {
        // Supprimer le livre de stocks et booksData
        delete stocks[isbn];
        delete booksData[isbn];

        // Sauvegarder les modifications dans le localStorage
        saveStocks();
        saveBooksData();

        // Mettre à jour la liste des livres
        updateBookList();
    }
}

// Fonction pour mettre à jour la liste des livres
function updateBookList() {
    const bookListElement = document.getElementById('book-list');
    bookListElement.innerHTML = ''; // Réinitialiser la liste

    for (const isbn in stocks) {
        const bookData = booksData[isbn];
        if (bookData) {
            // Créer un élément div pour chaque livre
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
                deleteBook(isbn); // Appeler la fonction deleteBook avec l'ISBN du livre
            });
        } else {
            console.warn(`Données manquantes pour l'ISBN : ${isbn}`);
        }
    }
}

// Fonction pour filtrer la liste des livres par titre et auteur
function filterBookList() {
    const searchText = document.getElementById('search-book').value.toLowerCase(); // Récupérer le texte de recherche en minuscules
    const bookItems = document.querySelectorAll('#book-list .book-item'); // Sélectionner tous les éléments de la liste des livres

    bookItems.forEach(item => {
        const title = item.querySelector('.book-title').textContent.toLowerCase(); // Récupérer le titre du livre en minuscules
        const author = item.querySelectorAll('div')[2].textContent.toLowerCase(); // Récupérer l'auteur du livre en minuscules
        const authorWithoutPrefix = author.replace(/^auteur\s*:\s*/i, '');

        // Vérifier si le titre ou l'auteur contient le texte de recherche
        if (title.includes(searchText) || authorWithoutPrefix.includes(searchText)) {
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