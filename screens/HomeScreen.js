import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ChatsScreen from './ChatsScreen';
import VacantesScreen from './VacantesScreen';

export default function HomeScreen({ reclutador, onLogout }) {
  const [tab, setTab] = useState('chats');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hola, {reclutador.name.split(' ')[0]} 👋</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logout}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'chats' && styles.tabActive]}
          onPress={() => setTab('chats')}
        >
          <Text style={[styles.tabText, tab === 'chats' && styles.tabTextActive]}>💬 Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'vacantes' && styles.tabActive]}
          onPress={() => setTab('vacantes')}
        >
          <Text style={[styles.tabText, tab === 'vacantes' && styles.tabTextActive]}>📋 Vacantes</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {tab === 'chats' ? (
          <ChatsScreen reclutador={reclutador} />
        ) : (
          <VacantesScreen reclutador={reclutador} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 55, backgroundColor: '#1e293b' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  logout: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#0a66c2' },
  tabText: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#0a66c2' },
  content: { flex: 1 },
});