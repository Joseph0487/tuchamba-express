import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';

export default function VacantesScreen({ reclutador }) {
  const [vacantes, setVacantes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const jobsRef = ref(db, 'jobs');
    const unsub = onValue(jobsRef, (snapshot) => {
      if (!snapshot.exists()) { setVacantes([]); setLoading(false); return; }
      const data = snapshot.val();
      const mias = Object.entries(data)
        .filter(([id, j]) => j.recruiterCode === reclutador.code && j.status === 'active')
        .map(([id, j]) => ({ id, ...j }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setVacantes(mias);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <ActivityIndicator color="#0a66c2" style={{ marginTop: 40 }} />;

  if (vacantes.length === 0) return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>Sin vacantes activas</Text>
    </View>
  );

  return (
    <FlatList
      data={vacantes}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.company}>{item.company}</Text>
          {item.location && <Text style={styles.detail}>📍 {item.location}</Text>}
          {item.salary && <Text style={styles.detail}>💰 {item.salary}</Text>}
          {item.schedule && <Text style={styles.detail}>🕐 {item.schedule}</Text>}
          <View style={styles.footer}>
            <Text style={styles.date}>
              {item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-MX') : ''}
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(`https://tuchamba.com/vacante/${item.id}`)}>
              <Text style={styles.link}>Ver en portal →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      contentContainerStyle={{ padding: 12 }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 15 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 10 },
  title: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  company: { color: '#0a66c2', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  detail: { color: '#94a3b8', fontSize: 13, marginBottom: 3 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  date: { color: '#64748b', fontSize: 11 },
  link: { color: '#0a66c2', fontSize: 13, fontWeight: '600' },
});