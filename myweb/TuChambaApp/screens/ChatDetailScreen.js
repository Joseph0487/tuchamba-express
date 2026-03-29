import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { db } from '../firebase';
import { ref, onValue, push, set } from 'firebase/database';

export default function ChatDetailScreen({ chat, reclutador, onBack }) {
  const [messages, setMessages] = useState([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef(null);

  useEffect(() => {
    const msgsRef = ref(db, `messages/${chat.id}`);
    const unsub = onValue(msgsRef, (snapshot) => {
      if (!snapshot.exists()) { setMessages([]); setLoading(false); return; }
      const data = Object.values(snapshot.val()).sort((a, b) => a.timestamp - b.timestamp);
      setMessages(data);
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => unsub();
  }, []);

  async function enviarMensaje() {
    if (!texto.trim()) return;
    const msgRef = push(ref(db, `messages/${chat.id}`));
    await set(msgRef, {
      sender: reclutador.name,
      senderType: 'recruiter',
      text: texto.trim(),
      timestamp: Date.now(),
    });
    await set(ref(db, `chats/${chat.id}/lastSenderType`), 'recruiter');
    await set(ref(db, `chats/${chat.id}/lastMessageAt`), Date.now());
    setTexto('');
  }

  function renderMessage({ item }) {
    const isMe = item.senderType === 'recruiter';
    const time = new Date(item.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {!isMe && <Text style={styles.senderName}>{item.sender}</Text>}
          <Text style={styles.msgText}>{item.text}</Text>
          <Text style={styles.msgTime}>{time}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{chat.candidateName}</Text>
          <Text style={styles.headerVacant} numberOfLines={1}>{chat.vacantTitle || 'Vacante'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#0a66c2" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje..."
          placeholderTextColor="#64748b"
          value={texto}
          onChangeText={setTexto}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={enviarMensaje}>
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 14, paddingTop: 50, gap: 12 },
  back: { color: '#0a66c2', fontSize: 15, fontWeight: '600' },
  headerInfo: { flex: 1 },
  headerName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  headerVacant: { color: '#94a3b8', fontSize: 12 },
  msgRow: { marginBottom: 10, flexDirection: 'row' },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '75%', borderRadius: 14, padding: 12 },
  bubbleMe: { backgroundColor: '#0a66c2' },
  bubbleThem: { backgroundColor: '#1e293b' },
  senderName: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', marginBottom: 3 },
  msgText: { color: '#fff', fontSize: 14 },
  msgTime: { color: 'rgba(255,255,255,0.5)', fontSize: 10, textAlign: 'right', marginTop: 4 },
  inputRow: { flexDirection: 'row', padding: 10, backgroundColor: '#1e293b', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, backgroundColor: '#0f172a', color: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: '#0a66c2', borderRadius: 20, width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  sendText: { color: '#fff', fontSize: 18 },
});