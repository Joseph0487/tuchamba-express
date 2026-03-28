import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { db } from '../firebase';
import { ref, get } from 'firebase/database';

export default function LoginScreen({ onLogin }) {
    const [code, setCode] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);

    const handleLogin = async () => {
        const codeLimpio = code.trim().toUpperCase();
        const passLimpio = pass.trim();
        if (!codeLimpio || !passLimpio) { Alert.alert('Error', 'Ingresa tu código y contraseña'); return; }
        setLoading(true);
        try {
            const snap = await get(ref(db, 'recruiters'));
            const recruiters = snap.val() || {};
            const found = Object.values(recruiters).find(r => r.code.toUpperCase() === codeLimpio);
            if (!found) { Alert.alert('Error', `El código ${codeLimpio} no existe`); setLoading(false); return; }
            const expectedPass = `Express*${found.code}`;
            if (passLimpio !== expectedPass) { Alert.alert('Error', 'Contraseña incorrecta'); setLoading(false); return; }
            onLogin(found);
        } catch(e) {
            Alert.alert('Error', 'No se pudo conectar. Verifica tu internet.');
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Text style={styles.emoji}>🚀</Text>
                    <Text style={styles.title}>TuChamba Express</Text>
                    <Text style={styles.subtitle}>Panel Reclutador</Text>

                    <Text style={styles.label}>Código de reclutador</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej. JUAN"
                        placeholderTextColor="#aaa"
                        value={code}
                        onChangeText={setCode}
                        autoCapitalize="characters"
                        returnKeyType="next"
                    />

                    <Text style={styles.label}>Contraseña</Text>
                    <View style={styles.passRow}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="••••••"
                            placeholderTextColor="#aaa"
                            value={pass}
                            onChangeText={setPass}
                            secureTextEntry={!showPass}
                            returnKeyType="done"
                            onSubmitEditing={handleLogin}
                        />
                        <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                            <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Entrar al Panel</Text>}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a192d' },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    card: { backgroundColor: 'white', borderRadius: 20, padding: 28, alignItems: 'center' },
    emoji: { fontSize: 48, marginBottom: 8 },
    title: { fontSize: 24, fontWeight: '800', color: '#0a192d', marginBottom: 4 },
    subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
    label: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 4 },
    input: { width: '100%', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14, color: '#222' },
    passRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 20, gap: 8 },
    eyeBtn: { padding: 8 },
    btn: { width: '100%', backgroundColor: '#0a66c2', borderRadius: 10, padding: 14, alignItems: 'center' },
    btnText: { color: 'white', fontWeight: '700', fontSize: 16 },
});