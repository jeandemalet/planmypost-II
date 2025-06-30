document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier si l'utilisateur est un admin
    try {
        const statusRes = await fetch('/api/auth/status');
        const statusData = await statusRes.json();
        if (!statusData.loggedIn || statusData.user.role !== 'admin') {
            alert("Accès refusé.");
            window.location.href = '/index.html';
            return;
        }

        if (statusData.user.impersonatedBy) {
            document.getElementById('impersonation-banner').style.display = 'block';
            document.getElementById('impersonated-user-name').textContent = statusData.user.name;
        }

        loadUsers();

    } catch (error) {
        console.error(error);
        window.location.href = '/index.html';
    }
});

async function loadUsers() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '<li>Chargement des utilisateurs...</li>';

    try {
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        userList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${user.displayName} (${user.email})</span>
                <button data-user-id="${user._id}">Voir les galeries</button>
                <button data-impersonate-id="${user._id}">Prendre le contrôle (Impersonate)</button>
            `;
            userList.appendChild(li);
        });
    } catch (error) {
        userList.innerHTML = `<li>Erreur: ${error.message}</li>`;
    }
}

document.getElementById('user-list').addEventListener('click', async (e) => {
    const userId = e.target.dataset.impersonateId;
    if (userId) {
        if (confirm(`Voulez-vous vraiment prendre le contrôle du compte de cet utilisateur ? Votre session actuelle sera remplacée par la sienne.`)) {
            try {
                const res = await fetch('/api/auth/impersonate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIdToImpersonate: userId })
                });
                const data = await res.json();
                if (res.ok) {
                    alert(data.message);
                    window.location.href = '/index.html';
                } else {
                    throw new Error(data.message);
                }
            } catch (error) {
                alert(`Erreur: ${error.message}`);
            }
        }
    }
});

// Gérer la fin de l'usurpation d'identité
document.getElementById('stop-impersonation-btn')?.addEventListener('click', async () => {
    // La façon la plus simple est de se déconnecter puis de se reconnecter
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/welcome.html';
});