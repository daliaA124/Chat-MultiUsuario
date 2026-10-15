
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const loginError = document.getElementById("login-error");

const connectionStatus = document.getElementById("connection-status");
const leaveButton = document.getElementById("leave-button");
const userCount = document.getElementById("user-count");
const userList = document.getElementById("user-list");

const messages = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

let socket = null;
let username = "";
let intentionalClose = false;
let connectionTimeout = null;


function showMessage(author, content, timestamp) {
    const article = document.createElement("article");
    article.className = "message";

    const top = document.createElement("div");
    top.className = "message-top";

    const name = document.createElement("span");
    name.className = "message-name";
    name.textContent = author;

    const time = document.createElement("time");
    time.className = "message-time";

    if (timestamp) {
        const date = new Date(timestamp);

        time.dateTime = timestamp;
        time.textContent = date.toLocaleString("es-MX", {
            dateStyle: "short",
            timeStyle: "medium"
        });
    }

    const body = document.createElement("p");
    body.className = "message-content";
    body.textContent = content;

    top.append(name, time);
    article.append(top, body);
    messages.appendChild(article);

    messages.scrollTop = messages.scrollHeight;
}


function showSystemMessage(content, timestamp) {
    const item = document.createElement("div");
    item.className = "system-message";

    let timeText = "";

    if (timestamp) {
        timeText = new Date(timestamp).toLocaleTimeString("es-MX");
    }

    item.textContent = timeText
        ? `${timeText} — ${content}`
        : content;

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}


function renderUsers(users) {
    userList.replaceChildren();

    users.forEach((name) => {
        const item = document.createElement("li");
        const dot = document.createElement("span");

        dot.className = "user-dot";
        item.append(dot, document.createTextNode(name));

        userList.appendChild(item);
    });

    userCount.textContent =
        `${users.length} conectado${users.length === 1 ? "" : "s"}`;
}


function connectToChat(name) {
    username = name;
    intentionalClose = false;

    loginError.textContent = "";
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    connectionStatus.textContent = "Conectando...";
    messages.replaceChildren();
    renderUsers([]);

    const protocol =
        window.location.protocol === "https:" ? "wss:" : "ws:";

    const url =
        `${protocol}//${window.location.host}/ws/${encodeURIComponent(username)}`;

    socket = new WebSocket(url);

    connectionTimeout = setTimeout(() => {
        if (socket && socket.readyState === WebSocket.CONNECTING) {
            connectionStatus.textContent =
                "El servidor no responde. Intenta nuevamente.";
            socket.close();
        }
    }, 10000);

    socket.addEventListener("open", () => {
        clearTimeout(connectionTimeout);
        connectionStatus.textContent = `Conectado como ${username}`;
        messageInput.focus();
    });

    socket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
            showMessage(
                data.username,
                data.content,
                data.timestamp
            );
        } else if (data.type === "system") {
            showSystemMessage(data.content, data.timestamp);
        } else if (data.type === "users") {
            renderUsers(data.users);
        } else if (data.type === "error") {
            loginError.textContent = data.content;
            connectionStatus.textContent = data.content;
        }
    });

    socket.addEventListener("error", () => {
        connectionStatus.textContent =
            "Error de conexión. Revisa el servidor y la red.";
    });

    socket.addEventListener("close", () => {
        clearTimeout(connectionTimeout);
        renderUsers([]);

        if (intentionalClose) {
            chatScreen.classList.add("hidden");
            loginScreen.classList.remove("hidden");
            loginError.textContent = "";
        } else {
            connectionStatus.textContent =
                "Conexión cerrada. Puedes salir e intentar de nuevo.";
        }
    });
}


loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = usernameInput.value.trim();

    if (!name) {
        loginError.textContent = "Escribe un nombre para continuar.";
        return;
    }

    if (name.length > 30) {
        loginError.textContent =
            "El nombre no puede superar 30 caracteres.";
        return;
    }

    connectToChat(name);
});


messageForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const content = messageInput.value.trim();

    if (!content) {
        return;
    }

    if (content.length > 1000) {
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectionStatus.textContent = "No hay conexión con el servidor.";
        return;
    }

    socket.send(content);
    messageInput.value = "";
    messageInput.focus();
});


leaveButton.addEventListener("click", () => {
    intentionalClose = true;

    if (socket) {
        socket.close();
    } else {
        chatScreen.classList.add("hidden");
        loginScreen.classList.remove("hidden");
    }
});
