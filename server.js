'use strict';

const Socket = require('ws');
const pg = require('pg');
let current_session = {};
const createUUID = ()=>{
    var s = [];
    var hexDigits = "abcdef";
    for (var i = 0; i < 36; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    s[14] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
    s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
    s[8] = s[13] = s[18] = s[23] = "_";

    return s.join("");
};
const resendMessageToTargetUser = (sender_guid, target_login, message)=>{
    db.query('SELECT session_id FROM users WHERE login=\'' + target_login + '\'').then((data)=>{
        let target_session = data.rows[0].session_id;
        db.query('SELECT login FROM users WHERE session_id=\'' + sender_guid + '\'').then((data)=>{
            if(searchUserSession(target_session)) {
                searchUserSession(target_session).send(make_message('new_message', '200', 'Новое сообщение', {
                    sender: data.rows[0].login,
                    target: target_login,
                    message: message
                }));
            } else {
                searchUserSession(sender_guid).send(make_message('message_error', '401', 'user_offline', {
                    sender: target_login,
                    target: data.rows[0].login,
                    message: 'Пользователь офлайн'
                }));
            }
        })
    })
};
const searchUserSession = (guid) =>{
  for(let key in current_session){
     if(key == guid){
         return current_session[key];
     }
  }
  return false;
};
const deleteUserSession = (guid)=>{
  for(let key in current_session){
      if(key == guid){
          delete current_session[key];
          db.query('UPDATE users SET session_id=NULL WHERE session_id=\'' + guid + '\'');
      }
  }

};
let add_user_session = (guid, st, login) =>{
    Object.defineProperty(current_session, guid, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: st
    });
    db.query('UPDATE users SET session_id=\'' + guid + '\' WHERE login=\'' + login +'\'');
};
const db = new pg.Client('postgres://mmm_chat:matvey0501@127.0.0.1:5432/mmm_chat');
db.connect();
const make_message = (type, code, message_code, data) =>{
    return JSON.stringify({
        type: type,
        code: code,
        message_code: message_code,
        data: data?data:"no_data"
    })
};
const author = (message, client, st) =>{
    db.query('SELECT login, password FROM users WHERE login = \'' + message.login + '\'').then((data)=>{
        if(data.rows.length === 0) {
            st.send(make_message('author', '404', 'Пользователь с логином: ' + message.login + ' не найден, Вам необходимо зарегистрироваться.'));
        } else {
            if(message.pass !== data.rows[0].password){
                st.send(make_message('author', '405', 'Неверный пароль!'));
            } else {
                add_user_session(client.url, st, message.login);
                st.send(make_message('author', '200', 'Авторизация пройдена успешно!'));
            }
        }

    });
};
const saveMessage = (message)=>{
    db.query('SELECT chat_id FROM chats WHERE user1=\'' + message.sender_login + '\' AND user2=\'' + message.target_user + '\'').then((data)=>{
       if(data.rows.length === 0){
           let guid = createUUID();
           db.query('INSERT INTO chats (user1, user2, chat_id) VALUES (\'' + message.sender_login + '\',\'' + message.target_user + '\',\'' + guid + '\')');
           db.query('INSERT INTO chats (user1, user2, chat_id) VALUES (\'' + message.target_user + '\',\'' + message.sender_login + '\',\'' + guid + '\')');
           db.query('CREATE TABLE ' + guid + ' (sender varchar(100), message text, date TIMESTAMP(14) DEFAULT CURRENT_TIMESTAMP(14))');
           db.query('INSERT INTO ' + guid + ' (sender,message) VALUES (\'' + message.sender_login + '\',\'' + message.data + '\')');
       } else {
           db.query('INSERT INTO ' + data.rows[0].chat_id + ' (sender,message) VALUES (\'' + message.sender_login + '\',\'' + message.data + '\')');
       }
    });
};
const parseMessage = (message, client, st)=>{
    saveMessage(message);
    resendMessageToTargetUser(client.url, message.target_user, message.data);
};
const userSearch = (message, client, st)=>{
    db.query('SELECT count(login) FROM users WHERE login=\'' + message.data.searched_user + '\'').then((data)=>{
        if(data.rows[0].count === '1'){
            st.send(make_message('user_search', '200', 'Пользователь найден', {login: message.data.searched_user}));
        } else {
            st.send(make_message('user_search', '404', 'Пользователь не найден', {login: message.data.searched_user}));
        }
    });
};
const history = (message, client, st)=>{
    let history;
    db.query('SELECT chat_id FROM chats WHERE user1=\'' + message.sender_login + '\' AND user2=\'' + message.target_login + '\'').then((data)=>{
        if(data.rows.length === 0){
            st.send(make_message('chat_history', '404', 'History was not found'));
        } else {
            db.query('SELECT * FROM ' + data.rows[0].chat_id).then((history)=>{
                st.send(make_message('chat_history', '200', 'History was found', {
                    history: JSON.stringify(history.rows)
                }));
            });
        }
    });
};
const parseData = (message, client, st) => {
    switch (message.type) {
        case 'author':  author(message,client,st); break;
        case 'message': parseMessage(message, client, st); break;
        case 'user_search': userSearch(message, client, st); break;
        case 'chat_history': history(message, client, st); break;
    }
    
};
const Server = new Socket.Server({port: 5335});
Server.on('connection', (st, client) => {
   st.on('message', message => {
       parseData(JSON.parse(message), client, st);
   });
   st.on('close', ()=>{
       deleteUserSession(client.url);
   });
});