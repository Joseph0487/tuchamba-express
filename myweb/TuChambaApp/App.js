import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import LoginScreen from './screens/LoginScreen';
import VacantesScreen from './screens/VacantesScreen';
import ChatsScreen from './screens/ChatsScreen';

export default function App() {
    const [recruiter, setRecruiter] = useState(null);
    const [activeTab, setActiveTab] = useState('vacantes');

    if (!recruiter) {
        return <LoginScreen onLogin={(rec) => setRecruiter(rec)} />;
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar backgroundColor="#0a66c2" barStyle="light-content" />
            <View style={styles.content}>
                {activeTab === 'vacantes' && <VacantesScreen recruiter={recruiter} />}
                {activeTab === 'chats' && <ChatsScreen recruiter={recruiter} />}
            </View>
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'vacantes' && styles.tabActive]}
                    onPress={() => setActiveTab('vacantes')}>
                    <Text style={styles.tabIcon}>💼</Text>
                    <Text style={[styles.tabLabel, activeTab === 'vacantes' && styles.tabLabelActive]}>Vacantes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'chats' && styles.tabActive]}
                    onPress={() => setActiveTab('chats')}>
                    <Text style={styles.tabIcon}>💬</Text>
                    <Text style={[styles.tabLabel, activeTab === 'chats' && styles.tabLabelActive]}>Chats</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => { setRecruiter(null); setActiveTab('vacantes'); }}>
                    <Text style={styles.tabIcon}>🚪</Text>
                    <Text style={styles.tabLabel}>Salir</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    content: { flex: 1 },
    tabBar: { flexDirection: 'row', backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee', paddingBottom: 8 },
    tab: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
    tabActive: { borderTopWidth: 2, borderTopColor: '#0a66c2' },
    tabIcon: { fontSize: 22 },
    tabLabel: { fontSize: 11, color: '#aaa', marginTop: 2 },
    tabLabelActive: { color: '#0a66c2', fontWeight: '700' },
});