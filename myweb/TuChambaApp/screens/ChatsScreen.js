import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
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

    useEffect(() => {
        loadChats();
        return () => { if (unsubRef.current) unsubRef.current(); };
    }, []);

    const loadChats = () => {
        setLoading(true);
        get(ref(db, 'chats')).then(snap => {
            const all = snap.val() || {};
            let list = Object.entries(all)
                .filter(([id, c]) => c.refCode === recruiter.code)
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
        setInputText('');
    };

    const deleteOldChats = () => {
        Alert.alert('Borrar chats', '¿Borrar conversaciones con más de 7 días?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Borrar', style: 'destructive', onPress: async () => {
                    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
                    const snap = await get(ref(db, 'chats'));
                    const all = snap.val() || {};
                    const promises = [];
                    Object.entries(all).forEach(([chatId, c]) => {
                        if ((c.createdAt || 0) < cutoff && c.refCode === recruiter.code) {
                            promises.push(remove(ref(db, `chats/${chatId}`)));
                            promises.push(remove(ref(db, `messages/${chatId}`)));
                        }
                    });
                    await Promise.all(promises);
                    loadChats();
                    Alert.alert('Listo', 'Conversaciones viejas eliminadas');
                }
            }
        ]);
    };

    // Vista de mensajes de un chat activo
    if (activeChat) {
        return (
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.chatHeader}>
                    <TouchableOpacity onPress={() => { setActiveChat(null); if (unsubRef.current) unsubRef.current(); }}>
                        <Text style={styles.backBtn}>← Volver</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.chatHeaderName}>{activeChat.candidateName}</Text>
                        <Text style={styles.chatHeaderSub}>💼 {activeChat.vacantTitle} · 📱 {activeChat.candidatePhone}</Text>
                    </View>
                </View>

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(_, i) => i.toString()}
                    contentContainerStyle={{ padding: 16 }}
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
                    />
                    <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                        <Text style={{ color: 'white', fontSize: 18 }}>➤</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        );
    }

    // Vista de lista de chats
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>💬 Mis Conversaciones</Text>
                <TouchableOpacity onPress={deleteOldChats} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>🗑️ +7 días</Text>
                </TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator size="large" color="#0a66c2" style={{ marginTop: 40 }} /> :
                chats.length === 0 ?
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No hay conversaciones aún</Text>
                        <TouchableOpacity onPress={loadChats} style={styles.refreshBtn}>
                            <Text style={{ color: '#0a66c2' }}>🔄 Recargar</Text>
                        </TouchableOpacity>
                    </View> :
                    <FlatList
                        data={chats}
                        keyExtractor={item => item.id}
                        onRefresh={loadChats}
                        refreshing={loading}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.chatItem} onPress={() => openChat(item)}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.chatName}>👤 {item.candidateName}</Text>
                                    <Text style={styles.chatVacant}>💼 {item.vacantTitle}</Text>
                                    <Text style={styles.chatLast}>{item.lastMessage || 'Sin mensajes'}</Text>
                                    <Text style={styles.chatPhone}>📱 {item.candidatePhone}</Text>
                                </View>
                                <Text style={styles.chatArrow}>›</Text>
                            </TouchableOpacity>
                        )}
                    />
            }
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#1a237e', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
    deleteBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 6 },
    deleteBtnText: { color: 'white', fontSize: 12 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: '#aaa', fontSize: 15, marginBottom: 12 },
    refreshBtn: { padding: 10 },
    chatItem: { backgroundColor: 'white', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center' },
    chatName: { fontSize: 15, fontWeight: '700', color: '#222' },
    chatVacant: { fontSize: 12, color: '#0a66c2', marginTop: 2 },
    chatLast: { fontSize: 12, color: '#666', marginTop: 2 },
    chatPhone: { fontSize: 11, color: '#aaa', marginTop: 2 },
    chatArrow: { fontSize: 24, color: '#ccc', marginLeft: 8 },
    chatHeader: { backgroundColor: '#1a237e', padding: 16, flexDirection: 'row', alignItems: 'center' },
    backBtn: { color: 'white', fontSize: 16 },
    chatHeaderName: { color: 'white', fontWeight: '700', fontSize: 15 },
    chatHeaderSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
    bubble: { maxWidth: '75%', borderRadius: 12, padding: 10, marginBottom: 2 },
    bubbleMe: { backgroundColor: '#e3f2fd', borderBottomRightRadius: 0 },
    bubbleThem: { backgroundColor: 'white', borderBottomLeftRadius: 0, borderWidth: 1, borderColor: '#eee' },
    bubbleSender: { fontSize: 11, fontWeight: '700', color: '#e53935', marginBottom: 2 },
    bubbleText: { fontSize: 14, color: '#222' },
    bubbleTime: { fontSize: 10, color: '#aaa', textAlign: 'right', marginTop: 2 },
    inputRow: { flexDirection: 'row', padding: 10, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', gap: 8 },
    chatInput: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
    sendBtn: { backgroundColor: '#1a237e', borderRadius: 50, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});