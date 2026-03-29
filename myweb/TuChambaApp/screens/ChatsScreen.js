import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import ChatDetailScreen from './ChatDetailScreen';

export default function ChatsScreen({ reclutador }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatActivo, setChatActivo] = useState(null);

  useEffect(() => {
    const chatsRef = ref(db, 'chats');
    const unsub = onValue(chatsRef, (snapshot) => {
      if (!snapshot.exists()) { setChats([]); setLoading(false); return; }
      const data = snapshot.val();
      const filtrados = Object.entries(data)
        .filter(([id, c]) => c.refCode === reclutador.code)
        .map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      setChats(filtrados);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (chatActivo) {
    return <ChatDetailScreen chat={chatActivo} reclutador={reclutador} onBack={() => setChatActivo(null)} />;
  }

  if (loading) return <ActivityIndicator color="#0a66c2" style={{ marginTop: 40 }} />;

  if (chats.length === 0) return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>Sin conversaciones aún</Text>
    </View>
  );

  return (
    <FlatList
      data={chats}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.chatItem} onPress={() => setChatActivo(item)}>
          <View style={styles.chatInfo}>
            <Text style={styles.candidateName}>{item.candidateName}</Text>
            <Text style={styles.vacantTitle} numberOfLines={1}>{item.vacantTitle || 'Vacante'}</Text>
            <Text style={styles.phone}>📱 {item.candidatePhone}</Text>
          </View>
          {item.lastSenderType === 'candidate' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Nuevo</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
      contentContainerStyle={{ padding: 12 }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 15 },
  chatItem: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatInfo: { flex: 1 },
  candidateName: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  vacantTitle: { color: '#94a3b8', fontSize: 13, marginBottom: 2 },
  phone: { color: '#64748b', fontSize: 12 },
  badge: { backgroundColor: '#0a66c2', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
});