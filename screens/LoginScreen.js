import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { db } from '../firebase';
import { ref, get, set } from 'firebase/database';

export default function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!usuario || !password) {
      Alert.alert('Error', 'Ingresa usuario y contraseña');
      return;
    }
    setLoading(true);
    try {
      const snapshot = await get(ref(db, 'recruiters'));
      if (!snapshot.exists()) {
        Alert.alert('Error', 'No se pudo conectar con la base de datos');
        setLoading(false);
        return;
      }
      const recruiters = snapshot.val();
      const match = Object.values(recruiters).find(
        r => r.code === usuario.trim().toUpperCase()
      );
      const passwordEsperada = `Express*${usuario.trim().toUpperCase()}`;
      if (match && password.trim() === passwordEsperada) {
        onLogin(match);
      } else {
        Alert.alert('Error', 'Usuario o contraseña incorrectos');
      }
    } catch (e) {
      Alert.alert('Error', 'Problema de conexión: ' + e.message);
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TuChamba</Text>
      <Text style={styles.subtitle}>Panel Reclutador</Text>
      <TextInput
        style={styles.input}
        placeholder="Usuario"
        placeholderTextColor="#aaa"
        value={usuario}
        onChangeText={setUsuario}
        autoCapitalize="none"
      />
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Contraseña"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
          <Image source={showPassword ? require('../assets/ocultar.png') : require('../assets/ver.png')} style={styles.eyeIcon} />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#0a66c2" style={{ marginTop: 20 }} />
      ) : (
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Entrar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 30 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#0a66c2', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#aaa', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: '#1e293b', color: '#fff', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 15 },
  button: { backgroundColor: '#0a66c2', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  passwordContainer: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 16, alignItems: 'center' },
  passwordInput: { flex: 1, color: '#fff', padding: 14, fontSize: 15 },
  eyeBtn: { padding: 14 },
  eyeIcon: { width: 22, height: 22, tintColor: '#aaa' },
});