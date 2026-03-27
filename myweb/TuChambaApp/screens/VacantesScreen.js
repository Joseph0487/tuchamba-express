import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';

export default function VacantesScreen({ recruiter }) {
    const [vacantes, setVacantes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const unsub = onValue(ref(db, 'jobs'), snap => {
            const data = snap.val() || {};
            const list = Object.entries(data)
                .map(([id, j]) => ({ id, ...j }))
                .sort((a, b) => {
                    const sa = a.status === 'No Vigente' ? 1 : 0;
                    const sb = b.status === 'No Vigente' ? 1 : 0;
                    return sa - sb;
                });
            setVacantes(list);
            setLoading(false);
            setRefreshing(false);
        });
        return () => unsub();
    }, []);

    const filtered = vacantes.filter(j => {
        const q = search.toLowerCase();
        return (
            j.title?.toLowerCase().includes(q) ||
            j.company?.toLowerCase().includes(q) ||
            j.city?.toLowerCase().includes(q) ||
            j.state?.toLowerCase().includes(q)
        );
    });

    const onRefresh = () => {
        setRefreshing(true);
    };

    // Vista detalle de vacante
    if (selected) {
        const isVigente = selected.status !== 'No Vigente';
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setSelected(null)}>
                        <Text style={styles.backBtn}>← Volver</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{selected.title}</Text>
                </View>
                <FlatList
                    data={[selected]}
                    keyExtractor={i => i.id}
                    renderItem={() => (
                        <View style={styles.detailContainer}>
                            <View style={[styles.statusBadge, { backgroundColor: isVigente ? '#e8f5e9' : '#ffebee' }]}>
                                <Text style={{ color: isVigente ? '#2e7d32' : '#c62828', fontWeight: '700', fontSize: 12 }}>
                                    {isVigente ? '🟢 Vigente' : '🔴 No Vigente'}
                                </Text>
                            </View>

                            <Text style={styles.detailTitle}>{selected.title}</Text>
                            <Text style={styles.detailCompany}>{selected.company}</Text>

                            <View style={styles.detailCard}>
                                <Text style={styles.detailRow}>📍 {selected.city}, {selected.state}</Text>
                                <Text style={styles.detailRow}>💰 {selected.salary || 'A convenir'}</Text>
                                <Text style={styles.detailRow}>🕒 {selected.schedule || 'Por definir'}</Text>
                            </View>

                            {selected.description ? <>
                                <Text style={styles.sectionTitle}>Descripción</Text>
                                <Text style={styles.detailText}>{selected.description}</Text>
                            </> : null}

                            {(selected.requirements || []).length > 0 ? <>
                                <Text style={styles.sectionTitle}>Requisitos</Text>
                                {selected.requirements.map((r, i) => (
                                    <Text key={i} style={styles.listItem}>• {r}</Text>
                                ))}
                            </> : null}

                            {(selected.benefits || []).length > 0 ? <>
                                <Text style={styles.sectionTitle}>Ofrecemos</Text>
                                {selected.benefits.map((b, i) => (
                                    <Text key={i} style={styles.listItem}>• {b}</Text>
                                ))}
                            </> : null}
                        </View>
                    )}
                />
            </View>
        );
    }

    // Vista lista de vacantes
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>💼 Vacantes</Text>
                <Text style={styles.headerSub}>{recruiter.name}</Text>
            </View>

            <TextInput
                style={styles.search}
                placeholder="🔍 Buscar vacante, empresa, ciudad..."
                value={search}
                onChangeText={setSearch}
                clearButtonMode="while-editing"
            />

            {loading ? <ActivityIndicator size="large" color="#0a66c2" style={{ marginTop: 40 }} /> :
                <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    renderItem={({ item }) => {
                        const isVigente = item.status !== 'No Vigente';
                        return (
                            <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                                    <View style={[styles.badge, { backgroundColor: isVigente ? '#e8f5e9' : '#ffebee' }]}>
                                        <Text style={{ color: isVigente ? '#2e7d32' : '#c62828', fontSize: 10, fontWeight: '700' }}>
                                            {isVigente ? '🟢' : '🔴'}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.cardCompany}>{item.company}</Text>
                                <Text style={styles.cardLocation}>📍 {item.city}, {item.state}</Text>
                                <Text style={styles.cardSalary}>💰 {item.salary || 'A convenir'}</Text>
                            </TouchableOpacity>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No hay vacantes</Text>
                        </View>
                    }
                />
            }
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { backgroundColor: '#0a66c2', padding: 16 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
    headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
    backBtn: { color: 'white', fontSize: 16, marginBottom: 4 },
    search: { backgroundColor: 'white', margin: 12, borderRadius: 10, padding: 12, fontSize: 14, borderWidth: 1, borderColor: '#eee' },
    card: { backgroundColor: 'white', margin: 10, marginTop: 0, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#222', flex: 1, marginRight: 8 },
    cardCompany: { fontSize: 13, color: '#0a66c2', marginTop: 4 },
    cardLocation: { fontSize: 12, color: '#666', marginTop: 4 },
    cardSalary: { fontSize: 13, color: '#d32f2f', fontWeight: '600', marginTop: 4 },
    badge: { borderRadius: 6, padding: 4 },
    empty: { alignItems: 'center', marginTop: 60 },
    emptyText: { color: '#aaa', fontSize: 15 },
    detailContainer: { padding: 20 },
    statusBadge: { alignSelf: 'flex-start', borderRadius: 8, padding: 6, marginBottom: 12 },
    detailTitle: { fontSize: 22, fontWeight: '800', color: '#222', marginBottom: 4 },
    detailCompany: { fontSize: 16, color: '#0a66c2', marginBottom: 16 },
    detailCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 16 },
    detailRow: { fontSize: 14, color: '#444', marginBottom: 6 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 8, marginTop: 8 },
    detailText: { fontSize: 14, color: '#444', lineHeight: 22 },
    listItem: { fontSize: 14, color: '#444', marginBottom: 4 },
});