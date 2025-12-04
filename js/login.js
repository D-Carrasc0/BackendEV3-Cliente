// Listener para cuando el usuario haga un "submit" al formulario
document.getElementById('login-form').addEventListener('submit', async (event) => {
    // Evita que el formulario recargue la pagina y haga el submit (evento por defecto)
    event.preventDefault();
    
    // Obtiene los valores ingresador por el usuario
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // Envia un peticion POST al endpoint de JWT para obtener tokens
    const response = await fetch('https://sistema-de-registro-de-visitas.onrender.com/api/token/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: username,
            password: password,
        }),
    });

    // Intenta parsear la respuesta como JSON
    const data = await response.json();

    // Si la respuesta fue exitosa
    if (response.ok) {
        localStorage.setItem('access_token', data.access);
        alert('¡Inicio de sesión exitoso!');
        window.location.href = './dashboard.html';  // Redirigir a la página de registros
    } else {
        // Si las credenciales son invalidas muestra el mensaje de error
        document.getElementById('error-message').style.display = 'block';
    }
});