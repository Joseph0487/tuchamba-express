import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { db } from '../firebase';
import { ref, onValue, set, remove, get } from 'firebase/database';
import ChatDetailScreen from './ChatDetailScreen';

export default function ChatsScreen({ reclutador }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatActivo, setChatActivo] = useState(null);

  useEffect(() => {
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const chatsRef = ref(db, 'chats');
    const unsub = onValue(chatsRef, (snapshot) => {
      if (!snapshot.exists()) { setChats([]); setLoading(false); return; }
      const data = snapshot.val();
      const filtrados = Object.entries(data)
        .filter(([id, c]) =>
          (c.refCode || '').toUpperCase() === reclutador.code.toUpperCase() &&
          !c.archived &&
          (c.createdAt || 0) >= cutoff
        )
        .map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      setChats(filtrados);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function archivarChat(chatId) {
    Alert.alert(
      'Archivar conversación',
      '¿Archivar esta conversación? El candidato puede seguir escribiendo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Archivar', style: 'destructive', onPress: () => {
          set(ref(db, `chats/${chatId}/archived`), true);
        }}
      ]
    );
  }

  function borrarViejos() {
    Alert.alert(
      'Borrar conversaciones',
      '¿Borrar todas las conversaciones con más de 7 días? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: async () => {
          const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
          const snap = await get(ref(db, 'chats'));
          const all = snap.val() || {};
          const promises = [];
          let deleted = 0;
          Object.entries(all).forEach(([chatId, c]) => {
            if ((c.createdAt || 0) < cutoff) {
              promises.push(remove(ref(db, `chats/${chatId}`)));
              promises.push(remove(ref(db, `messages/${chatId}`)));
              deleted++;
            }
          });
          await Promise.all(promises);
          Alert.alert('Listo', `${deleted} conversación(es) eliminada(s)`);
        }}
      ]
    );
  }

  if (chatActivo) {
    return <ChatDetailScreen chat={chatActivo} reclutador={reclutador} onBack={() => setChatActivo(null)} />;
  }

  if (loading) return <ActivityIndicator color="#0a66c2" style={{ marginTop: 40 }} />;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.borrarBtn} onPress={borrarViejos}>
        <Text style={styles.borrarBtnText}>🗑️ Borrar conv. +7 días</Text>
      </TouchableOpacity>

      {chats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Sin conversaciones aún</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const diasRestantes = Math.max(0, 7 - Math.floor((Date.now() - (item.createdAt || 0)) / (1000 * 60 * 60 * 24)));
            const timeAgo = item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <TouchableOpacity style={styles.chatItem} onPress={() => setChatActivo(item)}>
                <View style={styles.chatInfo}>
                  <View style={styles.chatRow}>
                    <Text style={styles.candidateName}>👤 {item.candidateName}</Text>
                    {item.lastSenderType === 'candidate' && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Nuevo</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.vacantTitle} numberOfLines={1}>💼 {item.vacantTitle || 'Vacante'}</Text>
                  <View style={styles.chatMeta}>
                    <Text style={styles.phone}>📱 {item.candidatePhone}</Text>
                    <Text style={[styles.dias, diasRestantes <= 2 && styles.diasUrgente]}>⏳ {diasRestantes}d restantes</Text>
                  </View>
                  {timeAgo ? <Text style={styles.time}>{timeAgo}</Text> : null}
                </View>
                <TouchableOpacity style={styles.eliminarBtn} onPress={() => archivarChat(item.id)}>
                  <Text style={styles.eliminarText}>🗑️</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  borrarBtn: { margin: 12, marginBottom: 4, alignSelf: 'flex-end', backgroundColor: '#1e293b', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#334155' },
  borrarBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 15 },
  chatItem: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  chatInfo: { flex: 1 },
  chatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  candidateName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  vacantTitle: { color: '#94a3b8', fontSize: 13, marginBottom: 4 },
  chatMeta: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  phone: { color: '#64748b', fontSize: 12 },
  dias: { color: '#94a3b8', fontSize: 11 },
  diasUrgente: { color: '#ef4444' },
  time: { color: '#64748b', fontSize: 11, marginTop: 3 },
  badge: { backgroundColor: '#0a66c2', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  eliminarBtn: { padding: 8 },
  eliminarText: { fontSize: 18 },
});