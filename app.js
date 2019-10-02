const createUUID = ()=>{
    var s = [];
    var hexDigits = "0123456789abcdef";
    for (var i = 0; i < 36; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    s[14] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
    s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
    s[8] = s[13] = s[18] = s[23] = "-";

    return s.join("");
};
const waitForResponse = (elements, hideShow)=>{
    elements.forEach((item, i, arr)=>{
       if(hideShow){
           arr[i][0].style.opacity = '.4';
           arr[i][0].style.pointerEvents = 'none';
       } else {
           arr[i][0].style.opacity = '1';
           arr[i][0].style.pointerEvents = 'auto';
       }
    });
};
const requestHistory = (target_login)=>{
    socket.send(JSON.stringify({
        type: 'chat_history',
        sender_login: my_login,
        target_login: target_login
    }));
};
const successAuthor = ()=>{
    $('#status')[0].innerHTML = 'Онлайн';
    $('#author').hide(); $('#author_parent')[0].style.backgroundColor = 'green';
    $('#user_top_bar').show();
    $('#input_message_bar').show();
    $('#chat_block')[0].style.opacity = '1';
};
const authorHandling = (message)=>{
    switch (message.code) {
        case '200': successAuthor(); break;
        case '404': $('#status')[0].innerHTML = 'Офлайн'; alert('Неверный логин или пароль!'); break;
        case '405': $('#status')[0].innerHTML = 'Офлайн'; alert('Неверный логин или пароль!'); break;
    }
};
const addMessageToBlock = (sender,message_text)=>{
    $('#messages')[0].innerHTML += '<li>' + sender + ': ' + message_text + '</li>';
};
const newMessageHandling = (message)=>{
    let sender = message.data.sender;
    let current_chat = $('#chat_top_bar')[0].children[0]?$('#chat_top_bar')[0].children[0].id:'';
    if(sender!==current_chat){
        if(confirm('Пользователь ' + sender + ' хочет отправить вам сообщение.')){
            socket.send(JSON.stringify({
                type: 'message',
                target_user: sender,
                data: 'Пользователь присоединился к диалогу.'
            }));
            startChat(sender);
            addMessageToBlock(sender, message.data.message);
        } else {
            socket.send(JSON.stringify({
                type: 'message',
                target_user: sender,
                data: 'Пользователь отклонил приглашение.'
            }));
        }
    } else {
        addMessageToBlock(sender, message.data.message);
    }
};

const startChat = (button, list)=>{
    waitForResponse([$('#right_bar')], true);
    $('#messages')[0].innerHTML = '';
    let target_login = button.id?button.id.slice(5):button;
    requestHistory(target_login);
    if(list !== undefined){list.innerHTML = '';}
    let current_chat = document.createElement('current_chat');
    current_chat.id = target_login;
    current_chat.innerHTML = 'Диалог с пользователем ' + target_login;
    $('#chat_top_bar')[0].innerHTML = '';
    $('#chat_top_bar')[0].appendChild(current_chat);
};
const userSearchHandling = (message)=>{
    $('#user_top_bar')[0].dispatchEvent(user_search_response);
    $('#user_list')[0].innerHTML = '';
    if(message.code === '200') {
        let list = document.createElement('ul');
        let users = document.createElement('li');
        let user = document.createElement('button');
        list.style.width = '100%';
        list.style.paddingLeft = '0px';
        users.style.width = '100%';
        user.style.width = '100%';
        user.id = 'user_' + message.data.login;
        users.appendChild(user);
        user.innerHTML = 'Начать чат с пользователем ' + message.data.login;
        list.appendChild(user);
        $('#user_list')[0].appendChild(list);
        user.addEventListener('click', e=>{
           startChat(user, list);
        });
    } else {
        if(message.code === '404'){
            alert('Пользователь с таким именем не найден!');
        } else {
            alert('Во время поиска произошла ошибка, попробуйте позднее.');
        }
    }

};
const historyHandling = (message)=>{
    if(message.code === '200') {
        JSON.parse(message.data.history).forEach((item) => {
            addMessageToBlock(item.sender, item.message);
        });
    } else {
        if(message.code === '404'){
            addMessageToBlock('', 'New chat');
        }
    }
    waitForResponse([$('#right_bar')], false);
};
const parseMessage = (message)=>{
    message = JSON.parse(message.data);
    switch (message.type) {
        case 'author': authorHandling(message); break;
        case 'new_message': newMessageHandling(message); break;
        case 'user_search':  userSearchHandling(message); break;
        case 'message_error': newMessageHandling(message); break;
        case 'chat_history': historyHandling(message); break;
    }
};
window.onload = () => {
    $('#user_top_bar')[0].addEventListener('user_search_response', e=>{
        waitForResponse([$('#user_search'), $('#search_button')], false);
    });
    $('#right_bar')[0].addEventListener('chat_data_downloaded', e=>{

    });
    $('#chat_block')[0].style.opacity = '.2';
    $('#user_top_bar').hide();
    $('#input_message_bar').hide();
    const login = document.getElementById('login_in');
    const user_search = document.getElementById('search_button');
    const send = document.getElementById('send');
    socket.onmessage = response => {
        parseMessage(response);
    };
    socket.onopen = () => console.log('Online!');
    socket.onclose = () => console.log('Server Down!');
    login.addEventListener('click', e => {
        e.preventDefault();
        let log = $('#login')[0].value;
        let pass = $('#pass')[0].value;
        let author_message = {};
        author_message.type = 'author';
        author_message.login = log;
        author_message.pass = pass;
        socket.send(JSON.stringify(author_message));
        my_login = log;
    });
    send.addEventListener('click', e=>{
       e.preventDefault();
       let target_login = $('current_chat')[0].id;
       let data = $('#message')[0].value;
       socket.send(JSON.stringify({
           type: 'message',
           target_user: target_login,
           data: data,
           sender_login: my_login
       }));
        $('#message')[0].value = '';
        addMessageToBlock(my_login, data);
    });
    user_search.addEventListener('click', e=>{
       e.preventDefault();
       let data = $('#user_search')[0].value;
       socket.send(JSON.stringify({
           type: 'user_search',
           data: {
               searched_user: data
           }
       }));
       waitForResponse([$('#user_search'), $('#search_button')], true);
    });
};
let GUID = createUUID();
const socket = new WebSocket('ws://localhost:5335/' + GUID);
let my_login;
let user_search_response = new Event('user_search_response');
// NOT finished ->
let author_success = new Event('author_success');
let chat_data_downloaded = new Event('chat_data_downloaded');