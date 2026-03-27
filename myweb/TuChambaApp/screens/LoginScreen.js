import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { db } from '../firebase';
import { ref, get } from 'firebase/database';

export default function LoginScreen({ onLogin }) {
    const [code, setCode] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        const codeLimpio = code.trim().toUpperCase();
        const passlimpio = pass.trim();

        if (!codeLimpio || !passlimpio) {
            Alert.alert('Error', 'Ingresa tu código y contraseña');
            return;
        }

        setLoading(true);
        try {
            const snap = await get(ref(db, 'recruiters'));
            const recruiters = snap.val() || {};
            const found = Object.values(recruiters).find(r => r.code === codeLimpio);

            if (!found) {
                Alert.alert('Error', `El código ${codeLimpio} no existe`);
                setLoading(false);
                return;
            }

            const expectedPass = `Express*${found.code}`;
            if (passlimpio !== expectedPass) {
                Alert.alert('Error', 'Contraseña incorrecta');
                setLoading(false);
                return;
            }

            onLogin(found);
        } catch (e) {
            Alert.alert('Error', 'No se pudo conectar. Verifica tu internet.');
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.card}>
                <Text style={styles.emoji}>🚀</Text>
                <Text style={styles.title}>TuChamba Express</Text>
                <Text style={styles.subtitle}>Panel Reclutador</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Código de reclutador (ej. JUAN)"
                    placeholderTextColor="#aaa"
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Contraseña"
                    placeholderTextColor="#aaa"
                    value={pass}
                    onChangeText={setPass}
                    secureTextEntry
                />

                <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Entrar al Panel</Text>}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a192d', justifyContent: 'center', padding: 24 },
    card: { backgroundColor: 'white', borderRadius: 20, padding: 28, alignItems: 'center' },
    emoji: { fontSize: 48, marginBottom: 8 },
    title: { fontSize: 24, fontWeight: '800', color: '#0a192d', marginBottom: 4 },
    subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
    input: { width: '100%', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14, color: '#222' },
    btn: { width: '100%', backgroundColor: '#0a66c2', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
    btnText: { color: 'white', fontWeight: '700', fontSize: 16 },
});