import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { db } from '../firebase';
import { ref, get, onValue, push, set, remove } from 'firebase/database';

export default function ChatsScreen({ recruiter }) {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const flatListRef = useRef(null);
    const unsubRef = useRef(null);
    const chatsUnsubRef = useRef(null);

    useEffect(() => {
        loadChats();
        return () => {
            if (unsubRef.current) unsubRef.current();
            if (chatsUnsubRef.current) chatsUnsubRef.current();
        };
    }, []);

    const loadChats = () => {
        setLoading(true);
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
        if (chatsUnsubRef.current) chatsUnsubRef.current();
        chatsUnsubRef.current = onValue(ref(db, 'chats'), snap => {
            const all = snap.val() || {};
            const list = Object.entries(all)
                .filter(([id, c]) =>
                    (c.refCode || '').toUpperCase() === recruiter.code.toUpperCase() &&
                    !c.archived &&
                    (c.createdAt || 0) >= cutoff
                )
                .sort(([, a], [, b]) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
                .map(([id, c]) => ({ id, ...c }));
            setChats(list);
            setLoading(false);
        });
    };

    const openChat = (chat) => {
        setActiveChat(chat);
        setMessages([]);
        if (unsubRef.current) unsubRef.current();
        unsubRef.current = onValue(ref(db, `messages/${chat.id}`), snap => {
            const data = snap.val() || {};
            const sorted = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
            setMessages(sorted);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });
    };

    const sendMessage = () => {
        const text = inputText.trim();
        if (!text || !activeChat) return;
        const msgRef = push(ref(db, `messages/${activeChat.id}`));
        set(msgRef, {
            sender: recruiter.name,
            senderType: 'recruiter',
            text,
            timestamp: Date.now()
        });
        set(ref(db, `chats/${activeChat.id}/lastMessage`), text);
        set(ref(db, `chats/${activeChat.id}/lastMessageAt`), Date.now());
        set(ref(db, `chats/${activeChat.id}/lastSenderType`), 'recruiter');
        setInputText('');
    };

    const archivarChat = (chatId) => {
        Alert.alert('Archivar', '¿Archivar esta conversación?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Archivar', style: 'destructive', onPress: () => {
                set(ref(db, `chats/${chatId}/archived`), true);
                if (activeChat?.id === chatId) setActiveChat(null);
            }}
        ]);
    };

    // Vista mensajes
    if (activeChat) {
        return (
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.chatHeader}>
                    <TouchableOpacity onPress={() => { setActiveChat(null); if (unsubRef.current) unsubRef.current(); }}>
                        <Text style={styles.backBtn}>← Volver</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.chatHeaderName} numberOfLines={1}>{activeChat.candidateName}</Text>
                        <Text style={styles.chatHeaderSub} numberOfLines={1}>💼 {activeChat.vacantTitle}</Text>
                        <Text style={styles.chatHeaderSub}>📱 {activeChat.candidatePhone}</Text>
                    </View>
                    <TouchableOpacity onPress={() => archivarChat(activeChat.id)} style={styles.archiveBtn}>
                        <Text style={{ color: '#ffcdd2', fontSize: 12 }}>🗑️</Text>
                    </TouchableOpacity>
                </View>

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(_, i) => i.toString()}
                    contentContainerStyle={{ padding: 16 }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    renderItem={({ item }) => {
                        const isMe = item.senderType === 'recruiter';
                        const time = new Date(item.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                        return (
                            <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                                    {!isMe && <Text style={styles.bubbleSender}>{item.sender}</Text>}
                                    <Text style={styles.bubbleText}>{item.text}</Text>
                                    <Text style={styles.bubbleTime}>{time}</Text>
                                </View>
                            </View>
                        );
                    }}
                />

                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.chatInput}
                        placeholder="Escribe tu respuesta..."
                        value={inputText}
                        onChangeText={setInputText}
                        onSubmitEditing={sendMessage}
                        returnKeyType="send"
                        multiline
                    />
                    <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                        <Text style={{ color: 'white', fontSize: 18 }}>➤</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        );
    }

    // Vista lista chats
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>💬 Conversaciones</Text>
            </View>
            {loading ? <ActivityIndicator size="large" color="#1a237e" style={{ marginTop: 40 }} /> :
                chats.length === 0 ?
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No hay conversaciones aún</Text>
                        <TouchableOpacity onPress={loadChats} style={{ marginTop: 12 }}>
                            <Text style={{ color: '#1a237e' }}>🔄 Recargar</Text>
                        </TouchableOpacity>
                    </View> :
                    <FlatList
                        data={chats}
                        keyExtractor={item => item.id}
                        refreshing={loading}
                        onRefresh={loadChats}
                        renderItem={({ item }) => {
                            const timeAgo = item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                            const diasRestantes = Math.max(0, 7 - Math.floor((Date.now() - (item.createdAt || 0)) / (1000 * 60 * 60 * 24)));
                            return (
                                <TouchableOpacity style={styles.chatItem} onPress={() => openChat(item)}>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={styles.chatName}>👤 {item.candidateName}</Text>
                                            <Text style={styles.chatTime}>{timeAgo}</Text>
                                        </View>
                                        <Text style={styles.chatVacant}>💼 {item.vacantTitle}</Text>
                                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                            <Text style={styles.chatPhone}>📱 {item.candidatePhone}</Text>
                                            <Text style={[styles.chatDias, { color: diasRestantes <= 2 ? '#e53935' : '#aaa' }]}>⏳ {diasRestantes}d</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => archivarChat(item.id)} style={{ padding: 8 }}>
                                        <Text style={{ color: '#ffcdd2', fontSize: 16 }}>🗑️</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            );
                        }}
                    />
            }
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#1a237e', padding: 16, paddingTop: 20 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: '#aaa', fontSize: 15 },
    chatItem: { backgroundColor: 'white', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center' },
    chatName: { fontSize: 15, fontWeight: '700', color: '#222' },
    chatTime: { fontSize: 11, color: '#aaa' },
    chatVacant: { fontSize: 12, color: '#1a237e', marginTop: 2 },
    chatPhone: { fontSize: 11, color: '#aaa' },
    chatDias: { fontSize: 10 },
    chatHeader: { backgroundColor: '#1a237e', padding: 16, paddingTop: 20, flexDirection: 'row', alignItems: 'center' },
    backBtn: { color: 'white', fontSize: 15 },
    chatHeaderName: { color: 'white', fontWeight: '700', fontSize: 14 },
    chatHeaderSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 1 },
    archiveBtn: { padding: 8 },
    bubble: { maxWidth: '75%', borderRadius: 12, padding: 10 },
    bubbleMe: { backgroundColor: '#e3f2fd', borderBottomRightRadius: 0 },
    bubbleThem: { backgroundColor: 'white', borderBottomLeftRadius: 0, borderWidth: 1, borderColor: '#eee' },
    bubbleSender: { fontSize: 11, fontWeight: '700', color: '#e53935', marginBottom: 2 },
    bubbleText: { fontSize: 14, color: '#222' },
    bubbleTime: { fontSize: 10, color: '#aaa', textAlign: 'right', marginTop: 2 },
    inputRow: { flexDirection: 'row', padding: 10, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', gap: 8, alignItems: 'flex-end' },
    chatInput: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
    sendBtn: { backgroundColor: '#1a237e', borderRadius: 50, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});