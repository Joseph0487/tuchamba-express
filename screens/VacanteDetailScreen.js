import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';

export default function VacanteDetailScreen({ vacante, onBack }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{vacante.title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{vacante.title}</Text>
        <Text style={styles.company}>{vacante.company}</Text>

        {vacante.location && <Text style={styles.detail}>📍 {vacante.location}</Text>}
        {vacante.salary && <Text style={styles.detail}>💰 {vacante.salary}</Text>}
        {vacante.schedule && <Text style={styles.detail}>🕐 {vacante.schedule}</Text>}
        {vacante.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.sectionText}>{vacante.description}</Text>
          </View>
        )}
        {vacante.requirements && Array.isArray(vacante.requirements) && vacante.requirements.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Requisitos</Text>
            {vacante.requirements.map((r, i) => (
              <Text key={i} style={styles.listItem}>• {r}</Text>
            ))}
          </View>
        )}
        {vacante.benefits && Array.isArray(vacante.benefits) && vacante.benefits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Beneficios</Text>
            {vacante.benefits.map((b, i) => (
              <Text key={i} style={styles.listItem}>• {b}</Text>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={styles.portalBtn}
          onPress={() => Linking.openURL('https://tuchamba-express.vercel.app/')}>
          <Text style={styles.portalBtnText}>🌐 Ver en portal →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 14, paddingTop: 50, gap: 12 },
  back: { color: '#0a66c2', fontSize: 15, fontWeight: '600' },
  headerTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: 'bold' },
  content: { padding: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  company: { color: '#0a66c2', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  detail: { color: '#94a3b8', fontSize: 14, marginBottom: 6 },
  section: { marginTop: 16, backgroundColor: '#1e293b', borderRadius: 12, padding: 14 },
  sectionTitle: { color: '#0a66c2', fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  sectionText: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  listItem: { color: '#cbd5e1', fontSize: 13, lineHeight: 22 },
  portalBtn: { backgroundColor: '#0a66c2', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 24, marginBottom: 20 },
  portalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});